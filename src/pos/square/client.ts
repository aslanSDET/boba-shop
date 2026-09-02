/**
 * The Square HTTP client for Asian Kitchen's checkout.
 *
 * Deliberately the same shape as `pos/clover/client.ts` — small, no SDK, a
 * handful of endpoints — but it is a COPY rather than an abstraction.
 * `PLATFORM.md` §3 says duplicate first and extract on the third case; this is
 * the second, and the differences below are the evidence that a premature
 * `pos/types.ts` would have been wrong.
 *
 * ── WHAT IS ACTUALLY DIFFERENT FROM CLOVER ───────────────────────────────────
 *
 * 1. **One host.** Clover has three that are not interchangeable — a platform
 *    token on the ecommerce host is a 401, an ecommerce path on the platform
 *    host is a 405, both measured (scripts/spike/findings.md step 07). Square
 *    has `connect.squareup.com` and its sandbox twin, and that is all.
 *
 * 2. **Pricing does not create anything.** `CalculateOrder` takes the same body
 *    as `CreateOrder` and returns Square's own totals without persisting. Every
 *    orphaned OPEN order on the Clover side — the 11 duplicates, the 9 swept on
 *    2026-08-31, the whole of `pos/clover/idempotency.ts` — exists only because
 *    Clover cannot answer "what would this cost" without creating an order.
 *
 * 3. **Idempotency is required, not optional.** Square rejects a write without
 *    `idempotency_key`. Clover accepted one and we could never confirm it was
 *    honoured.
 *
 * 4. **Money is integer cents in an object**, `{amount, currency}`, not a bare
 *    integer. Easy to get subtly wrong, so it has a constructor here.
 *
 * ── WHAT IS MEASURED AND WHAT IS NOT ─────────────────────────────────────────
 *
 * **Measured** against the sandbox merchant (`LA5YVEHPBFX7Y`, "Default Test
 * Account"): auth, `GET /v2/locations`, and `POST /v2/orders/calculate` with a
 * real cart. Those work.
 *
 * **Not measured:** `POST /v2/orders`, `POST /v2/payments`, and every decline
 * path in `customerMessage` below — the codes are from documentation and no
 * card has been charged. `docs/SQUARE-PAYMENTS.md` §10 lists the rest.
 *
 * One trap worth recording, because it cost time: `.env.local` contains a
 * multi-line test-card block that is not valid shell, so `set -a; . .env.local`
 * aborts before it reaches the SQUARE_ lines and every curl goes out with an
 * empty bearer token. That reads as 401 UNAUTHORIZED and looks exactly like a
 * revoked credential. Next.js parses the file properly; ad-hoc shell does not.
 * Parse it in Python before blaming the token.
 */

import { ACTIVE_RESTAURANT } from "@/restaurants/active";
import { credential } from "./creds";

/**
 * Square is Asian Kitchen's till, not the platform's.
 *
 * Mirrors `notThisDeployment()` on the Clover side: these routes exist in every
 * build because `app/` is shared, but they hold one merchant's credentials. On
 * a Snowdaes deployment they are not "not yet wired" — they are somebody else's.
 */
export function notThisDeployment(): Response | null {
  if (ACTIVE_RESTAURANT === "asian-kitchen") return null;
  return Response.json(
    { error: "This deployment does not use Square." },
    { status: 404 },
  );
}

/** Defaults to sandbox and stays that way, same rule as CLOVER_ENV. */
export const SQUARE_ENV = process.env.SQUARE_ENV ?? "sandbox";

export function squareBase(): string {
  if (SQUARE_ENV === "production") return "https://connect.squareup.com";
  if (SQUARE_ENV === "sandbox") return "https://connect.squareupsandbox.com";
  throw new Error(`SQUARE_ENV must be "sandbox" or "production", got "${SQUARE_ENV}"`);
}

/**
 * Pinned, not floating. Square dates its API and an unpinned client silently
 * changes behaviour the day they ship a new version.
 */
const SQUARE_VERSION = "2025-01-23";

