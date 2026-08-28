/**
 * Minimal Clover API client for the Phase 2 sandbox spike (PLAN.md §8.7).
 *
 * Deliberately dependency-free and deliberately not reusable production code:
 * the spike exists to answer questions, and the answers go in findings.md.
 * Whatever survives contact with the sandbox gets rewritten properly as the
 * catalog-sync / order-push Lambdas.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Load .env.local without pulling in dotenv. Later keys win; existing env wins over the file. */
function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(REPO, name);
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
loadEnv();

const BASES = {
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

export const ENV = process.env.CLOVER_ENV || "sandbox";
if (!BASES[ENV]) fail(`CLOVER_ENV must be "sandbox" or "production", got "${ENV}"`);
export const BASE = BASES[ENV];

export function need(name) {
  const v = process.env[name];
  if (!v) {
    fail(
      `Missing ${name}.\n` +
        `  Add it to .env.local in the repo root (already gitignored).\n` +
        `  See scripts/spike/README.md — "Before you run anything".`,
    );
  }
  return v;
}

export const MERCHANT_ID = () => need("CLOVER_MERCHANT_ID");

/**
 * Platform REST API (v3): inventory, orders, print. Auth = merchant API token.
 *
 * `soft: true` throws instead of exiting, for the callers that are *asking a
 * question* rather than depending on the answer — the permission probes in 01,
 * the print-event poll in 04 (a job that already printed is documented to error),
 * and the snapshot in 05. Without it their try/catch and .catch() are dead code,
 * because handle() → fail() → process.exit(1) never unwinds.
 */
export async function api(path, { method = "GET", body, token, soft = false } = {}) {
  const url = `${BASE.platform}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token || need("CLOVER_API_TOKEN")}`,
      "user-agent": "snowdaes-spike/1.0",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return handle(res, method, url, soft);
}

/** Hosted Checkout lives on the platform host but authenticates with the ecommerce private key. */
export async function hostedCheckout(body) {
  const url = `${BASE.platform}/invoicingcheckoutservice/v1/checkouts`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "X-Clover-Merchant-Id": MERCHANT_ID(),
      authorization: `Bearer ${need("CLOVER_ECOMM_PRIVATE_KEY")}`,
    },
    body: JSON.stringify(body),
  });
  return handle(res, "POST", url);
}

async function handle(res, method, url, soft = false) {
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
  if (!res.ok) {
    if (soft) {
      const e = new Error(`HTTP ${res.status} ${res.statusText} — ${method} ${url}`);
      e.status = res.status;
      e.body = text;
      throw e;
    }
    fail(
      `${method} ${url}\n  HTTP ${res.status} ${res.statusText}\n  ${text.slice(0, 800) || "(empty body)"}` +
        hint(res.status),
    );
  }
  return json ?? text;
}

function hint(status) {
  if (status === 401) return "\n\n  → 401 usually means the token is wrong, or it is a sandbox token being used against production (check CLOVER_ENV).";
  if (status === 403) return "\n\n  → 403 usually means the token lacks a permission. Re-issue it in the dashboard with the permissions listed in scripts/spike/README.md.";
  if (status === 404) return "\n\n  → 404 often means the merchant ID is wrong for this environment.";
  return "";
}

export const money = (cents) =>
  typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : String(cents);

export function fail(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

export function heading(step, title, proves) {
  console.log(`\n${"─".repeat(72)}`);
  console.log(`  ${step}  ${title}`);
  console.log(`  proves: ${proves}`);
  console.log(`  env:    ${ENV}  →  ${BASE.platform}`);
  console.log(`${"─".repeat(72)}\n`);
}

export function pass(msg) { console.log(`\n  ✓ ${msg}\n`); }
