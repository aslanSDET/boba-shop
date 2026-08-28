/**
 * Step 3 — create an order the way the real integration will.
 *
 * The whole architecture rests on this call working with REAL inventory IDs:
 * Clover's Orders FAQ is explicit that orders must reference valid inventory
 * items and linked modifier groups to be eligible for printing. Custom line
 * items with unlinked modifiers are the documented cause of print failures.
 *
 * It also applies an order-level discount, because a promo code that does not
 * reach Clover leaves the shop's books disagreeing with the deposit every time
 * a code is used (PLAN.md §8.7, rule 2).
 *
 *   node scripts/spike/03-atomic-order.mjs [itemId ...]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { api, MERCHANT_ID, heading, pass, money, fail } from "./lib/clover.mjs";

heading("03", "Atomic order", "a coded order lands in the merchant account with modifiers and a discount");

const mId = MERCHANT_ID();
let ids = process.argv.slice(2);

if (!ids.length) {
  const page = await api(`/v3/merchants/${mId}/items?limit=100&expand=modifierGroups`);
  const withMods = (page.elements ?? []).filter((i) => i.price > 0 && i.modifierGroups?.elements?.length);
  const plain = (page.elements ?? []).filter((i) => i.price > 0);
  const pick = withMods[0] || plain[0];
  if (!pick) fail("No priced items on this merchant. Add inventory in the dashboard first, or pass item IDs as arguments.");
  ids = [pick.id];
  console.log(`  auto-picked: ${pick.name} ${money(pick.price)}  [${pick.id}]${withMods.length ? " (has modifier groups)" : " (no modifiers — a weaker test)"}`);
}

// Resolve each item and take one real modifier from its first group, so the
// line item is inventory-linked exactly the way the production push will be.
const lineItems = [];
for (const id of ids) {
  const item = await api(`/v3/merchants/${mId}/items/${id}?expand=modifierGroups`);
  // `printed` is in Clover's own atomic-order example, though that example
  // quotes it as the string "false"; sent as a real boolean here. If the POST
  // is rejected on this field, try the string — and note it in findings.md.
  const line = { item: { id: item.id }, printed: false };
  const group = item.modifierGroups?.elements?.[0];
  if (group) {
    const g = await api(`/v3/merchants/${mId}/modifier_groups/${group.id}?expand=modifiers`);
    const mod = g.modifiers?.elements?.[0];
    if (mod) {
      line.modifications = [{ modifier: { id: mod.id }, name: mod.name, amount: mod.price ?? 0 }];
      console.log(`  + ${item.name} ${money(item.price)}  with "${mod.name}" ${money(mod.price ?? 0)}`);
    }
  }
  if (!line.modifications) console.log(`  + ${item.name} ${money(item.price)}  (no modifiers)`);
  lineItems.push(line);
}

const DISCOUNT_CENTS = 100;
const orderCart = {
  lineItems,
  discounts: [{ name: "SPIKE10 (test promo)", amount: -DISCOUNT_CENTS }],
};

// orderType is what makes the order look like a real online order on the POS
// rather than an untyped one. Clover's reference calls orderType.id required
// while the surrounding prose treats it as optional, so this stays conditional
// — if the POST fails with no order types on the merchant, that is the answer.
const types = await api(`/v3/merchants/${mId}/order_types?limit=20`);
const online =
  (types.elements ?? []).find((t) => /online|web|pickup|to.?go/i.test(t.label || "")) || types.elements?.[0];
if (online) {
  orderCart.orderType = { id: online.id };
  console.log(`  order type: ${online.label} [${online.id}]`);
}

console.log(`  discount:   -${money(DISCOUNT_CENTS)}  (order-level, so it shows in the shop's reporting)`);
console.log("\n  POST /v3/merchants/{mId}/atomic_order/orders …");

const order = await api(`/v3/merchants/${mId}/atomic_order/orders`, { method: "POST", body: { orderCart } });

console.log(`\n  order id    ${order.id}`);
console.log(`  state       ${order.state ?? "(none)"}`);
console.log(`  total       ${money(order.total)}`);
console.log(`  taxAmount   ${money(order.taxAmount ?? 0)}   ← Clover computed this from the items' tax rates`);
console.log(`  paymentState ${order.paymentState ?? "(none)"}`);

mkdirSync("scripts/spike/.out", { recursive: true });
writeFileSync("scripts/spike/.out/last-order.json", JSON.stringify(order, null, 2) + "\n");
console.log(`\n  saved → scripts/spike/.out/last-order.json`);

console.log(
  `\n  NOW LOOK AT THE DEVICE (or the Merchant Dashboard → Orders).\n` +
    `  Questions this answers, and they matter more than the HTTP 200:\n` +
    `    · does the order appear?\n` +
    `    · are the modifiers shown correctly on it?\n` +
    `    · does the discount show as a discount, not a changed price?\n` +
    `    · did anything print WITHOUT step 04? (auto-print may already be on)\n` +
    `    · is the total what our own cart maths would have produced?`,
);

pass(`Order ${order.id} created. Record what the device actually showed in scripts/spike/findings.md.`);
