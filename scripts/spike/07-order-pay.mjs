/**
 * 07 — Does POST /v1/orders/{orderId}/pay exist, and will it take one of OUR orders?
 *
 * The lead comes from another integration's source (see scripts/spike/prior-art.md):
 * they report that online — unlike the terminal — Clover DOES let you link a payment
 * to an order you created yourself. They could not verify it. We can.
 *
 * Why it matters: today Hosted Checkout creates a bare order for us and we rewrite its
 * line items afterwards. If this endpoint is real we invert that — build the order
 * PROPERLY first (inventory-linked, Clover applying its own tax rates), then pay it.
 * One order, correct from birth, and the taxAmount reporting gap closes for free.
 *
 * ── THIS SCRIPT MOVES NO MONEY ────────────────────────────────────────────────
 *
 * It creates a real order, then POSTs to /pay with a SOURCE THAT CANNOT WORK. An
 * unusable source cannot charge anything, so the status code is purely about whether
 * the endpoint exists and accepts the order:
 *
 *   404 / "Invalid URI"      the endpoint is not there        -> dead lead
 *   400 complaining about
 *       the source/token     it read our order and got as far
 *                            as the card                      -> THE LEAD IS REAL
 *   401                      the credential lacks permission
 *   200/201                  should be impossible; investigate before trusting it
 *
 * Same technique the surveyed integration used to probe permissions: ask for something
 * that cannot succeed on its merits, and read the refusal.
 */
import { ENV, BASE, MERCHANT_ID, api, need, money, fail } from "./lib/clover.mjs";

if (ENV !== "sandbox") fail("07 refuses to run outside sandbox. This POSTs to a pay endpoint.");

const mId = MERCHANT_ID();
const SOURCE = "clv_this_is_not_a_real_token_probe_only";

// ── 1. Build a proper order: real inventory ids, so Clover applies its own tax ──
const items = (await api(`/v3/merchants/${mId}/items?limit=2`))?.elements ?? [];
if (items.length === 0) fail("No inventory. Run seed-sandbox.mjs first.");

const lineItems = items.slice(0, 2).map((i) => ({ item: { id: i.id }, printed: false }));
console.log(`\nBuilding an order from ${lineItems.length} inventory-linked lines:`);
for (const i of items.slice(0, 2)) console.log(`  ${i.name} — ${money(i.price)}`);

const order = await api(`/v3/merchants/${mId}/atomic_order/orders`, {
  method: "POST",
  body: { orderCart: { lineItems } },
});
console.log(`\nOrder ${order.id}`);
console.log(`  total ${money(order.total)}   state ${order.state}   paymentState ${order.paymentState}`);

// ── 2. Probe every plausible host + credential combination ──
const attempts = [
  { label: "ecomm  + ecomm private key", base: BASE.ecomm,    token: need("CLOVER_ECOMM_PRIVATE_KEY"), path: `/v1/orders/${order.id}/pay` },
  { label: "ecomm  + platform token",    base: BASE.ecomm,    token: need("CLOVER_API_TOKEN"),         path: `/v1/orders/${order.id}/pay` },
  { label: "platform + platform token",  base: BASE.platform, token: need("CLOVER_API_TOKEN"),         path: `/v1/orders/${order.id}/pay` },
  { label: "platform (v3 path)",         base: BASE.platform, token: need("CLOVER_API_TOKEN"),         path: `/v3/merchants/${mId}/orders/${order.id}/pay` },
];

console.log(`\nProbing with an unusable source (${SOURCE}) — nothing can be charged.\n`);
const results = [];
for (const a of attempts) {
  const url = `${a.base}${a.path}`;
  let status = 0, text = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "X-Clover-Merchant-Id": mId,
        authorization: `Bearer ${a.token}`,
      },
      body: JSON.stringify({ source: SOURCE, amount: order.total, currency: "usd" }),
    });
    status = res.status;
    text = (await res.text()).slice(0, 400);
  } catch (e) {
    text = `network: ${e.message}`;
  }
  results.push({ ...a, status, text });
  console.log(`  ${String(status).padEnd(4)} ${a.label}`);
  console.log(`       ${a.path}`);
  if (text) console.log(`       ${text.replace(/\s+/g, " ").slice(0, 220)}`);
  console.log();
}

// ── 3. Read the verdict ──
const exists = results.filter((r) => r.status && r.status !== 404 && r.status !== 405);
const cardish = results.filter((r) => /source|token|card|payment|amount/i.test(r.text) && r.status >= 400 && r.status < 500);

console.log("─".repeat(70));
if (results.some((r) => r.status >= 200 && r.status < 300)) {
  console.log("UNEXPECTED 2xx from an unusable source. Do not trust this until explained.");
} else if (cardish.length) {
  console.log("VERDICT: THE LEAD IS REAL.");
  console.log("  An endpoint read our order and failed on the card, not on the route.");
  console.log("  Next: pay one for real with a sandbox test card to confirm the link.");
} else if (exists.length === 0) {
  console.log("VERDICT: DEAD LEAD — every variant 404s. The endpoint is not there.");
  console.log("  Keep the Hosted-Checkout-then-rewrite design in PLAN.md 8.7.");
} else {
  console.log("VERDICT: INCONCLUSIVE — see the statuses above.");
  console.log("  401 everywhere means a permission, not a missing route.");
}
console.log(`\nOrder left behind for inspection: ${order.id}`);
