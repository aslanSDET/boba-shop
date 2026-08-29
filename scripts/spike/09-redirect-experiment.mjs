/**
 * 09 — Can we hand the payment back to Clover and still keep what matters?
 *
 * THE THESIS being tested (the "Shopify pattern"):
 *
 *   cart on OUR site  ->  redirect to Clover's own payment page  ->  back to us
 *
 * Same shape as checkout.directtoolsoutlet.com. The prize is not simplicity for
 * its own sake — it is that Snowdaes stays self-sufficient after setup. If we
 * never touch a card, then a Clover change to card handling cannot page anyone
 * at 2am, and the worst failure is a stale menu rather than a lost sale.
 *
 * Hosted Checkout is known to be lossy: it charges exactly what it is handed,
 * ignores the merchant's tax rates, records taxAmount 0, and creates a bare
 * order with free-text lines (findings.md). The question is whether those
 * losses can be repaired AFTER payment, leaving the on-call surface small.
 *
 * ── HYPOTHESES ───────────────────────────────────────────────────────────────
 *
 *   H1  Hosted Checkout accepts a DISCOUNT, so a promo is recorded as a promo
 *       rather than as a mysteriously cheap drink.
 *   H2  It accepts redirectUrls, so the customer comes back to our confirmation
 *       page rather than being stranded on Clover's.
 *   H3  It will take a tax figure we compute, so the customer is charged the
 *       right number even though Clover will not work it out.
 *   H4  The bare order it creates can be REWRITTEN afterwards into
 *       inventory-linked lines with a real discount — repairing the record
 *       without us ever touching the card.
 *
 * H1-H3 are probed here. H4 needs an order that has actually been paid, so it
 * runs against the newest paid Hosted Checkout order if one exists.
 *
 * SANDBOX ONLY.
 */
import { ENV, BASE, MERCHANT_ID, api, need, money, fail, heading, pass } from "./lib/clover.mjs";

heading("09", "Redirect experiment", "can Clover own the payment and still leave a correct record?");
if (ENV !== "sandbox") fail("09 refuses to run outside sandbox.");

const mId = MERCHANT_ID();

