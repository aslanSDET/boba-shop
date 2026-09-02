"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Lock } from "lucide-react";
import { formatPrice } from "@/restaurants/snowdaes/lib/format";
import { useCart } from "@/restaurants/snowdaes/lib/use-cart";
import { cn } from "@/restaurants/snowdaes/lib/utils";

/**
 * Card entry and payment.
 *
 * ── THE CARD NEVER TOUCHES THIS APP ──────────────────────────────────────────
 *
 * Each field below is an iframe served by Clover, mounted into an empty div we
 * own. The digits are typed in a different origin; we receive a single-use
 * `clv_` token and nothing else. There is deliberately no state anywhere here
 * holding anything card-shaped, and there must not be — one "let me just read
 * the value out of the field" undoes the entire arrangement and drags this
 * project into PCI scope.
 *
 * ── CLOVER IS THE CALCULATOR ─────────────────────────────────────────────────
 *
 * The cart's totals are a preview. The moment this opens we POST the cart to
 * `/api/checkout`, which builds the order on the merchant's account from its
 * own inventory prices and its own tax rates, and the figures shown from then
 * on are the ones Clover returned. The customer is never quoted a number we
 * calculated.
 *
 * Three traps are paid for in here, all from `scripts/spike/prior-art.md`:
 * `mount()` takes a CSS SELECTOR and silently fails the whole mount if handed a
 * node; a React `useId()` contains colons, so `#:r1:` is a selector syntax
 * error and the ids below are plain strings; and a `clv_` token is single-use,
 * so a retry after a decline has to tokenise again rather than reuse one.
 */

