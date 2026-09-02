"use client";

/**
 * `/order/[id]` — what someone sees the moment after they have paid.
 *
 * The design brief asked for a large pickup number, a map pin and a
 * click-to-call. Two of those are buildable today; the third is not, and the
 * reason matters more than the gap:
 *
 * **There is no phone number.** `config.ts` records `phone: null` with a note
 * that it is "not known. Left null rather than invented". A click-to-call
 * button pointing at a plausible-looking number would be worse than no button,
 * so the block renders only when a number exists (`docs/ASIAN-KITCHEN.md` §6).
 *
 * ── WHY THIS READS FROM sessionStorage ───────────────────────────────────────
 *
 * Square has the order and could be re-read here. It is not, deliberately: this
 * page runs immediately after a payment, and a customer who has just been
 * charged must never see a spinner or an error because a second network call
 * failed. The checkout page writes everything this page needs before it clears
 * the cart, so the confirmation is already local by the time it renders.
 *
 * That is the same instinct as `optional()` in the POS clients — a secondary
 * call must never be able to spoil a completed sale.
 *
 * The consequence is honest and stated on the page: reload on another device
 * and the detail is gone. The order number survives because it is in the URL,
 * and that is the thing the counter actually needs.
 */

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { RESTAURANT } from "./config";
import { PickupMap } from "./pickup-map";

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

interface Stored {
  orderId: string;
  paymentId?: string;
  receiptUrl?: string;
  /* Square's own confirmation number — see the note on `fallbackTicket` below. */
  receiptNumber?: string;
  name?: string;
  priced?: {
    subtotalCents: number;
    taxCents: number;
    tipCents: number;
    totalCents: number;
    lines: Array<{ name: string; quantity: string; totalCents: number; modifiers: string[] }>;
  };
}

/**
 * The number the customer reads out at the counter is **Square's own
 * `receipt_number`**, taken straight off the payment. It is not derived here and
 * not invented here, which matters for one reason above all: it exists on
 * Square's payment record, so when somebody walks in saying "I'm XJB1" the shop
 * can actually find them.
 *
 * ── WHAT THIS REPLACED, AND WHY ──────────────────────────────────────────────
 *
 * It used to be `AK-${orderId.slice(-4).toUpperCase()}`, with a comment arguing
 * that collisions were "possible and harmless". That argument assumed four
 * random characters — 1.7M combinations. Measured against 229 real sandbox
 * order ids, the truth was:
 *
 *   last character   1 distinct value  — every id ends "F"
 *   last 2           1 distinct value  — every id ends "4F"
 *   last 3          10 distinct values
 *   and uppercasing collapsed 60 distinct characters into 35
 *
 * So of four characters roughly one and a half varied: 229 orders produced 162
 * tickets, with 67 collisions already present. At ~162 slots a shop doing 40
 * orders a day has a 99% chance two customers hold the same number.
 *
 * Square avoids its own tail for exactly this reason — `receipt_number` is the
 * FIRST four characters of the payment id (82/82 measured), because payment ids
 * carry a constant tail too (91/100 end "ZY").
 *
 * And the old number lived only in this browser. It was never sent to Square,
 * so nobody could look it up: a confirmation number the merchant cannot see is
 * decoration.
 *
 * ── THE FALLBACK ─────────────────────────────────────────────────────────────
 *
 * `receipt_number` arrives through sessionStorage, which can be gone — a shared
 * link, a cleared tab. Square also omits it on FAILED payments (0/18 measured),
 * but a failed payment cancels its order and never routes here, so in practice
 * only lost storage reaches this branch.
 *
 * The fallback derives from the order id in the URL, but from the part that
 * actually varies rather than the constant tail: 229 distinct across the same
 * sample, against 162 for the old slice. It keeps the "AK-" prefix precisely so
 * it does NOT impersonate a Square receipt number — staff searching Square for
 * it will find nothing, and the prefix is the signal that this one is ours.
 */
const fallbackTicket = (orderId: string) => `AK-${orderId.slice(-7, -3).toUpperCase()}`;

const subscribe = () => () => {};

export function OrderConfirmation({ orderId }: { orderId: string }) {
  /* Same pattern as the cart: read storage through useSyncExternalStore rather
     than setState-in-an-effect, and keep the raw string as the snapshot so it
     is referentially stable. `null` means not hydrated yet, `""` means nothing
     was stored for this order — which are different things on this page. */
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return sessionStorage.getItem(`ak.order.${orderId}`) ?? "";
      } catch {
        return "";
      }
    },
    () => null,
  );

  const order = useMemo<Stored | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Stored;
    } catch {
      return null;
    }
  }, [raw]);

  const checked = raw !== null;

  return (
    <main className="ak-checkout">
      <p className="ak-co-pill">Paid · Pickup</p>

      <h1 className="ak-co-ticket">{order?.receiptNumber ?? fallbackTicket(orderId)}</h1>
      <p className="ak-co-sub">
        {order?.name ? `Thanks, ${order.name}. ` : ""}Show this number at the counter.
      </p>
      <p className="ak-co-sub">Ready in 15–20 minutes</p>

      {order?.priced && (
        <section className="ak-co-card" aria-labelledby="ak-oc-items">
          <h2 id="ak-oc-items" className="ak-co-h">
            What you ordered
          </h2>
          <ul className="ak-co-lines">
            {order.priced.lines.map((l, i) => (
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
          </ul>
          <dl className="ak-co-totals">
            <div className="ak-co-grand">
              <dt>Paid</dt>
              <dd>{money(order.priced.totalCents)}</dd>
            </div>
          </dl>
        </section>
      )}

      {/* The map matters more here than on the checkout: this is the screen
          someone reads while working out how to get to the shop. */}
      <PickupMap />

      {/* Rendered only if a number is actually known — see the header note. */}
      {RESTAURANT.phone && (
        <a className="ak-btn" href={`tel:${RESTAURANT.phone}`}>
          Call the shop
        </a>
      )}

      {order?.receiptUrl && (
        <a className="ak-co-receipt" href={order.receiptUrl} target="_blank" rel="noreferrer noopener">
          View Square receipt
        </a>
      )}

      {checked && !order && (
        <p className="ak-co-note">
          The detail for this order is not on this device. The number above is
          still the one to show at the counter.
        </p>
      )}

      <Link className="ak-co-back" href="/">
        ← Order something else
      </Link>
    </main>
  );
}
