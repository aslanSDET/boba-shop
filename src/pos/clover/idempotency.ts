/**
 * Collapsing repeat writes that must only happen once.
 *
 * ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
 *
 * Creating a Clover order is not free and not reversible from the customer's
 * side: every call leaves a real order on the merchant's account. Eleven
 * duplicate pairs were measured on this merchant — same second, same total, one
 * PAID and one orphaned OPEN — because a React effect fired twice.
 *
 * A client-side ref stops that ONE cause. It does nothing about a double tap, a
 * retried request on a flaky connection, or a second browser tab. The guarantee
 * has to live on the server, next to the write.
 *
 * ── IN-FLIGHT, NOT JUST FINISHED ─────────────────────────────────────────────
 *
 * The subtle half: the entry holds the PROMISE, not the result. Two requests
 * arriving in the same tick are the common case, and a result cache would let
 * both start their own Clover write before either finished. Storing the promise
 * makes the second caller await the first one's answer.
 *
 * ── FAILURES ARE NOT REMEMBERED ──────────────────────────────────────────────
 *
 * A rejected promise is evicted immediately. Caching a failure would turn one
 * Clover hiccup into a customer who cannot check out until the TTL expires, and
 * a retry after a genuine error is exactly what should be allowed.
 *
 * ── THE LIMIT, AND WHERE DYNAMODB GOES ───────────────────────────────────────
 *
 * This is in-process, so it holds within one server instance. Two instances
 * behind a load balancer each keep their own map, and a retry that lands on the
 * other one is not deduplicated. On a single dev server or one warm Lambda it
 * is a real guarantee; across a fleet it is a strong best effort.
 *
 * `once()` is the seam, exactly as `fetchWeek()` is in clover-hours.ts. Only
 * this function's body changes:
 *
 *   PutItem  ConditionExpression: attribute_not_exists(pk)
 *            Item: { pk: key, orderId, ttl }
 *
 *   • the write succeeds  → we are first; do the Clover call, store the result
 *   • ConditionalCheckFailedException → someone else already has this key;
 *     read their order id and return it
 *   • `ttl` does what `expiresAt` does here, and DynamoDB expires the row
 *
 * The key travels unchanged all the way from the browser, so nothing above this
 * file moves when that lands — not the request shape, not the route, not the
 * component. That is the whole reason the key is minted client-side and
 * persisted rather than derived server-side from whatever happens to be in
 * scope.
 */

interface Entry {
  expiresAt: number;
  promise: Promise<unknown>;
  /** False until the Clover call has answered. In-flight entries are never evicted. */
  settled: boolean;
}

const store = new Map<string, Entry>();

/** A ceiling, so a stream of distinct keys cannot grow this without bound. */
const MAX_ENTRIES = 500;

function prune(now: number) {
  for (const [key, entry] of store) {
    // An expired entry that is still in flight stays: dropping it would let a
    // concurrent retry start a SECOND Clover order, which is the exact thing
    // this file exists to prevent. Expiry is about staleness, and an unanswered
    // request is not stale.
    if (entry.expiresAt <= now && entry.settled) store.delete(key);
  }
  // Still oversized: evict oldest-first, skipping anything unsettled. Map
  // iterates in insertion order, so this is the least recently created.
  if (store.size > MAX_ENTRIES) {
    let excess = store.size - MAX_ENTRIES;
    for (const [key, entry] of store) {
      if (excess <= 0) break;
      if (!entry.settled) continue;
      store.delete(key);
      excess--;
    }
  }
}

/**
 * Run `fn` once per `key` within `ttlMs`; concurrent and repeat callers get the
 * first call's promise back.
 */
export function once<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.promise as Promise<T>;

  const promise = fn();
  const entry: Entry = { expiresAt: now + ttlMs, promise, settled: false };
  store.set(key, entry);

  promise.then(
    () => {
      entry.settled = true;
    },
    () => {
      entry.settled = true;
      // Evict on failure, but only if this exact promise is still the one
      // stored — a later caller may already have replaced it after expiry.
      if (store.get(key)?.promise === promise) store.delete(key);
    },
  );

  prune(now);
  return promise;
}

/** Test seam. Not called in application code. */
export function __clear() {
  store.clear();
}