/** Square money is `{amount, currency}` with amount in integer cents. */
export interface Money {
  amount: number;
  currency: "USD";
}

export const money = (cents: number): Money => ({ amount: cents, currency: "USD" });
export const toCents = (dollars: number): number => Math.round(dollars * 100);
export const centsToDollars = (cents: number): number => cents / 100;

export const formatCents = (cents: number): string =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export interface SquareErrorDetail {
  category?: string;
  code?: string;
  detail?: string;
  field?: string;
}

export class SquareError extends Error {
  readonly status: number;
  readonly errors: SquareErrorDetail[];

  constructor(status: number, body: string, method: string, path: string) {
    super(`Square ${method} ${path} → HTTP ${status}`);
    this.name = "SquareError";
    this.status = status;
    let parsed: { errors?: SquareErrorDetail[] } | null = null;
    try {
      parsed = body ? JSON.parse(body) : null;
    } catch {
      parsed = null;
    }
    this.errors = parsed?.errors ?? [];
  }

  /** Square's machine-readable code, e.g. `CARD_DECLINED`. */
  get code(): string | null {
    return this.errors[0]?.code ?? null;
  }

  /**
   * The customer-facing sentence.
   *
   * Square puts decline reasons in `errors[].code` with a 402, which is the
   * same trap Clover's 402-with-no-error.type was: a naive handler turns a
   * legitimate decline into a 500 and the customer is told the shop is broken
   * rather than that their card was refused (scripts/spike/prior-art.md).
   */
  get customerMessage(): string {
    const code = this.code;
    if (code === "CARD_DECLINED" || code === "GENERIC_DECLINE") return "Your card was declined.";
    if (code === "INSUFFICIENT_FUNDS") return "That card has insufficient funds.";
    if (code === "CVV_FAILURE") return "The security code did not match.";
    if (code === "ADDRESS_VERIFICATION_FAILURE") return "The billing postcode did not match.";
    if (code === "EXPIRATION_FAILURE" || code === "CARD_EXPIRED") return "That card has expired.";
    if (code === "PAYMENT_LIMIT_EXCEEDED") return "That payment is over the card's limit.";
    if (this.status === 429) return "Square is busy. Try that again in a moment.";
    if (this.status === 401 || this.status === 403) return "The shop's Square connection is not authorised.";
    if (this.status === 404) return "Square could not find that.";
    if (this.status === 400) return this.errors[0]?.detail ?? "Square rejected the request.";
    return "Could not reach Square.";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Hard ceiling. Anything on the money path gets longer than anything off it. */
  timeoutMs?: number;
}

/**
 * Same guard as Clover's, same reason.
 *
 * A write against the shop's real Square merchant creates an order a kitchen
 * may act on. This file cannot ask a human whether they are watching, so it
 * refuses instead.
 */
function guardProductionWrite(method: string, path: string) {
  if (SQUARE_ENV !== "production") return;
  if (method === "GET") return;
  throw new Error(
    `Refusing to ${method} ${path} against PRODUCTION. ` +
      `This is sandbox-only: set SQUARE_ENV=sandbox.`,
  );
}

export async function square<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, timeoutMs = 10_000 } = options;
  guardProductionWrite(method, path);

  const headers: Record<string, string> = {
    accept: "application/json",
    "square-version": SQUARE_VERSION,
    "user-agent": "asian-kitchen-poc/1.0",
    authorization: `Bearer ${await credential("SQUARE_ACCESS_TOKEN")}`,
  };
  if (body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(`${squareBase()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new SquareError(res.status, text, method, path);
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * PLAN.md §8.7 design rule 5, carried across unchanged: a secondary call must
 * never fail a sale. A sale that succeeded with no receipt is a nuisance; a sale
 * reported as failed because a second request failed is a double charge.
 */
export async function optional<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const status = error instanceof SquareError ? ` (HTTP ${error.status})` : "";
    console.warn(`[square] optional step "${label}" failed and was ignored${status}`);
    return null;
  }
}