interface CheckoutTotals {
  cloverOrderId: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

interface PaidResult {
  paid: boolean;
  amount: number;
  cloverOrderId?: string;
  chargeId?: string;
  card?: { brand?: string; last4?: string };
  /** Clover's own auth code — what staff read back when tracing a payment. */
  authCode?: string;
  printed?: boolean;
}

/**
 * Clover order ids are 13 opaque characters. Nobody reads one aloud at a
 * counter, so the last four become the pickup number — short enough to say,
 * and still a real substring of the id staff can search on in Clover rather
 * than a number we invented that exists nowhere in their system.
 */
const pickupCode = (orderId?: string) => (orderId ? orderId.slice(-4).toUpperCase() : null);

// Plain ids on purpose: Clover mounts by selector, and useId() yields colons.
const FIELDS = [
  { key: "CARD_NUMBER", id: "clover-card-number", label: "Card number" },
  { key: "CARD_DATE", id: "clover-card-date", label: "Expiry" },
  { key: "CARD_CVV", id: "clover-card-cvv", label: "CVV" },
  { key: "CARD_POSTAL_CODE", id: "clover-card-postal", label: "Postal code" },
] as const;

type Phase = "pricing" | "ready" | "paying" | "done" | "error";

/**
 * One name for one checkout attempt, so the server can collapse a repeat into
 * the order it already created instead of making a second one.
 *
 * ── WHY IT IS STORED, AND WHY IT IS PER-BROWSER ──────────────────────────────
 *
 * A key held only in a ref dies on unmount, so the case that actually strands
 * an order — the request reaches Clover and the reply never comes back — would
 * mint a fresh key on reopen and create a duplicate. sessionStorage survives
 * that, and the reload with it.
 *
 * It must NOT be derived from the cart alone. Two strangers ordering one Thai
 * Milk Tea a minute apart have identical carts; a cart-derived key would hand
 * the second person the first person's order.
 *
 * Scoped to the cart contents so that changing the order starts a new attempt,
 * and read lazily rather than during render — sessionStorage throws in some
 * privacy modes, which is why every access is wrapped.
 */
type CartLine = { menuItemId: string; quantity: number; modifiers?: Record<string, string[]> };

/**
 * The storage slot for one cart.
 *
 * Canonical on purpose: object key order in `modifiers` follows insertion
 * order, so the same cart rebuilt in a different sequence would otherwise
 * produce a different string, miss the stored key, and create the duplicate
 * this is here to prevent.
 */
function attemptScope(lines: CartLine[], promoCode?: string): string {
  const canonical = lines
    .map((l) => ({
      i: l.menuItemId,
      q: l.quantity,
      m: Object.keys(l.modifiers ?? {})
        .sort()
        .map((g) => `${g}:${[...(l.modifiers?.[g] ?? [])].sort().join(",")}`),
    }))
    .sort((a, b) => (a.i + a.m.join() < b.i + b.m.join() ? -1 : 1));
  return `snowdaes.attempt:${JSON.stringify({ canonical, promoCode: promoCode ?? null })}`;
}

function attemptKey(scope: string): string {
  const fresh =
    globalThis.crypto?.randomUUID?.() ??
    `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random()
      .toString(36)
      .slice(2)}`;
  try {
    const existing = sessionStorage.getItem(scope);
    if (existing) return existing;
    sessionStorage.setItem(scope, fresh);
  } catch {
    // Private mode, or storage disabled. An unstored key still deduplicates the
    // double-tap and the Strict Mode double-invoke, which is most of the value.
  }
  return fresh;
}

/**
 * MUST be called the moment an order is paid.
 *
 * The stored key means "an attempt exists and is unresolved". Leaving it behind
 * after payment is a live bug rather than untidiness: the customer whose friend
 * asks for the same drink rebuilds an identical cart, gets the same key back,
 * and is handed the order they ALREADY paid for — which reports itself as
 * `alreadyPaid` and hands over a second drink nobody was charged for.
 */
function clearAttempt(scope: string): void {
  try {
    sessionStorage.removeItem(scope);
  } catch {
    // Nothing was stored; nothing to clear.
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CloverSdk = any;

export function CheckoutPanel({ onClose }: { onClose: () => void }) {
  const items = useCart((s) => s.items);
  const promo = useCart((s) => s.promo);
  const clearCart = useCart((s) => s.clearCart);

  const [phase, setPhase] = useState<Phase>("pricing");
  const [totals, setTotals] = useState<CheckoutTotals | null>(null);
  const [paid, setPaid] = useState<PaidResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Per-field messages from Clover's own validation, keyed by element id. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const cloverRef = useRef<CloverSdk>(null);
  const mountedRef = useRef(false);
  const pricedRef = useRef(false);
  /** The sessionStorage slot for this attempt, so payment can retire it. */
  const scopeRef = useRef<string>("");

  // ---- 1. Price it on Clover, once ----------------------------------------
  useEffect(() => {
    // A ref, not a `cancelled` flag. Strict Mode invokes this twice in
    // development, and a flag set by the first run's cleanup only suppresses
    // the setState — the second fetch still goes out and Clover still gets a
    // second order. Guarding the FETCH is the only version that works, and it
    // must not also block the reply, or the panel hangs on "pricing" forever.
    if (pricedRef.current) return;
    pricedRef.current = true;

    (async () => {
      try {
        const lines = items.map((i) => ({
          menuItemId: i.menuItem.id,
          quantity: i.quantity,
          modifiers: i.modifiers,
        }));

        scopeRef.current = attemptScope(lines, promo?.code);

        const res = await fetch("/api/clover/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            items: lines,
            ...(promo ? { promoCode: promo.code } : {}),
            idempotencyKey: attemptKey(scopeRef.current),
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? "Could not start checkout.");
          setPhase("error");
          return;
        }
        setTotals(body);
        setPhase("ready");
      } catch {
        setError("Could not reach the shop. Check your connection.");
        setPhase("error");
      }
    })();
    // Priced once on open: re-pricing mid-payment would move the number under
    // somebody who is already typing a card into it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 2. Mount Clover's iframes once the order exists ---------------------
  useEffect(() => {
    if (phase !== "ready" || mountedRef.current) return;
    mountedRef.current = true;

    (async () => {
      try {
        const config = await (await fetch("/api/clover/checkout/config")).json();
        if (!config.publicKey) throw new Error(config.error ?? "No key");

        await new Promise<void>((resolve, reject) => {
          if (document.querySelector(`script[src="${config.sdkUrl}"]`)) return resolve();
          const script = document.createElement("script");
          script.src = config.sdkUrl;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Clover SDK failed to load"));
          document.head.appendChild(script);
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Clover = (window as any).Clover;
        if (!Clover) throw new Error("Clover SDK did not define itself");

        const clover = new Clover(config.publicKey, { merchantId: config.merchantId });
        cloverRef.current = clover;
        const elements = clover.elements();
        for (const field of FIELDS) {
          // A SELECTOR, never the node. Handing it an element fails the whole
          // mount and the only evidence is a generic message.
          const element = elements.create(field.key, {});
          element.mount(`#${field.id}`);

          // Clover validates inside its own iframe and reports through this
          // event — it is the only way to tell somebody their card number is
          // short, because we cannot read the field. Without it a bad card just
          // sat there and the Pay button did nothing visible.
          //
          // The payload has been documented both as { CARD_NUMBER: { error } }
          // and as a bare { error }, so both are read rather than betting on
          // one and silently showing nothing.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          element.addEventListener("change", (event: any) => {
            const detail = event?.[field.key] ?? event ?? {};
            const message: string | undefined = detail.error || undefined;
            setFieldErrors((prev) => {
              if (!message) {
                if (!prev[field.id]) return prev;
                const next = { ...prev };
                delete next[field.id];
                return next;
              }
              if (prev[field.id] === message) return prev;
              return { ...prev, [field.id]: message };
            });
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Card fields could not load.");
        setPhase("error");
      }
    })();
  }, [phase]);

  // ---- 3. Tokenise, then pay ----------------------------------------------
  const pay = useCallback(async () => {
    if (!totals || !cloverRef.current) return;
    if (Object.keys(fieldErrors).length > 0) {
      setError("Fix the card details above first.");
      return;
    }
    setPhase("paying");
    setError(null);
    try {
      const result = await cloverRef.current.createToken();
      if (result?.errors) {
        // createToken reports the same per-field shape. Put each message under
        // the box it belongs to rather than showing one of them at the bottom
        // and leaving the customer to guess which field is wrong.
        const mapped: Record<string, string> = {};
        for (const field of FIELDS) {
          const message = result.errors[field.key];
          if (typeof message === "string" && message) mapped[field.id] = message;
        }
        setFieldErrors((prev) => ({ ...prev, ...mapped }));
        const leftover = Object.values(result.errors).filter(
          (v): v is string => typeof v === "string",
        );
        setError(
          Object.keys(mapped).length > 0
            ? null
            : (leftover[0] ?? "Check the card details."),
        );
        setPhase("ready");
        return;
      }
      if (!result?.token) {
        setError("Clover did not return a card token.");
        setPhase("ready");
        return;
      }

      const res = await fetch("/api/clover/checkout/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cloverOrderId: totals.cloverOrderId, source: result.token }),
      });
      const body = await res.json();
      if (!res.ok || !body.paid) {
        // A decline is not a bug. Clover sends 402 with its own message, and a
        // retry must tokenise afresh — the token above is spent either way.
        setError(body.error ?? "The card was declined.");
        setPhase("ready");
        return;
      }
      // Order first: the attempt is over the instant it is paid, and leaving the
      // key behind lets an identical next cart collect this same paid order.
      clearAttempt(scopeRef.current);
      setPaid(body);
      setPhase("done");
      clearCart();
    } catch {
      setError("Could not reach the shop. Your card was not charged.");
      setPhase("ready");
    }
  }, [totals, clearCart, fieldErrors]);

  if (phase === "done" && paid) {
    const code = pickupCode(paid.cloverOrderId);
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-5 py-10 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-7" />
        </span>
        <h2 className="mt-5 font-display text-2xl font-semibold">Order placed</h2>

        {code && (
          <>
            <p className="mt-6 font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
              Pickup code
            </p>
            <p className="mt-1 font-mono text-4xl font-semibold tracking-[0.12em] tabular-nums">
              {code}
            </p>
          </>
        )}

        <p className="mx-auto mt-6 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground">
          Your order is on the counter’s screen at Snowdaes now — the same place
          their other online orders land. Give this code when you collect it.
        </p>

        <dl className="mx-auto mt-7 flex w-full max-w-[30ch] flex-col gap-2 border-t border-border pt-5 font-mono text-[13px] tabular-nums">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Paid</dt>
            <dd>{formatPrice(paid.amount / 100)}</dd>
          </div>
          {paid.card?.last4 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Card</dt>
              <dd>
                {paid.card.brand ?? "Card"} ••{paid.card.last4}
              </dd>
            </div>
          )}
          {paid.authCode && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Auth</dt>
              <dd>{paid.authCode}</dd>
            </div>
          )}
        </dl>

        <button
          type="button"
          onClick={onClose}
          className="mt-8 w-full rounded-full bg-primary px-6 py-4 text-[15px] font-semibold text-primary-foreground"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-4">
      {phase === "pricing" ? (
        <p className="flex items-center gap-2.5 py-8 text-[15px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Confirming the price with the shop…
        </p>
      ) : (
        totals && (
          <dl className="mb-5 flex flex-col gap-2 font-mono text-[15px] tabular-nums">
            <div className="flex justify-between text-muted-foreground">
              <dt>Subtotal</dt>
              <dd>{formatPrice(totals.subtotal / 100)}</dd>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between text-primary">
                <dt>{promo?.code ?? "Discount"}</dt>
                <dd>−{formatPrice(totals.discount / 100)}</dd>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <dt>Tax</dt>
              <dd>{formatPrice(totals.tax / 100)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-border pt-3 text-[17px] font-semibold text-foreground">
              <dt>Total</dt>
              <dd>{formatPrice(totals.total / 100)}</dd>
            </div>
          </dl>
        )
      )}

      {phase !== "pricing" && phase !== "error" && (
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((field) => (
            <label
              key={field.id}
              className={cn(
                "flex flex-col gap-1.5",
                field.key === "CARD_NUMBER" && "col-span-2",
              )}
            >
              <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                {field.label}
              </span>
              {/* Clover mounts its iframe in here. Never populated by us. */}
              {/* Clover sizes its own iframe. Our box gives it a fixed height
                  and no padding — adding our own made every field taller than
                  the sheet could show and pushed the Pay button off-screen. */}
              <span
                id={field.id}
                className={cn(
                  "block h-[46px] overflow-hidden rounded-2xl border bg-card px-3 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0",
                  fieldErrors[field.id] ? "border-destructive" : "border-border",
                )}
              />
              {fieldErrors[field.id] && (
                <span role="alert" className="text-[12px] text-destructive">
                  {fieldErrors[field.id]}
                </span>
              )}
            </label>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-[14px] text-destructive">
          {error}
        </p>
      )}

      </div>

      <div className="border-t border-border bg-card px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {phase !== "error" && (
        <button
          type="button"
          onClick={pay}
          disabled={phase !== "ready"}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {phase === "paying" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Paying…
            </>
          ) : (
            <>
              <Lock className="size-4" />
              Pay {totals ? formatPrice(totals.total / 100) : ""}
            </>
          )}
        </button>
      )}

      <p className="mt-2.5 text-center font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        Card handled by Clover · never touches this site
      </p>
      </div>
    </div>
  );
}
