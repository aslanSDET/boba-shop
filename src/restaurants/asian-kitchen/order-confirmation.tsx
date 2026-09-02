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
 * A counter-friendly ticket number.
 *
 * Square's order id is a 26-character opaque string — correct for an API,
 * useless for someone calling out an order across a kitchen. The last four
 * characters, uppercased, are short enough to read aloud and stable because
 * they come from the id itself rather than from a counter we would have to
 * store. Collisions across a day are possible and harmless: the name on the
 * order disambiguates, exactly as it does on a paper ticket.
 */
const ticket = (orderId: string) => `AK-${orderId.slice(-4).toUpperCase()}`;

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

      <h1 className="ak-co-ticket">{ticket(orderId)}</h1>
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
