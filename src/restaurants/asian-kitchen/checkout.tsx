"use client";

/**
 * `/checkout` — pickup only.
 *
 * ── WHY THERE IS NO DELIVERY TOGGLE ──────────────────────────────────────────
 *
 * The design this was built from had a `[ Pickup ] [ Delivery ]` switcher at the
 * top, on the premise that Square's On-Demand Delivery would dispatch a
 * DoorDash courier for us. It does not: Square staff say On-Demand Delivery is
 * Square Online only and the Orders API's `DELIVERY` fulfillment does not
 * trigger it (`docs/SQUARE-PAYMENTS.md` §1). Delivery here means integrating
 * DoorDash Drive directly, and the prior question — whether an Orders API order
 * reaches the kitchen at all — is still unanswered (§8).
 *
 * So the fulfillment is a statement, not a choice. A switcher with one working
 * option is worse than no switcher.
 *
 * ── THE NUMBERS ON THIS PAGE ARE SQUARE'S ────────────────────────────────────
 *
 * Every total comes from `POST /api/square/checkout`, which is `CalculateOrder`
 * — Square's own arithmetic, creating nothing. The cart's own figure is shown
 * only until the first response lands, and is labelled as an estimate while it
 * is. We never add up tax (AGENTS.md invariant 4).
 *
 * Because calculating is free of consequence on Square, the page re-prices on
 * every tip change. The Clover version could not do this: pricing there meant
 * creating an order, and every one of those had to be swept up afterwards.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RESTAURANT } from "./config";
import { clearCart, toRequestLines, useStoredCart } from "./cart";
import { formatPhone, isCompletePhone, phoneDigitsRemaining } from "./lib-phone";

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

interface Priced {
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  lines: Array<{ name: string; quantity: string; totalCents: number; modifiers: string[] }>;
}

/** The tip rates on the button row, plus the always-present opt-out. */
const TIP_RATES = [0.15, 0.2, 0.25] as const;

interface SquareCard {
  attach(selector: string): Promise<void>;
  tokenize(): Promise<{ status: string; token?: string; errors?: Array<{ message?: string }> }>;
}
interface SquarePayments {
  card(): Promise<SquareCard>;
}
declare global {
  interface Window {
    Square?: { payments(appId: string, locationId: string): SquarePayments };
  }
}

