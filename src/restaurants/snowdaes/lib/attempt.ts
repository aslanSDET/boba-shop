/**
 * One name for one checkout attempt, so the server can collapse a repeat into
 * the order it already created instead of making a second one.
 *
 * ── WHY IT IS STORED, AND WHY IT IS PER-BROWSER ──────────────────────────────
 *
 * A key held only in a ref dies on unmount, so the case that actually strands
 * an order — the request reaches Clover and the reply never comes back — would
 * mint a fresh key on reopen and create a duplicate. sessionStorage survives
 * that, and the reload with it. That matters more now than it did: checkout is
 * a route rather than a panel, so a reload is a normal thing to do to it.
 *
 * It must NOT be derived from the cart alone. Two strangers ordering one Thai
 * Milk Tea a minute apart have identical carts; a cart-derived key would hand
 * the second person the first person's order.
 *
 * Scoped to the cart contents so that changing the order starts a new attempt,
 * and read lazily rather than during render — sessionStorage throws in some
 * privacy modes, which is why every access is wrapped.
 */

export type AttemptLine = {
  menuItemId: string;
  quantity: number;
  modifiers?: Record<string, string[]>;
};

/**
 * The storage slot for one cart.
 *
 * Canonical on purpose: object key order in `modifiers` follows insertion
 * order, so the same cart rebuilt in a different sequence would otherwise
 * produce a different string, miss the stored key, and create the duplicate
 * this is here to prevent.
 */
export function attemptScope(lines: AttemptLine[], promoCode?: string): string {
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

export function attemptKey(scope: string): string {
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
export function clearAttempt(scope: string): void {
  try {
    sessionStorage.removeItem(scope);
  } catch {
    // Nothing was stored; nothing to clear.
  }
}
