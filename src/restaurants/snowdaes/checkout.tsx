"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Loader2, Lock, StickyNote, Tag, X } from "lucide-react";
import { advance, openAt, type HoursPayload } from "@/pos/clover/hours";
import { describeModifiers } from "@/restaurants/snowdaes/menu";
import { SHOP } from "@/restaurants/snowdaes/shop";
import { formatPrice } from "@/restaurants/snowdaes/lib/format";
import { useCart, useCartHydrated } from "@/restaurants/snowdaes/lib/use-cart";
import { attemptKey, attemptScope, clearAttempt } from "@/restaurants/snowdaes/lib/attempt";
import {
  ASAP,
  groupByDay,
  LEAD_MINUTES,
  pickupLabel,
  pickupSlots,
} from "@/restaurants/snowdaes/lib/pickup-times";
import { CardFields, type CardHandle } from "@/restaurants/snowdaes/components/card-fields";
import { ItemVisual } from "@/restaurants/snowdaes/components/item-visual";
import { cn } from "@/restaurants/snowdaes/lib/utils";

/**
 * `/checkout` — the whole order, on a page of its own.
 *
 * ── WHY THIS IS NOT A DRAWER ANY MORE ────────────────────────────────────────
 *
 * Checkout used to be a panel that replaced the contents of the cart sheet: a
 * ~380px column holding the totals, four card iframes and a Pay button. That
 * worked while it was only "confirm and pay". It stops working the moment the
 * order needs decisions — a pickup time, a tip, a note for the kitchen — because
 * each one adds a block to a column that already had to scroll on a phone, with
 * the Pay button below the fold and the card fields squeezed between.
 *
 * A route also gives back three things a drawer cannot have: a URL to reload
 * without losing the order (which is why the cart is persisted now), a real
 * back button, and somewhere for a confirmation to live afterwards.
 *
 * ── CLOVER IS THE CALCULATOR ─────────────────────────────────────────────────
 *
 * The cart's totals are a preview. The moment this page has a cart it POSTs to
 * `/api/clover/checkout`, which builds the order on the merchant's account from
 * its own inventory prices and its own tax rates, and every figure shown from
 * then on is the one Clover returned. The customer is never quoted a number we
 * calculated. The tip is the single exception, and it is the customer's own
 * number rather than a computed one — it is charged beside Clover's total, not
 * folded into it (findings.md, step 09).
 *
 * ── WHY THE ORDER IS PRICED ONCE AND NEVER RE-PRICED ─────────────────────────
 *
 * Pricing on Clover means CREATING an order on the merchant's account. Unlike
 * Square's CalculateOrder, it is not free of consequence — every call leaves a
 * real object behind that somebody has to sweep. So this prices once, and the
 * tip is applied at payment rather than by re-pricing. Changing the tip must
 * never mint another order.
 */

interface CheckoutTotals {
  cloverOrderId: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

/** The rates on the button row, plus the always-present opt-out. */
const TIP_RATES = [0.15, 0.2, 0.25] as const;

type Phase = "pricing" | "ready" | "paying" | "error";

export function SnowdaesCheckout() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const promo = useCart((s) => s.promo);
  const clearCart = useCart((s) => s.clearCart);
  const previewSubtotal = useCart((s) => s.subtotal());
  const previewDiscount = useCart((s) => s.discount());
  const hydrated = useCartHydrated();

