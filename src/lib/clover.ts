/**
 * The Clover HTTP client for the proof-of-concept checkout.
 *
 * Deliberately small: six-ish endpoints, no SDK, no third-party MCP server.
 * The knowledge here is ported from `scripts/spike/lib/clover.mjs` rather than
 * promoted from it — the spike scripts stay throwaway (PLAN.md §8.7).
 *
 * Three hosts, and they are not interchangeable. Sending a platform token to
 * the Ecommerce host gets a 401; POSTing an Ecommerce path to the platform host
 * gets a 405. Both were measured (scripts/spike/findings.md, step 07).
 */

export type CloverHost = "platform" | "ecomm" | "token";

const BASES: Record<string, Record<CloverHost, string>> = {
  sandbox: {
    platform: "https://apisandbox.dev.clover.com",
    ecomm: "https://scl-sandbox.dev.clover.com",
    token: "https://token-sandbox.dev.clover.com",
  },
  production: {
    platform: "https://api.clover.com",
    ecomm: "https://scl.clover.com",
    token: "https://token.clover.com",
  },
};

/** Defaults to sandbox and stays that way unless someone changes .env.local. */
export const CLOVER_ENV = process.env.CLOVER_ENV ?? "sandbox";

export function cloverBase(host: CloverHost): string {
  const set = BASES[CLOVER_ENV];
  if (!set) {
    throw new Error(`CLOVER_ENV must be "sandbox" or "production", got "${CLOVER_ENV}"`);
  }
  return set[host];
}

export function merchantId(): string {
  return required("CLOVER_MERCHANT_ID");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Never echo the value, only the name. This message reaches a log.
    throw new Error(`Missing ${name}. Add it to .env.local (gitignored) — see scripts/spike/README.md.`);
  }
  return value;
}

export class CloverError extends Error {
  readonly status: number;
  readonly body: string;
  readonly parsed: unknown;

  constructor(status: number, body: string, method: string, path: string) {
    super(`Clover ${method} ${path} → HTTP ${status}`);
    this.name = "CloverError";
    this.status = status;
    this.body = body;
    try {
      this.parsed = body ? JSON.parse(body) : null;
    } catch {
      this.parsed = null;
    }
  }

  private get error(): { message?: string; code?: string } | undefined {
    return (this.parsed as { error?: { message?: string; code?: string } } | null)?.error;
  }

  /** Clover's machine-readable code, e.g. `order_already_paid`. */
  get code(): string | null {
    return this.error?.code ?? null;
  }

  /**
   * The customer-facing sentence. Clover's decline path is HTTP 402 with no
   * `error.type`, which naive handlers turn into a 500 (prior-art.md).
   */
  get customerMessage(): string {
    if (this.status === 402) return this.error?.message ?? "Your card was declined.";
    if (this.status === 429) return "Clover is busy. Try that again in a moment.";
    if (this.status === 409) return this.error?.message ?? "That order has already been dealt with.";
    if (this.status === 400) return this.error?.message ?? "Clover rejected the request.";
    if (this.status === 401 || this.status === 403) return "The shop's Clover connection is not authorised.";
    if (this.status === 404) return "Clover could not find that.";
    return "Could not reach Clover.";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Which credential to present. */
  auth: "platform" | "ecomm";
  /** Hard ceiling. Anything on the money path gets longer than anything off it. */
  timeoutMs?: number;
  idempotencyKey?: string;
}

/**
 * Writes against production need a human in the loop, and this file cannot ask
 * for one. Against the shop's real merchant, creating an order and firing a
 * print event puts paper in a working kitchen (PLAN.md §8.7 guardrails).
 */
function guardProductionWrite(method: string, path: string) {
  if (CLOVER_ENV !== "production") return;
  if (method === "GET") return;
  throw new Error(
    `Refusing to ${method} ${path} against PRODUCTION. ` +
      `This proof of concept is sandbox-only: set CLOVER_ENV=sandbox in .env.local.`,
  );
}

async function request<T>(host: CloverHost, path: string, options: RequestOptions): Promise<T> {
  const { method = "GET", body, auth, timeoutMs = 10_000, idempotencyKey } = options;
  guardProductionWrite(method, path);

  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": "snowdaes-poc/1.0",
  };

  if (auth === "platform") {
    headers.authorization = `Bearer ${required("CLOVER_API_TOKEN")}`;
  } else {
    // The Ecommerce host authenticates with the Ecommerce private key AND wants
    // the merchant named in a header rather than in the path.
    headers.authorization = `Bearer ${required("CLOVER_ECOMM_PRIVATE_KEY")}`;
    headers["X-Clover-Merchant-Id"] = merchantId();
  }
  if (body !== undefined) headers["content-type"] = "application/json";
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

  const res = await fetch(`${cloverBase(host)}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new CloverError(res.status, text, method, path);
  return (text ? JSON.parse(text) : null) as T;
}

/** Platform REST v3 — inventory, orders, print. Merchant API token. */
export function platform<T>(path: string, options: Omit<RequestOptions, "auth"> = {}): Promise<T> {
  return request<T>("platform", path, { ...options, auth: "platform" });
}

/** Ecommerce host — charges, and `POST /v1/orders/{id}/pay`. Ecommerce private key. */
export function ecomm<T>(path: string, options: Omit<RequestOptions, "auth"> = {}): Promise<T> {
  return request<T>("ecomm", path, { ...options, auth: "ecomm" });
}

/**
 * PLAN.md §8.7 design rule 5 — a secondary call must never fail a sale.
 *
 * Short timeout, no retries, null instead of a throw. Every caller must be able
 * to shrug. A sale that succeeded with no paper is a nuisance; a sale reported
 * as failed because a second request failed is a double charge.
 *
 * Do NOT wrap the call that moves money in this.
 */
export async function optional<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const status = error instanceof CloverError ? ` (HTTP ${error.status})` : "";
    console.warn(`[clover] optional step "${label}" failed and was ignored${status}`);
    return null;
  }
}

/** Clover money is integer cents, ours is dollars. One conversion, one place. */
export const toCents = (dollars: number): number => Math.round(dollars * 100);
export const centsToDollars = (cents: number): number => cents / 100;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatCents = (cents: number): string => usd.format(cents / 100);