async function hco(label, body) {
  const res = await fetch(`${BASE.platform}/invoicingcheckoutservice/v1/checkouts`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "X-Clover-Merchant-Id": mId,
      authorization: `Bearer ${need("CLOVER_ECOMM_PRIVATE_KEY")}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { label, status: res.status, json, text };
}

const line = (name, price, qty = 1) => ({ name, price, unitQty: qty });
const customer = { email: "spike@example.com", firstName: "Spike", lastName: "Test" };

// ── H1 · does it take a discount? ────────────────────────────────────────────
console.log("\nH1  Does Hosted Checkout accept a discount?\n");

const cart = [line("Thai Dye — Large", 1195)];
const h1 = [
  ["shoppingCart.discounts[percentage]", { customer, shoppingCart: { lineItems: cart, discounts: [{ name: "NEWCUSTOMER", percentage: 10 }] } }],
  ["shoppingCart.discounts[amount]",     { customer, shoppingCart: { lineItems: cart, discounts: [{ name: "NEWCUSTOMER", amount: 120 }] } }],
  ["lineItem-level discounts",           { customer, shoppingCart: { lineItems: [{ ...cart[0], discounts: [{ name: "NEWCUSTOMER", percentage: 10 }] }] } }],
  ["a negative line item",               { customer, shoppingCart: { lineItems: [...cart, line("NEWCUSTOMER — 10% off", -120)] } }],
];
const h1res = [];
for (const [label, body] of h1) {
  const r = await hco(label, body);
  h1res.push(r);
  console.log(`  ${String(r.status).padEnd(4)} ${label}`);
  if (r.status >= 400) console.log(`       ${r.text.replace(/\s+/g, " ").slice(0, 150)}`);
}

// ── H2 · does the customer come back to us? ──────────────────────────────────
console.log("\nH2  Does it accept redirect URLs?\n");
const h2 = await hco("redirectUrls", {
  customer,
  shoppingCart: { lineItems: cart },
  redirectUrls: {
    success: "https://snowdaes.example/order/thanks",
    failure: "https://snowdaes.example/order/problem",
    cancel: "https://snowdaes.example/cart",
  },
});
console.log(`  ${h2.status}  redirectUrls`);
if (h2.json) {
  console.log(`       echoed back: ${JSON.stringify(h2.json.redirectUrls ?? "(not echoed)")}`);
  console.log(`       href: ${h2.json.href ?? "(none)"}`);
}
if (h2.status >= 400) console.log(`       ${h2.text.slice(0, 200)}`);

// ── H3 · can we hand it OUR tax figure? ──────────────────────────────────────
console.log("\nH3  Will it charge a tax-inclusive total we compute?\n");
const sub = 1195, disc = 120, taxable = sub - disc, tax = Math.round(taxable * 0.07);
const h3 = await hco("tax as its own line", {
  customer,
  shoppingCart: {
    lineItems: [line("Thai Dye — Large", sub), line("NEWCUSTOMER — 10% off", -disc), line("Tax", tax)],
  },
});
console.log(`  ${h3.status}  subtotal ${money(sub)} − ${money(disc)} + tax ${money(tax)} = ${money(taxable + tax)}`);
if (h3.status >= 400) console.log(`       ${h3.text.slice(0, 200)}`);

// ── H4 · can a PAID hosted-checkout order be repaired? ───────────────────────
console.log("\nH4  Can the bare order it creates be rewritten afterwards?\n");
const orders = await api(`/v3/merchants/${mId}/orders?limit=50&expand=payments,lineItems&filter=paymentState=PAID`);
const paid = (orders.elements ?? []).filter((o) => (o.payments?.elements ?? []).length > 0);
// A Hosted Checkout order has free-text lines: no `item` reference on them.
const bare = paid.find((o) => (o.lineItems?.elements ?? []).some((l) => !l.item));
if (!bare) {
  console.log("  No paid order with free-text lines found — H4 needs one paid through");
  console.log("  Hosted Checkout. Run 05, pay it, then re-run 09.");
} else {
  console.log(`  Found paid bare order ${bare.id}  total ${money(bare.total)}`);
  const before = await api(`/v3/merchants/${mId}/orders/${bare.id}?expand=lineItems,payments,discounts`);
  const p0 = (before.payments?.elements ?? [])[0];
  console.log(`    lines: ${(before.lineItems?.elements ?? []).length}  inventory-linked: ${(before.lineItems?.elements ?? []).filter((l) => l.item).length}`);
  console.log(`    order.taxAmount ${money(before.taxAmount)}   payment.taxAmount ${money(p0?.taxAmount)}`);

  const items = (await api(`/v3/merchants/${mId}/items?limit=1`))?.elements ?? [];
  if (items.length) {
    const add = await api(`/v3/merchants/${mId}/orders/${bare.id}/line_items`, {
      method: "POST", body: { item: { id: items[0].id } }, soft: true,
    }).catch((e) => ({ error: e.status }));
    console.log(`    add inventory-linked line -> ${add?.error ? "HTTP " + add.error : "ok (" + add.id + ")"}`);

    const dsc = await api(`/v3/merchants/${mId}/orders/${bare.id}/discounts`, {
      method: "POST", body: { name: "NEWCUSTOMER", percentage: 10 }, soft: true,
    }).catch((e) => ({ error: e.status }));
    console.log(`    add real discount        -> ${dsc?.error ? "HTTP " + dsc.error : "ok (" + dsc.id + ")"}`);

    const after = await api(`/v3/merchants/${mId}/orders/${bare.id}?expand=lineItems,payments`);
    const pa = (after.payments?.elements ?? [])[0];
    console.log(`    AFTER: total ${money(after.total)} (was ${money(before.total)})`);
    console.log(`           order.taxAmount ${money(after.taxAmount)}  payment.taxAmount ${money(pa?.taxAmount)}`);
  }
}

pass("Probes complete — read the verdicts above, then findings.md.");
