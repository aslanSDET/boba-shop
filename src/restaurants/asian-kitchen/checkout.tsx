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

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RESTAURANT } from "./config";
import { clearCart, toRequestLines, useStoredCart } from "./cart";

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

  const pay = useCallback(async () => {
    if (!card || !cart || paying) return;
    setPaying(true);
    setError(null);
    try {
      const result = await card.tokenize();
      if (result.status !== "OK" || !result.token) {
        setError(result.errors?.[0]?.message ?? "Please check the card details.");
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
          note: [name, phone].filter(Boolean).join(" · ").slice(0, 100),
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
      setError("Could not reach the shop. Your card has not been charged.");
      setPaying(false);
    }
  }, [card, cart, tipCents, name, phone, email, paying, idempotencyKey, router]);

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
      <p className="ak-co-sub">Ready in 15–20 minutes</p>

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
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label className="ak-co-field">
          <span>Mobile</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
          />
        </label>
        <label className="ak-co-field">
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputMode="email"
            autoComplete="email"
          />
        </label>
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
      </section>
    </main>
  );
}