  const [phase, setPhase] = useState<Phase>("pricing");
  const [totals, setTotals] = useState<CheckoutTotals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardReady, setCardReady] = useState(false);

  const [code, setCode] = useState("");
  const [codeRejected, setCodeRejected] = useState(false);

  const [tipRate, setTipRate] = useState<number>(0.15);
  const [pickupAt, setPickupAt] = useState<string>(ASAP.value);
  const [note, setNote] = useState("");

  const [hours, setHours] = useState<HoursPayload | null>(null);
  const cardRef = useRef<CardHandle>(null);
  /** What the currently-displayed price was calculated FROM. See the effect. */
  const pricedRef = useRef<string | null>(null);
  /** The sessionStorage slot for this attempt, so payment can retire it. */
  const scopeRef = useRef<string>("");
  /** The order being replaced when a discount code forces a re-price. */
  const previousOrderRef = useRef<string | null>(null);

  const applyPromo = useCart((s) => s.applyPromo);
  const removePromo = useCart((s) => s.removePromo);

  /*
   * What this order's price depends on: the lines, and the discount code.
   *
   * Doubles as the guard for the pricing effect. Comparing against the last
   * priced signature is what makes re-pricing correct in both directions —
   * Strict Mode's double invoke produces the SAME signature and is skipped
   * (which matters, because each run creates a real Clover order), while
   * applying a code produces a different one and must re-price.
   */
  const signature = useMemo(
    () =>
      hydrated && items.length > 0
        ? attemptScope(
            items.map((i) => ({
              menuItemId: i.menuItem.id,
              quantity: i.quantity,
              modifiers: i.modifiers,
            })),
            promo?.code,
          )
        : null,
    [hydrated, items, promo],
  );

  /* ── 1. Price it on Clover ─────────────────────────────────────────────── */
  //
  // Runs once per distinct signature, NOT once per mount. A ref rather than a
  // `cancelled` flag: Strict Mode invokes this twice in development, and a flag
  // set by the first run's cleanup only suppresses the setState — the second
  // fetch still goes out and Clover still gets a second order. Guarding the
  // FETCH is the only version that works, and it must not also block the reply,
  // or the page hangs on "pricing" forever.
  useEffect(() => {
    // Nothing to price until the persisted cart has been read back, or there
    // would be a request for an empty order on every load.
    if (!signature || pricedRef.current === signature) return;
    pricedRef.current = signature;
    scopeRef.current = signature;
    setPhase("pricing");

    (async () => {
      try {
        const lines = items.map((i) => ({
          menuItemId: i.menuItem.id,
          quantity: i.quantity,
          modifiers: i.modifiers,
        }));

        const res = await fetch("/api/clover/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            items: lines,
            ...(promo ? { promoCode: promo.code } : {}),
            idempotencyKey: attemptKey(signature),
            /* Pricing again means Clover has created a second order; name the
               first so the server can delete it rather than leave it behind. */
            ...(previousOrderRef.current ? { replaces: previousOrderRef.current } : {}),
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? "Could not start checkout.");
          setPhase("error");
          return;
        }
        previousOrderRef.current = body.cloverOrderId;
        setError(null);
        setTotals(body);
        setPhase("ready");
      } catch {
        setError("Could not reach the shop. Check your connection.");
        setPhase("error");
      }
    })();
  }, [signature, items, promo]);

  /* ── 2. The shop's hours, for the pickup times ─────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/clover/hours")
      .then((r) => r.json())
      .then((payload: HoursPayload) => {
        if (!cancelled) setHours(payload);
      })
      .catch(() => {
        /* Silent. The picker falls back to ASAP, which is always valid — and a
           shop whose hours we cannot read is not a closed shop. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Slots are recomputed each minute so the list cannot go stale under someone
   * who is still typing a card. `advance` moves the shop's own anchor forward
   * rather than reading the visitor's clock, so a device set to the wrong time
   * cannot be offered a slot the shop is closed for.
   */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((m) => m + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const anchor = useMemo(
    () => (hours?.anchor ? advance(hours.anchor, elapsed) : null),
    [hours, elapsed],
  );
  const slots = useMemo(() => pickupSlots(hours?.week ?? [], anchor), [hours, anchor]);
  const groups = useMemo(() => groupByDay(slots), [slots]);
  const openState = useMemo(
    () => (hours && anchor ? openAt(hours.week, anchor.day, anchor.clock) : { open: null, detail: null }),
    [hours, anchor],
  );

  /*
   * ── "AS SOON AS POSSIBLE" IS ONLY HONEST WHILE SOMEONE IS THERE ────────────
   *
   * Offered when the shop is open, and when its hours could not be read at all
   * — an unknown schedule is not a closed shop, and ASAP is the option that is
   * always valid. It is NOT offered when we know the shop is shut: there is
   * nobody in the building, so the soonest real answer is the first slot after
   * they open, and that is what gets selected instead.
   */
  const canAsap = openState.open !== false;
  const soonest = slots[0] ?? null;

  /*
   * A slot the customer chose ten minutes ago can fall off the list while they
   * are still typing a card, and a shop can close under them. Derived rather
   * than corrected in an effect: the selection is only ever READ through this,
   * so a stale choice cannot be submitted even for the render in which it goes
   * stale, and there is no setState-during-effect cascade to pay for.
   *
   * The fallback follows the same rule as the options themselves — ASAP while
   * that is honest, otherwise the first slot the shop could actually manage.
   */
  /*
   * "The soonest we can do it" is ONE idea with two spellings: while the shop
   * is open it means as soon as possible, and while it is shut it means the
   * first slot after they unlock the door. Naming it once is what keeps the
   * first button and the selection from disagreeing — they were derived
   * separately, and a closed shop rendered "When they open · Tomorrow at 11am"
   * while marking the OTHER button as chosen.
   */
  const soonestValue = canAsap ? ASAP.value : (soonest?.value ?? ASAP.value);
  const pickup =
    pickupAt === ASAP.value
      ? soonestValue
      : slots.some((o) => o.value === pickupAt)
        ? pickupAt
        : soonestValue;

  const scheduled = pickup !== soonestValue;

  /* The finished phrase: what the kitchen ticket says, and what the
     confirmation shows. Resolved here because this is where the hours are. */
  const pickupPhrase = pickupLabel(pickup, slots);

  /*
   * The tip is a percentage of what the customer is actually paying for the
   * food — Clover's subtotal after any discount, plus Clover's tax. Tipping on
   * the cart's own preview would tip on a number the shop never charged.
   *
   * Integer cents everywhere below. The cart's getters are in dollars, which is
   * the one place a float can creep in, so it is converted once here.
   */
  const tipBaseCents = totals
    ? totals.subtotal - totals.discount + totals.tax
    : Math.round((previewSubtotal - previewDiscount) * 100);
  const tip = Math.round(tipBaseCents * tipRate);
  const totalCents = (totals?.total ?? tipBaseCents) + tip;

  /* ── 3. Tokenise, then pay ─────────────────────────────────────────────── */
  const pay = useCallback(async () => {
    if (!totals || !cardRef.current || phase === "paying") return;
    setPhase("paying");
    setError(null);

    try {
      const { token, error: cardError } = await cardRef.current.tokenize();
      if (!token) {
        // A card problem is not a network problem, and saying so sends people
        // to check their wifi instead of their card number. Per-field messages
        // are already rendered under the boxes; only a leftover lands here.
        if (cardError) setError(cardError);
        setPhase("ready");
        return;
      }

      const res = await fetch("/api/clover/checkout/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cloverOrderId: totals.cloverOrderId,
          source: token,
          tipCents: tip,
          note: note.trim(),
          pickup: pickupPhrase,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.paid) {
        // A decline is not a bug. Clover sends 402 with its own message, and a
        // retry must tokenise afresh — the token above is spent either way.
        setError(body.error ?? "The card was declined.");
        setPhase("ready");
        return;
      }

      /* Hand the confirmation everything it needs BEFORE clearing the cart.
         That page has no other source for it, and somebody who has just paid
         must never be shown an empty screen. */
      try {
        sessionStorage.setItem(
          `snowdaes.order.${body.cloverOrderId}`,
          JSON.stringify({
            amount: body.amount,
            tip: body.tip ?? tip,
            card: body.card ?? null,
            authCode: body.authCode ?? null,
            pickup: pickupPhrase,
            note: note.trim(),
            lines: items.map((i) => ({
              name: i.menuItem.name,
              quantity: i.quantity,
              detail: describeModifiers(i.menuItem, i.modifiers),
            })),
            at: Date.now(),
          }),
        );
      } catch {
        /* The confirmation degrades to the pickup code alone. */
      }

      // Order first: the attempt is over the instant it is paid, and leaving
      // the key behind lets an identical next cart collect this same paid order.
      clearAttempt(scopeRef.current);
      clearCart();
      router.push(`/order/${body.cloverOrderId}`);
    } catch {
      setError("Could not reach the shop. Your card was not charged.");
      setPhase("ready");
    }
  }, [totals, phase, tip, note, pickupPhrase, items, clearCart, router]);

  /* ── empty and loading states ──────────────────────────────────────────── */

  if (!hydrated) {
    // Deliberately blank rather than a spinner: hydration takes one tick, and a
    // spinner that flashes for 16ms is noise.
    return <main className="mx-auto w-full max-w-[560px] flex-1 px-5 py-10" aria-busy="true" />;
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col items-center justify-center gap-5 px-5 py-16 text-center">
        <h1 className="font-display text-[28px] font-semibold">Your order is empty</h1>
        <p className="max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground">
          Pick something from the menu and it will show up here.
        </p>
        <Link
          href="/"
          className="rounded-full bg-primary px-6 py-3.5 text-[15px] font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
        >
          Browse the menu
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[560px] flex-1 px-5 pt-4 pb-10">
      {/* min-h-11, not more padding: `py-2` on a 15px line box measured 38.5px
          tall at all twelve widths — under the 44px floor. The pills below use
          the same idiom, so the whole screen has one rule for hit height. */}
      <Link
        href="/"
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 py-2 text-[15px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
      >
        <ArrowLeft className="size-4" />
        Back to the menu
      </Link>

      <h1 className="mt-3 font-display text-[32px] leading-tight font-semibold">Checkout</h1>
      <p className="mt-1.5 text-[15px] text-muted-foreground">
        Pickup at Snowdaes {SHOP.pickupLocation}
      </p>

      {/* ── the order ───────────────────────────────────────────────────── */}
      <section className="mt-7" aria-labelledby="order-heading">
        <h2 id="order-heading" className="font-display text-[19px] font-semibold">
          Your order
        </h2>
        <ul className="mt-3 flex flex-col rounded-3xl border border-border bg-card px-4">
          {items.map((cartItem) => (
            <li
              key={cartItem.cartItemId}
              className="flex gap-3.5 border-b border-border py-4 last:border-b-0"
            >
              <ItemVisual
                item={cartItem.menuItem}
                className="size-[54px] shrink-0 rounded-full"
                px={80}
                sizes="54px"
              />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[16px] leading-snug font-semibold">
                  {cartItem.quantity > 1 && (
                    <span className="font-mono text-[14px] tabular-nums">
                      {cartItem.quantity}×{" "}
                    </span>
                  )}
                  {cartItem.menuItem.name}
                </p>
                <p className="mt-0.5 text-[14px] leading-relaxed text-muted-foreground">
                  {describeModifiers(cartItem.menuItem, cartItem.modifiers)}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[15px] tabular-nums">
                {formatPrice(cartItem.unitPrice * cartItem.quantity)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── pickup time ─────────────────────────────────────────────────── */}
      {/*
        Two decisions, not a wall of pills.

        A list of every quarter-hour for two days is 60-odd controls, and on a
        phone it buries the tip, the note and the card under a scroll of times
        that almost nobody changes. So the common answer is one tap, and
        choosing a specific time reveals a native <select> — which on a phone
        is the OS's own wheel picker, keyboard-navigable and screen-reader
        correct for free, and which no custom listbox does better.

        `<optgroup>` carries the day, so "11:00am" is never ambiguous about
        whether it means today or tomorrow.
      */}
      <section className="mt-7" aria-labelledby="pickup-heading">
        <h2
          id="pickup-heading"
          className="flex items-center gap-2 font-display text-[19px] font-semibold"
        >
          <Clock className="size-[18px] text-muted-foreground" />
          Pickup time
        </h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {openState.open === false
            ? soonest
              ? `Closed right now. The soonest they can have it ready is ${pickupLabel(soonest.value, slots).toLowerCase()}.`
              : "The shop is closed right now."
            : `Ready about ${LEAD_MINUTES} minutes after you order.`}
        </p>

        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="pickup-heading">
          {/* When the shop is shut this is the soonest REAL moment, not "asap" —
              there is nobody there to make it sooner. */}
          <button
            type="button"
            role="radio"
            aria-checked={!scheduled}
            onClick={() => setPickupAt(canAsap ? ASAP.value : (soonest?.value ?? ASAP.value))}
            disabled={!canAsap && !soonest}
            className={cn(
              "min-h-11 rounded-full border px-4 py-2.5 text-[15px] transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink",
              "disabled:cursor-not-allowed disabled:opacity-45",
              !scheduled
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "border-border bg-card hover:border-primary",
            )}
          >
            {canAsap
              ? ASAP.label
              : soonest
                ? `When they open · ${pickupLabel(soonest.value, slots)}`
                : "As soon as possible"}
          </button>

          {/* Only offered when there is genuinely something else to choose. */}
          {slots.length > (canAsap ? 0 : 1) && (
            <button
              type="button"
              role="radio"
              aria-checked={scheduled}
              onClick={() => {
                /* Default to a slot that is NOT the one the first button already
                   represents, so pressing this always visibly does something. */
                const first = canAsap ? slots[0] : slots[1];
                setPickupAt(first?.value ?? ASAP.value);
              }}
              className={cn(
                "min-h-11 rounded-full border px-4 py-2.5 text-[15px] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink",
                scheduled
                  ? "border-primary bg-primary font-semibold text-primary-foreground"
                  : "border-border bg-card hover:border-primary",
              )}
            >
              Pick a time
            </button>
          )}
        </div>

        {scheduled && (
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Collect at
            </span>
            <select
              value={pickup}
              onChange={(e) => setPickupAt(e.target.value)}
              /* text-base (16px), not 15px: iOS Safari zooms the whole viewport
                 when a focused control is under 16px, and it does not zoom back
                 out. The discount input below was already 16px for this reason;
                 this and the note were the two that had been missed. */
              className={cn(
                "w-full min-h-11 rounded-2xl border border-border bg-card px-4 py-3 text-base outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink",
              )}
            >
              {groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.slots.map((slot) => (
                    <option key={slot.value} value={slot.value}>
                      {slot.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}

        {slots.length === 0 && openState.open !== false && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            No later slots available.
          </p>
        )}
      </section>

      {/* ── note for the kitchen ────────────────────────────────────────── */}
      <section className="mt-7">
        <label htmlFor="kitchen-note" className="flex items-center gap-2 font-display text-[19px] font-semibold">
          <StickyNote className="size-[18px] text-muted-foreground" />
          Notes for the kitchen
        </label>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Allergies, sweetness, anything they should know. Optional.
        </p>
        <textarea
          id="kitchen-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={400}
          placeholder="Less ice, please"
          /* text-base (16px) for the same reason as the pickup select above —
             and it matters most here: this is the allergy field, so it is the
             one a customer is most likely to tap and type into. */
          className={cn(
            "mt-3 w-full resize-y rounded-2xl border border-border bg-card px-4 py-3 text-base leading-relaxed outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink",
          )}
        />
        <p className="mt-1 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
          {note.length}/400
        </p>
      </section>

      {/* ── tip ─────────────────────────────────────────────────────────── */}
      <section className="mt-4" aria-labelledby="tip-heading">
        <h2 id="tip-heading" className="font-display text-[19px] font-semibold">
          Add a tip
        </h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Goes to the people who made it.
        </p>
        {/*
          ── A GRID, BECAUSE flex-wrap + flex-1 IS TWO RULES FIGHTING ──────────

          This was `flex flex-wrap gap-2` with `flex-1` on the three rates and
          nothing on "None", and it produced THREE different layouts across the
          phone range. Wrapping decides how many buttons fit on a line using
          each one's content width, and only then does flex-1 grow whichever
          ones landed there — so the two rules disagree about what a row is.

          Measured, before: 320/360/375 wrapped 2+2 and stretched "25%" to
          202/242/257px beside a 70px "None"; 390–430 fitted three and dropped
          "None" alone onto a second line; 480+ fitted all four. The break sits
          between 375 and 390, so an iPhone SE and an iPhone 15 disagreed.

          A grid states the row instead of inferring it: four equal cells, one
          shape on every phone. It goes to four across only at `sm`, by which
          point the column has already hit its 560px cap, so that breakpoint is
          the only one and no phone is near it.
        */}
        <div
          className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
          role="radiogroup"
          aria-labelledby="tip-heading"
        >
          {TIP_RATES.map((rate) => (
            <button
              key={rate}
              type="button"
              role="radio"
              aria-checked={tipRate === rate}
              onClick={() => setTipRate(rate)}
              className={cn(
                "min-h-11 rounded-full border px-4 py-2.5 text-[15px] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink",
                tipRate === rate
                  ? "border-primary bg-primary font-semibold text-primary-foreground"
                  : "border-border bg-card hover:border-primary",
              )}
            >
              {Math.round(rate * 100)}%
              {/* opacity-80, not 70. theme.css notes that dark ink clears AA on
                  the brand orange, and it does — 7.66:1 at full strength. The
                  opacity modifier is what was missed: at 70% the ink composites
                  to #5c3a16 against #f5901e, which is 4.29:1 and under the 4.5:1
                  floor for 13px text. 80% measures 5.35:1 on the selected pill
                  and 9.64:1 on an unselected one, keeping the de-emphasis. */}
              <span className="ml-1.5 font-mono text-[13px] tabular-nums opacity-80">
                {formatPrice(Math.round(tipBaseCents * rate) / 100)}
              </span>
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={tipRate === 0}
            onClick={() => setTipRate(0)}
            className={cn(
              "min-h-11 rounded-full border px-4 py-2.5 text-[15px] transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink",
              tipRate === 0
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "border-border bg-card hover:border-primary",
            )}
          >
            None
          </button>
        </div>
      </section>

      {/* ── discount code ───────────────────────────────────────────────── */}
      {/*
        Lives here rather than in the cart drawer, because this is the only
        screen that can show what a code actually did. In the drawer the effect
        of a code was a guess — our own preview arithmetic — and the real figure
        did not appear until a screen later. Here it goes to Clover, which
        applies the discount BEFORE tax (measured), and the number that comes
        back is the number charged.

        The cost is honest and paid for in the effect above: applying a code
        re-prices, and re-pricing on Clover creates another order, so the one it
        replaces is deleted server-side.
      */}
      <section className="mt-7" aria-labelledby="promo-heading">
        <h2 id="promo-heading" className="font-display text-[19px] font-semibold">
          Discount code
        </h2>
        {promo ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-primary bg-primary/5 px-4 py-3">
            <span className="flex min-w-0 items-center gap-2.5">
              {/* brand-ink, not primary: theme.css keeps the bright fill for
                  fills and brand-ink for anything small on a light ground. The
                  orange is 2.36:1 on card — under even the 3:1 non-text floor. */}
              <Tag className="size-4 shrink-0 text-brand-ink" />
              <span className="min-w-0">
                <span className="block font-mono text-[13px] tracking-wide uppercase">
                  {promo.code}
                </span>
                <span className="block truncate text-[13px] text-muted-foreground">
                  {promo.label}
                </span>
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                removePromo();
                setCodeRejected(false);
              }}
              aria-label={`Remove code ${promo.code}`}
              className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!code.trim()) return;
              const ok = applyPromo(code);
              setCodeRejected(!ok);
              if (ok) setCode("");
            }}
          >
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeRejected(false);
              }}
              placeholder="Have a code?"
              autoCapitalize="characters"
              autoComplete="off"
              aria-label="Discount code"
              aria-invalid={codeRejected}
              aria-describedby={codeRejected ? "promo-error" : undefined}
              className={cn(
                "min-w-0 flex-1 rounded-full border bg-card px-4 py-3 text-base outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink",
                codeRejected ? "border-destructive" : "border-border",
              )}
            />
            <button
              type="submit"
              disabled={!code.trim() || phase === "paying"}
              className="shrink-0 rounded-full border border-border px-5 text-[15px] font-medium transition-colors hover:border-primary disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
            >
              Apply
            </button>
          </form>
        )}
        {codeRejected && (
          <p id="promo-error" role="alert" className="mt-2 text-[13px] text-destructive">
            That code isn’t recognised.
          </p>
        )}
      </section>

      {/* ── totals ──────────────────────────────────────────────────────── */}
      <section className="mt-7 rounded-3xl border border-border bg-card px-5 py-4">
        {phase === "pricing" ? (
          <p className="flex items-center gap-2.5 py-2 text-[15px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Confirming the price with the shop…
          </p>
        ) : (
          <dl className="flex flex-col gap-2 font-mono text-[15px] tabular-nums">
            <div className="flex justify-between text-muted-foreground">
              <dt>Subtotal</dt>
              <dd>{formatPrice((totals?.subtotal ?? Math.round(previewSubtotal * 100)) / 100)}</dd>
            </div>
            {/* brand-ink, not primary. This row is the only place a customer
                ever sees what their code was worth, and the bright fill reads
                2.36:1 on the card — brand-ink is 5.02:1. theme.css spells the
                rule out; this line predates the move and had missed it. */}
            {(totals?.discount ?? 0) > 0 && (
              <div className="flex justify-between text-brand-ink">
                <dt>{promo?.code ?? "Discount"}</dt>
                <dd>−{formatPrice((totals?.discount ?? 0) / 100)}</dd>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <dt>Tax</dt>
              <dd>{totals ? formatPrice(totals.tax / 100) : "—"}</dd>
            </div>
            {tip > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <dt>Tip</dt>
                <dd>{formatPrice(tip / 100)}</dd>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-border pt-3 text-[17px] font-semibold text-foreground">
              <dt>Total</dt>
              <dd>{formatPrice(totalCents / 100)}</dd>
            </div>
          </dl>
        )}
      </section>

      {/* ── payment ─────────────────────────────────────────────────────── */}
      <section className="mt-7" aria-labelledby="payment-heading">
        <h2 id="payment-heading" className="font-display text-[19px] font-semibold">
          Payment
        </h2>
        <div className="mt-3">
          <CardFields
            ref={cardRef}
            onReady={() => setCardReady(true)}
            onError={(message) => {
              setError(message);
              setPhase("error");
            }}
          />
        </div>

        {error && (
          <p role="alert" className="mt-4 text-[14px] text-destructive">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={pay}
          disabled={phase !== "ready" || !cardReady}
          className={cn(
            "mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-[15px] font-semibold text-primary-foreground",
            "transition-transform active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink",
          )}
        >
          {phase === "paying" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Paying…
            </>
          ) : (
            <>
              <Lock className="size-4" />
              Pay {formatPrice(totalCents / 100)}
            </>
          )}
        </button>

        <p className="mt-2.5 text-center font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          Card handled by Clover · never touches this site
        </p>
      </section>
    </main>
  );
}
