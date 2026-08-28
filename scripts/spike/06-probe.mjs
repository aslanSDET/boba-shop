/**
 * Step 6 — THE question: did Hosted Checkout create its own order?
 *
 * Run after paying the step-05 link. Diffs the account against the snapshot
 * taken before the payment.
 *
 *   node scripts/spike/06-probe.mjs
 *
 * Reading the result:
 *   0 new orders → HCO is payment-only. Our atomic order is the only order.
 *                  The architecture in PLAN.md §8.7 stands unchanged.
 *   1 new order  → HCO creates its own. We must NOT also push an atomic order
 *                  blindly; instead attach to / update the order HCO made, or
 *                  the shop gets two tickets for one sale.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { api, MERCHANT_ID, heading, money, fail, pass } from "./lib/clover.mjs";

heading("06", "Side-effect probe", "whether Hosted Checkout creates an order of its own");

const p = "scripts/spike/.out/hco-before.json";
if (!existsSync(p)) fail("No snapshot. Run 05-hosted-checkout.mjs and pay the link first.");
const { before, session, sentCart } = JSON.parse(readFileSync(p, "utf8"));

const mId = MERCHANT_ID();
// expand names are the documented ones for getOrders, and two is inside the
// three-per-call ceiling. orderBy uses Clover's documented `<field>%20DESC`
// form; descending-by-creation-time is also the documented default, so the
// 50-row window should be the newest 50 either way. WINDOW_OK below refuses to
// trust that silently — a param Clover ignores does not error, and this is the
// one experiment the architecture hangs on.
const [orders, payments] = await Promise.all([
  api(`/v3/merchants/${mId}/orders?limit=50&orderBy=createdTime%20DESC&expand=lineItems,payments`),
  api(`/v3/merchants/${mId}/payments?limit=50&orderBy=createdTime%20DESC`),
]);

const newOrders = (orders.elements ?? []).filter((o) => !before.orderIds.includes(o.id));
const newPayments = (payments.elements ?? []).filter((x) => !before.paymentIds.includes(x.id));

// If the window really is newest-first, at least one row in it postdates the
// snapshot — the payment we just made guarantees that. If nothing does, we are
// looking at a stale slice of the account and "0 new orders" would be a lie.
const newest = (rows) => Math.max(0, ...(rows ?? []).map((r) => r.createdTime ?? 0));
const WINDOW_OK =
  newest(payments.elements) >= before.at || newest(orders.elements) >= before.at;

console.log(`  new payments since the snapshot: ${newPayments.length}`);
for (const pay of newPayments) {
  console.log(`    · ${pay.id}  ${money(pay.amount)}  ${pay.result ?? ""}  order=${pay.order?.id ?? "(none)"}`);
}

console.log(`\n  new orders since the snapshot:   ${newOrders.length}`);
for (const o of newOrders) {
  const lines = o.lineItems?.elements ?? [];
  console.log(`    · ${o.id}  total=${money(o.total)}  state=${o.state ?? "?"}  paymentState=${o.paymentState ?? "?"}  lines=${lines.length}`);
  for (const l of lines) console.log(`        ${l.name} ${money(l.price)}${l.item?.id ? `  (inventory ${l.item.id})` : "  (NOT inventory-linked)"}`);
}

console.log(`\n${"═".repeat(72)}`);
if (newPayments.length === 0) {
  console.log(`  INCONCLUSIVE — no payment landed. Was the checkout link actually paid?`);
  console.log(`  Session: ${session.checkoutSessionId}`);
} else if (!WINDOW_OK) {
  console.log(`  INCONCLUSIVE — a payment landed, but nothing in the 50-row window is`);
  console.log(`  newer than the snapshot. The list is not coming back newest-first, so`);
  console.log(`  "no new orders" here would mean nothing. Re-query with an explicit`);
  console.log(`  filter=createdTime>${before.at} before trusting any answer.`);
} else if (newOrders.length === 0) {
  console.log(`  ANSWER: Hosted Checkout is PAYMENT-ONLY. It created no order.`);
  console.log(`  → PLAN.md §8.7 stands: charge with HCO, then push the atomic order (step 03).`);
  console.log(`  → No double-ticket risk. Attach the payment to our order by id.`);
} else {
  const linked = (newOrders[0].lineItems?.elements ?? []).some((l) => l.item?.id);
  console.log(`  ANSWER: Hosted Checkout CREATED ITS OWN ORDER (${newOrders.length}).`);
  console.log(`  → Line items are ${linked ? "inventory-linked" : "NOT inventory-linked, so likely not printable"}.`);
  console.log(`  → Do NOT also push an atomic order blindly — that is two tickets for one sale.`);
  console.log(`  → Adjust the design: either update the HCO order with real inventory line`);
  console.log(`    items, or drop HCO for the tokenising iframe so we own order creation.`);
}
console.log(`${"═".repeat(72)}`);

writeFileSync(
  "scripts/spike/.out/probe-result.json",
  JSON.stringify({ session, sentCart, newOrders, newPayments }, null, 2) + "\n",
);
pass("Probe complete → scripts/spike/.out/probe-result.json. Write the answer into findings.md.");