export function Checkout() {
  const cart = useStoredCart();
  const router = useRouter();
  const [priced, setPriced] = useState<Priced | null>(null);
  const [tipRate, setTipRate] = useState<number>(0.2);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  /* Errors appear on blur, not on the first keystroke. Telling someone their
     name is invalid while they are still typing the first letter of it is the
     single most irritating thing a form can do. */
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  /* Set when Pay is pressed with something invalid. The button stays ENABLED
     until then — a disabled button is a dead end that says nothing about why,
     and the Web Interface Guidelines are explicit that submit stays live until
     the request starts. Pressing it validates and moves focus to the problem. */
  const [attempted, setAttempted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const [card, setCard] = useState<SquareCard | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* One key per checkout ATTEMPT, minted once and kept for the life of the
     page. Square requires it, and it is what makes a double tap, a retry on a
     stalled connection and a Strict Mode double-invoke all land on one order.
     Deliberately NOT derived from the cart: two strangers ordering the same
     plate a minute apart would hash identically.
     A lazy useState rather than a ref written during render — writing a ref
     mid-render is exactly what React 19 flags, and this value is never
     rendered, so there is nothing for hydration to disagree about. */
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  /** Preview only, and labelled as such until Square answers. */
  const previewCents = useMemo(
    () => Math.round((cart ?? []).reduce((s, l) => s + l.price, 0) * 100),
    [cart],
  );

  const baseForTip = priced ? priced.subtotalCents + priced.taxCents : previewCents;
  const tipCents = Math.round(baseForTip * tipRate);

  /* Re-price whenever the cart or the tip changes. Free on Square: this is
     CalculateOrder and it persists nothing. */
  useEffect(() => {
    if (!cart || cart.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/square/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lines: toRequestLines(cart), tipCents }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not price this order.");
          return;
        }
        setError(null);
        setPriced(data as Priced);
      } catch {
        if (!cancelled) setError("Could not reach the shop. Check your connection.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cart, tipCents]);

  /* Square's card form. Loaded from their CDN because the SDK must serve the
     iframe that holds the PAN — that isolation is the entire point, and is why
     our server never sees a card number. */
  useEffect(() => {
    if (!cart || cart.length === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/square/config");
        if (!res.ok) {
          setCardError("Card payment is not configured on this deployment.");
          return;
        }
        const cfg = (await res.json()) as {
          applicationId: string;
          locationId: string;
          environment: string;
        };

        const src =
          cfg.environment === "production"
            ? "https://web.squarecdn.com/v1/square.js"
            : "https://sandbox.web.squarecdn.com/v1/square.js";

        if (!window.Square) {
          await new Promise<void>((resolve, reject) => {
            const el = document.createElement("script");
            el.src = src;
            el.onload = () => resolve();
            el.onerror = () => reject(new Error("sdk"));
            document.head.appendChild(el);
          });
        }
        if (cancelled || !window.Square) return;

        const payments = window.Square.payments(cfg.applicationId, cfg.locationId);
        const c = await payments.card();
        await c.attach("#ak-card");
        if (!cancelled) setCard(c);
      } catch {
        if (!cancelled) setCardError("Could not load the card form.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cart]);

  /*
   * Mirrors `pos/square/request.ts` deliberately.
   *
   * The server is the authority — it rejects the same things with the same
   * bounds, and it has to, because a form is not a security boundary. This
   * exists so the customer finds out before they have typed a card number,
   * not after.
   */
  const nameError = name.trim() ? null : "We need a name to call your order.";
  const contactError =
    phone.trim() || email.trim()
      ? null
      : "Add a mobile or an email so the shop can reach you.";
  /*
   * "One more digit" beats "invalid number".
   *
   * A count is actionable — it tells you the number is nearly right and how
   * near — where a generic rejection makes you re-read all ten from the top.
   */
  const missingDigits = phone.trim() ? phoneDigitsRemaining(phone) : 0;
  const phoneError = !phone.trim()
    ? null
    : isCompletePhone(phone)
      ? null
      : missingDigits > 0
        ? `${missingDigits} more ${missingDigits === 1 ? "digit" : "digits"} to go.`
        : "That number has too many digits.";

  /* Light on purpose. Strict email validation rejects real people — plus
     addressing, new TLDs — and the cost of a wrong address here is one unsent
     receipt, not a wrong charge. Enough shape to catch a slip. */
  const emailError =
    email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
      ? "That email is missing something — check for a typo."
      : null;

  const detailsValid = !nameError && !contactError && !phoneError && !emailError;

  /* Shown once the field has been left OR once Pay has been pressed. Errors on
     the first keystroke are the most irritating thing a form does. */
  const showNameError = (touched.name || attempted) && !!nameError;
  const showContactError = (touched.contact || attempted) && !!contactError;

  const pay = useCallback(async () => {
    if (!card || !cart || paying) return;

    /* Validate on press, then send focus to the first field at fault — a
       customer who has scrolled to the bottom should not have to hunt back up
       the page to find out which box is the problem. */
    if (!detailsValid) {
      setAttempted(true);
      const target = nameError
        ? nameRef.current
        : phoneError
          ? phoneRef.current
          : emailError
            ? emailRef.current
            : phoneRef.current;
      target?.focus();
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    setPaying(true);
    setError(null);
    try {
      /*
       * Tokenizing is a separate failure domain from paying, and conflating
       * them produces a lie. An invalid card reported as "could not reach the
       * shop" sends the customer to check their wifi instead of their card
       * number — which is what this code did until someone testing it saw both
       * messages at once.
       */
      let result: Awaited<ReturnType<typeof card.tokenize>>;
      try {
        result = await card.tokenize();
      } catch (e) {
        setError(
          e instanceof Error && e.message
            ? `Card entry failed: ${e.message}`
            : "Card entry failed. Reload the page and try again.",
        );
        setPaying(false);
        return;
      }

      if (result.status !== "OK" || !result.token) {
        /* Square returns an array; showing only the first hides "and the
           postcode is wrong too", which is the second thing they need to fix. */
        const messages = (result.errors ?? []).map((x) => x.message).filter(Boolean);
        setError(messages.length > 0 ? messages.join(" ") : "Please check the card details.");
        setPaying(false);
        return;
      }

      const res = await fetch("/api/square/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lines: toRequestLines(cart),
          tipCents,
          sourceId: result.token,
          idempotencyKey,
          /*
           * Passed through to Square, where they land on the payment record.
           *
           * NOT because anything is sent to them — nothing is. There is no SMS
           * integration and Square's API reference does not promise a receipt
           * email for `buyer_email_address`, so the labels above deliberately
           * promise neither. What this does buy is a merchant who can see who
           * an order belongs to from their own dashboard.
           */
          customer: { name: name.trim(), phone: phone.trim(), email: email.trim() },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "The payment did not go through.");
        setPaying(false);
        return;
      }

      /* Hand the confirmation everything it needs BEFORE clearing the cart —
         the order page has no other source for it, and a customer who has just
         paid must never see an empty screen. */
      try {
        sessionStorage.setItem(
          `ak.order.${data.orderId}`,
          JSON.stringify({ ...data, name, phone, email, at: Date.now() }),
        );
      } catch {
        /* The confirmation degrades to the order number alone. */
      }
      clearCart();
      router.push(`/order/${data.orderId}`);
    } catch {
      /* Only reachable now if the fetch to our own server failed — which is
         genuinely a connectivity problem, so the message is finally true. */
      setError("Could not reach the shop. Your card has not been charged.");
      setPaying(false);
    }
  }, [card, cart, tipCents, name, phone, email, paying, idempotencyKey, router,
      detailsValid, nameError, phoneError, emailError]);

  if (cart === null) {
    return <main className="ak-checkout" aria-busy="true" />;
  }

  if (cart.length === 0) {
    return (
      <main className="ak-checkout">
        <h1 className="ak-co-title">Your order is empty</h1>
        <p className="ak-co-sub">Nothing to check out yet.</p>
        <Link className="ak-btn" href="/">
          Back to the menu
        </Link>
      </main>
    );
  }

  const showing = priced;
  const totalCents = showing ? showing.totalCents : previewCents + tipCents;

  return (
    <main className="ak-checkout">
      <Link className="ak-co-back" href="/">
        ← Menu
      </Link>

      <h1 className="ak-co-title">Checkout</h1>

      <p className="ak-co-pill">Pickup at {RESTAURANT.address}</p>
      {/* &nbsp;, not a \u escape: this is JSX TEXT, not a string literal, so a
          backslash escape renders as the six characters you typed. */}
      <p className="ak-co-sub">Ready in 15–20&nbsp;minutes</p>

      {/* No map here, deliberately — it lives on the confirmation instead.
          At checkout the customer has already decided where they are going and
          is trying to pay; an embedded map is a third-party iframe and a large
          paint pushing the card form further down a phone screen. Directions
          are what you want AFTER the order is placed, on the way to collect it,
          which is where <PickupMap /> now appears alone. The address itself is
          still stated above, in the pickup pill. */}

      <section className="ak-co-card" aria-labelledby="ak-co-items">
        <h2 id="ak-co-items" className="ak-co-h">
          Your order
        </h2>
        <ul className="ak-co-lines">
          {(showing?.lines ?? []).map((l, i) => (
            <li key={i} className="ak-co-line">
              <span className="ak-co-line-name">
                {l.quantity !== "1" ? `${l.quantity}× ` : ""}
                {l.name}
                {l.modifiers.length > 0 && (
                  <span className="ak-co-line-mods">{l.modifiers.join(" · ")}</span>
                )}
              </span>
              <span className="ak-co-line-price">{money(l.totalCents)}</span>
            </li>
          ))}
          {!showing &&
            cart.map((l, i) => (
              <li key={i} className="ak-co-line">
                <span className="ak-co-line-name">{l.label}</span>
                <span className="ak-co-line-price">{money(Math.round(l.price * 100))}</span>
              </li>
            ))}
        </ul>
      </section>

      <section className="ak-co-card" aria-labelledby="ak-co-you">
        <h2 id="ak-co-you" className="ak-co-h">
          Who is collecting
        </h2>

        <label className="ak-co-field">
          <span className="ak-co-label">
            Name
            <em className="ak-co-flag">Required</em>
          </span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            type="text"
            autoComplete="name"
            placeholder="Who we call at the counter"
            /* aria-invalid and aria-describedby, not just red text: a screen
               reader gets nothing from a colour change. */
            aria-invalid={showNameError}
            aria-describedby={showNameError ? "ak-err-name" : undefined}
          />
          {showNameError && (
            <span id="ak-err-name" className="ak-co-fielderr">
              {nameError}
            </span>
          )}
        </label>

        {/*
          NOT "optional", and not two equal fields either.

          They are conditionally required — one of the pair — so marking either
          "Optional" would be false and marking both "Required" false the other
          way. And they are not peers: this is a pickup counter, so the phone is
          the OPERATIONAL field, the one the shop uses to say the bag is ready.
          Email is for the receipt.

          So the rule is stated once, on the group, and each field carries its
          purpose immediately after its own label rather than floated to the far
          right where it read as a detached third column.
        */}
        <div className="ak-co-group">
          <p className="ak-co-grouphead">
            <span>How we reach you</span>
            <em>Add at least one</em>
          </p>

          <label className="ak-co-field">
            <span className="ak-co-label">
              Mobile
              <em className="ak-co-purpose">in case the shop needs to call</em>
            </span>
            <input
              ref={phoneRef}
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              onBlur={() => setTouched((t) => ({ ...t, contact: true }))}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              spellCheck={false}
              placeholder="(205) 555-0143"
              maxLength={20}
              aria-invalid={showContactError || !!(touched.contact && phoneError)}
              aria-describedby={touched.contact && phoneError ? "ak-err-phone" : undefined}
            />
            {touched.contact && phoneError && (
              <span id="ak-err-phone" className="ak-co-fielderr">
                {phoneError}
              </span>
            )}
          </label>

          <label className="ak-co-field">
            <span className="ak-co-label">
              Email
              <em className="ak-co-purpose">goes on your receipt</em>
            </span>
            <input
              ref={emailRef}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, contact: true }))}
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              placeholder="you@example.com"
              aria-invalid={showContactError || !!(touched.contact && emailError)}
              aria-describedby={touched.contact && emailError ? "ak-err-email" : undefined}
            />
            {touched.contact && emailError && (
              <span id="ak-err-email" className="ak-co-fielderr">
                {emailError}
              </span>
            )}
          </label>
        </div>

        {showContactError && <span className="ak-co-fielderr">{contactError}</span>}
      </section>

      <section className="ak-co-card" aria-labelledby="ak-co-tip">
        <h2 id="ak-co-tip" className="ak-co-h">
          Tip
        </h2>
        <div className="ak-co-tips" role="group" aria-label="Tip amount">
          {TIP_RATES.map((r) => (
            <button
              key={r}
              type="button"
              className="ak-co-tip"
              aria-pressed={tipRate === r}
              onClick={() => setTipRate(r)}
            >
              {Math.round(r * 100)}%
            </button>
          ))}
          <button
            type="button"
            className="ak-co-tip"
            aria-pressed={tipRate === 0}
            onClick={() => setTipRate(0)}
          >
            None
          </button>
        </div>
      </section>

      <section className="ak-co-card" aria-labelledby="ak-co-total">
        <h2 id="ak-co-total" className="ak-co-h">
          Total
        </h2>
        <dl className="ak-co-totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{money(showing ? showing.subtotalCents : previewCents)}</dd>
          </div>
          <div>
            <dt>Tax</dt>
            <dd>{showing ? money(showing.taxCents) : "—"}</dd>
          </div>
          <div>
            <dt>Tip</dt>
            <dd>{money(tipCents)}</dd>
          </div>
          <div className="ak-co-grand">
            <dt>Total</dt>
            <dd>{money(totalCents)}</dd>
          </div>
        </dl>
        <p className="ak-co-note">
          {showing ? "Confirmed by Square at checkout" : "Estimate — confirming with Square…"}
        </p>
      </section>

      <section className="ak-co-card" aria-labelledby="ak-co-pay">
        <h2 id="ak-co-pay" className="ak-co-h">
          Payment
        </h2>
        {cardError ? (
          <p className="ak-co-error">{cardError}</p>
        ) : (
          <div id="ak-card" className="ak-co-cardbox" />
        )}
        {error && (
          <p className="ak-co-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="ak-btn ak-co-pay"
          disabled={!card || paying || !showing}
          onClick={pay}
        >
          {paying ? "Taking payment…" : `Pay ${money(totalCents)}`}
        </button>
        {/* Announced, not just shown: someone using a screen reader gets nothing
            from text that quietly appears under a button they just pressed. */}
        <p className="ak-co-note" aria-live="polite">
          {attempted && !detailsValid
            ? (nameError ?? contactError ?? phoneError ?? emailError)
            : ""}
        </p>
      </section>
    </main>
  );
}
