/**
 * 08 — Pay an order we built ourselves, and see whether it links.
 *
 * 07 proved POST /v1/orders/{orderId}/pay exists on the Ecommerce host and refuses
 * only on the card. This finishes the question: does a REAL payment through it attach
 * to the order and leave it PAID with our line items intact?
 *
 * ── YOU SUPPLY THE CARD, NOT ME ───────────────────────────────────────────────
 *
 * The card is read from the environment and never typed into this file, never logged,
 * and never echoed — only the brand and last four appear in output. Use one of Clover's
 * published SANDBOX test cards. Never a real one; never production.
 *
 *   CARD=4111111111111111 EXP_MONTH=12 EXP_YEAR=2027 CVV=123 \
 *     node --env-file=.env.local scripts/spike/08-order-pay-live.mjs
 *
 * The public tokenising key is fetched at runtime from /pakms/apikey, so there is
 * nothing extra to put in .env.local.
 */
import { ENV, BASE, MERCHANT_ID, api, need, money, fail } from "./lib/clover.mjs";

if (ENV !== "sandbox") fail("08 refuses to run outside sandbox. It charges a card.");

const card = process.env.CARD?.replace(/\s+/g, "");
const expMonth = process.env.EXP_MONTH, expYear = process.env.EXP_YEAR, cvv = process.env.CVV;
if (!card || !expMonth || !expYear || !cvv) {
  fail(
    "Supply a SANDBOX test card in the environment — this script never stores one.\n\n" +
    "  CARD=4111111111111111 EXP_MONTH=12 EXP_YEAR=2027 CVV=123 \\\n" +
    "    node --env-file=.env.local scripts/spike/08-order-pay-live.mjs\n\n" +
    "  Clover publishes test numbers at docs.clover.com. Never a real card."
  );
}
const last4 = card.slice(-4);
const mId = MERCHANT_ID();
const ecomm = (path, init) => fetch(`${BASE.ecomm}${path}`, init);

// ── 1. An order built properly: inventory-linked, so Clover applies its own tax ──
const items = (await api(`/v3/merchants/${mId}/items?limit=2`))?.elements ?? [];
if (!items.length) fail("No inventory. Run seed-sandbox.mjs first.");
const picked = items.slice(0, 2);

const order = await api(`/v3/merchants/${mId}/atomic_order/orders`, {
  method: "POST",
  body: { orderCart: { lineItems: picked.map((i) => ({ item: { id: i.id }, printed: false })) } },
});
const subtotal = picked.reduce((a, i) => a + i.price, 0);
console.log(`\n1. Order ${order.id}`);
for (const i of picked) console.log(`     ${i.name.padEnd(24)} ${money(i.price)}`);
console.log(`     subtotal ${money(subtotal)} -> total ${money(order.total)}   (Clover added the tax)`);
console.log(`     state ${order.state}  paymentState ${order.paymentState ?? "(none)"}`);

// ── 2. Public tokenising key, fetched not stored ──
const pk = await (await ecomm("/pakms/apikey", {
  headers: { accept: "application/json", "X-Clover-Merchant-Id": mId,
             authorization: `Bearer ${need("CLOVER_ECOMM_PRIVATE_KEY")}` },
})).json();
console.log(`\n2. Public tokenising key retrieved (…${String(pk.apiAccessKey).slice(-4)})`);

// ── 3. Card -> clv_ token. The number goes to Clover and nowhere else ──
const tokRes = await fetch(`${BASE.token}/v1/tokens`, {
  method: "POST",
  headers: { "content-type": "application/json", apikey: pk.apiAccessKey },
  body: JSON.stringify({ card: { number: card, exp_month: expMonth, exp_year: expYear, cvv } }),
});
const tok = await tokRes.json().catch(() => ({}));
if (!tokRes.ok || !tok.id) fail(`Tokenising failed: HTTP ${tokRes.status}\n  ${JSON.stringify(tok).slice(0, 400)}`);
console.log(`3. Tokenised ${tok.card?.brand ?? "card"} ****${tok.card?.last4 ?? last4} -> ${tok.id.slice(0, 8)}…`);

// ── 4. THE TEST ──
const payRes = await ecomm(`/v1/orders/${order.id}/pay`, {
  method: "POST",
  headers: { accept: "application/json", "content-type": "application/json",
             "X-Clover-Merchant-Id": mId,
             authorization: `Bearer ${need("CLOVER_ECOMM_PRIVATE_KEY")}` },
  body: JSON.stringify({ source: tok.id, amount: order.total, currency: "usd", ecomind: "ecom" }),
});
const payBody = await payRes.text();
console.log(`\n4. POST /v1/orders/${order.id}/pay -> ${payRes.status}`);
console.log(`     ${payBody.replace(/\s+/g, " ").slice(0, 400)}`);

// ── 5. Read the order back. This is the evidence, not the response above ──
const after = await api(`/v3/merchants/${mId}/orders/${order.id}?expand=lineItems,payments`);
console.log(`\n5. Order re-read from the Platform API:`);
console.log(`     state        ${after.state}`);
console.log(`     paymentState ${after.paymentState ?? "(none)"}`);
console.log(`     total        ${money(after.total)}`);
console.log(`     taxAmount    ${money(after.taxAmount)}   <- the reporting gap, if it is still 0`);
console.log(`     lineItems    ${after.lineItems?.elements?.length ?? 0}`);
for (const li of after.lineItems?.elements ?? [])
  console.log(`       - ${(li.name ?? "?").padEnd(24)} ${money(li.price)}  item:${li.item?.id ?? "NONE"}`);
const payments = after.payments?.elements ?? [];
console.log(`     payments     ${payments.length}`);
for (const p of payments) console.log(`       - ${p.id} ${money(p.amount)} tax:${money(p.taxAmount)} ${p.result ?? ""}`);

console.log("\n" + "─".repeat(70));
const linked = payments.length > 0;
const paid = after.paymentState === "PAID";
const keptLines = (after.lineItems?.elements ?? []).every((l) => l.item?.id);
if (linked && paid && keptLines) {
  console.log("VERDICT: CONFIRMED. Our own order, paid through /pay, PAID, payment attached,");
  console.log("  and every line still inventory-linked. The Hosted Checkout rewrite step dies.");
} else {
  console.log("VERDICT: PARTIAL — read the fields above before changing PLAN.md 8.7.");
  console.log(`  payment attached: ${linked}   paymentState PAID: ${paid}   lines kept: ${keptLines}`);
}
console.log(`\nOrder ${order.id} left for inspection in the sandbox dashboard.`);
