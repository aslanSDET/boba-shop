"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { formatPrice } from "@/restaurants/snowdaes/lib/format";
import { PickupMap } from "@/restaurants/snowdaes/components/pickup-map";
import { SHOP } from "@/restaurants/snowdaes/shop";

/**
 * `/order/[id]` — what someone sees the moment after they have paid.
 *
 * ── WHY THIS READS FROM sessionStorage AND NOT FROM CLOVER ───────────────────
 *
 * Clover has the order and could be re-read here. It is not, deliberately: this
 * page runs immediately after a payment, and a customer who has just been
 * charged must never see a spinner or an error because a second network call
 * failed. Checkout writes everything this page needs before it clears the cart,
 * so the confirmation is already local by the time it renders.
 *
 * That is the same instinct as `optional()` in the POS client — a secondary
 * call must never be able to spoil a completed sale. There is a measured reason
 * too: `GET /orders/{id}` still reports `paymentState: OPEN` for about two
 * seconds after a successful charge (findings.md), so a re-read here would race
 * and could tell someone their paid order is unpaid.
 *
 * The consequence is honest and stated on the page: open this on another device
 * and the detail is gone. The pickup code survives because it is derived from
 * the URL, and that is the part the counter actually needs.
 */

interface Stored {
  amount: number;
  tip?: number;
  card?: { brand?: string; last4?: string } | null;
  authCode?: string | null;
  /* The finished phrase, stored rather than recomputed: this page has no hours
     to resolve a slot against, and re-deriving it a minute later could disagree
     with what the customer was shown when they paid. */
  pickup?: string;
  note?: string;
  lines?: Array<{ name: string; quantity: number; detail: string }>;
}

/**
 * Clover order ids are 13 opaque characters. Nobody reads one aloud at a
 * counter, so the last four become the pickup number — short enough to say, and
 * still a real substring of the id staff can search on in Clover rather than a
 * number we invented that exists nowhere in their system.
 *
 * Measured across the sandbox merchant's 25 orders: every position varies, the
 * ids are already uppercase so nothing collapses when we uppercase them, and
 * the last four were distinct 25/25. A small sample, but it is the opposite
 * shape to Square's ids, whose last two characters were IDENTICAL across 229
 * orders — which is the failure this note exists to rule out.
 */
const pickupCode = (orderId: string) => orderId.slice(-4).toUpperCase();

const subscribe = () => () => {};

export function SnowdaesOrderConfirmation({ orderId }: { orderId: string }) {
  /* Read storage through useSyncExternalStore rather than setState-in-an-effect,
     keeping the raw string as the snapshot so it is referentially stable.
     `null` means not hydrated yet; `""` means nothing was stored for this
     order — which are different things on this page. */
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return sessionStorage.getItem(`snowdaes.order.${orderId}`) ?? "";
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
    <main className="mx-auto w-full max-w-[560px] flex-1 px-5 pt-10 pb-12">
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-7" />
        </span>
        <h1 className="mt-5 font-display text-[30px] leading-tight font-semibold">
          Order placed
        </h1>

        <p className="mt-6 font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
          Pickup code
        </p>
        <p className="mt-1 font-mono text-[44px] leading-none font-semibold tracking-[0.12em] tabular-nums">
          {pickupCode(orderId)}
        </p>

        <p className="mx-auto mt-6 max-w-[36ch] text-[15px] leading-relaxed text-muted-foreground">
          Your order is on the counter’s screen at Snowdaes now — the same place
          their other online orders land. Give this code when you collect it.
        </p>
      </div>

      {/* The pickup time is the first thing they will want to re-read, so it is
          the first block rather than a line inside the receipt. */}
      <section className="mt-8 rounded-3xl border border-border bg-card px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] text-muted-foreground">Collect</span>
          <span className="text-right text-[17px] font-semibold">
            {order?.pickup ?? `Ready in ${SHOP.wait}`}
          </span>
        </div>
        {order?.note && (
          <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
            <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Your note
            </span>
            <span className="text-[15px] leading-relaxed">{order.note}</span>
          </div>
        )}
      </section>

      {order && (
        <section className="mt-5 rounded-3xl border border-border bg-card px-5 py-4" aria-labelledby="receipt-heading">
          <h2 id="receipt-heading" className="font-display text-[19px] font-semibold">
            What you ordered
          </h2>

          {order.lines && order.lines.length > 0 && (
            <ul className="mt-3 flex flex-col gap-3">
              {order.lines.map((line, i) => (
                <li key={i} className="flex justify-between gap-3 text-[15px]">
                  <span className="min-w-0">
                    {line.quantity > 1 && (
                      <span className="font-mono tabular-nums">{line.quantity}× </span>
                    )}
                    {line.name}
                    <span className="block text-[14px] leading-relaxed text-muted-foreground">
                      {line.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-4 flex flex-col gap-2 border-t border-border pt-4 font-mono text-[14px] tabular-nums">
            {typeof order.tip === "number" && order.tip > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <dt>Tip</dt>
                <dd>{formatPrice(order.tip / 100)}</dd>
              </div>
            )}
            <div className="flex justify-between text-[16px] font-semibold">
              <dt>Paid</dt>
              <dd>{formatPrice(order.amount / 100)}</dd>
            </div>
            {order.card?.last4 && (
              <div className="flex justify-between text-muted-foreground">
                <dt>Card</dt>
                <dd>
                  {order.card.brand ?? "Card"} ••{order.card.last4}
                </dd>
              </div>
            )}
            {order.authCode && (
              <div className="flex justify-between text-muted-foreground">
                <dt>Auth</dt>
                <dd>{order.authCode}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {/* Directions matter more here than at checkout: this is the screen
          someone reads on the way to collect the order. */}
      <div className="mt-5">
        <PickupMap locationId="billerica" />
      </div>

      {checked && !order && (
        <p className="mt-5 text-center text-[14px] leading-relaxed text-muted-foreground">
          The detail for this order isn’t on this device. The code above is still
          the one to show at the counter.
        </p>
      )}

      <Link
        href="/"
        className="mt-8 flex w-full items-center justify-center rounded-full border border-border px-6 py-4 text-[15px] font-medium transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
      >
        Order something else
      </Link>
    </main>
  );
}
