/**
 * Playwright global setup/teardown: delete the Clover orders this run created.
 *
 * ── WHY A TEST SUITE HAS TO DO THIS ──────────────────────────────────────────
 *
 * On Clover, PRICING an order means CREATING one. There is no calculate-only
 * call, so every checkout the suite opens leaves a real object on the merchant's
 * account — and a declined payment leaves it there unpaid. AGENTS.md is explicit
 * that creating sandbox orders while testing is fine and leaving them behind is
 * not, so the suite tidies up after itself rather than making a person do it.
 *
 * ── IT NEVER DELETES ANYTHING WITH A PAYMENT ON IT ───────────────────────────
 *
 * Two guards, and the second exists because the first is weaker than it looks.
 *
 *   1. Skip any order that has a payment or reads PAID.
 *   2. Skip anything created before this run started.
 *
 * (2) matters because a FULL REFUND detaches the payment from the order
 * (measured — findings.md): a real order that was paid and refunded reads
 * exactly like one that was never paid. The time window means the sweep can
 * only ever touch orders this process is responsible for.
 */
import { readFileSync } from "node:fs";
import { STARTED_AT_KEY } from "./sweep-sandbox-setup";

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const [k, ...rest] = t.split("=");
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k.trim()) && !process.env[k.trim()]) {
        process.env[k.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* No .env.local: nothing to sweep, because nothing could be created. */
  }
}

export default async function globalTeardown() {
  loadEnv();

  const env = process.env.CLOVER_ENV ?? "sandbox";
  const token = process.env.CLOVER_API_TOKEN;
  const merchant = process.env.CLOVER_MERCHANT_ID;
  const startedAt = Number(process.env[STARTED_AT_KEY] ?? 0);

  /* Refuses outright outside the sandbox. This deletes things. */
  if (env !== "sandbox" || !token || !merchant || !startedAt) return;

  const base = "https://apisandbox.dev.clover.com";
  const call = (path: string, init: RequestInit = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });

  try {
    const res = await call(`/v3/merchants/${merchant}/orders?limit=100&expand=payments`);
    if (!res.ok) return;
    const body = (await res.json()) as {
      elements?: Array<{
        id: string;
        createdTime?: number;
        paymentState?: string;
        payments?: { elements?: unknown[] };
      }>;
    };

    let swept = 0;
    for (const order of body.elements ?? []) {
      if ((order.createdTime ?? 0) < startedAt) continue;
      if (order.paymentState === "PAID" || (order.payments?.elements ?? []).length > 0) continue;
      await call(`/v3/merchants/${merchant}/orders/${order.id}`, { method: "DELETE" });
      swept++;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (swept > 0) console.log(`\n  swept ${swept} unpaid sandbox order(s) created by this run`);
  } catch {
    /* Housekeeping must never fail a suite that otherwise passed. */
  }
}
