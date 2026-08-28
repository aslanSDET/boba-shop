/**
 * Step 5 — open a Hosted Checkout session, and snapshot the account first.
 *
 * This is half of the spike's headline question. Hosted Checkout takes line
 * items as free-form name/price/unitQty — it does NOT accept Clover inventory
 * IDs. So it cannot be the thing that produces a printable, inventory-linked
 * order; that is step 03's job. What is undocumented is whether it ALSO creates
 * an order of its own. If it does, and we push an atomic order too, the shop
 * gets two tickets for one sale.
 *
 * So: snapshot the account now, pay in the browser, then run 06-probe.mjs.
 *
 *   node scripts/spike/05-hosted-checkout.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { api, hostedCheckout, MERCHANT_ID, heading, pass, money, ENV } from "./lib/clover.mjs";

heading("05", "Hosted Checkout", "we can charge a card, and we capture the 'before' state to detect side effects");

const mId = MERCHANT_ID();

// orderBy=<field>%20DESC is Clover's documented sort syntax, and descending by
// creation time is also the documented default — so this is belt-and-braces:
// if orderBy were silently ignored on these two collections we would still get
// the newest rows. 06 asserts that rather than assuming it. soft:true so a
// snapshot failure degrades to an empty "before" instead of killing the step.
async function snapshot() {
  const [orders, payments] = await Promise.all([
    api(`/v3/merchants/${mId}/orders?limit=50&orderBy=createdTime%20DESC`, { soft: true }).catch(() => ({ elements: [] })),
    api(`/v3/merchants/${mId}/payments?limit=50&orderBy=createdTime%20DESC`, { soft: true }).catch(() => ({ elements: [] })),
  ]);
  return {
    at: Date.now(),
    orderIds: (orders.elements ?? []).map((o) => o.id),
    paymentIds: (payments.elements ?? []).map((p) => p.id),
  };
}

const before = await snapshot();
console.log(`  before: ${before.orderIds.length} recent orders, ${before.paymentIds.length} recent payments`);
if (!before.orderIds.length && !before.paymentIds.length) {
  console.log(
    `\n  ⚠ Empty snapshot. On a brand-new test merchant that is just true, but if the\n` +
      `    reads failed instead, step 06 will call every order it sees "new" and answer\n` +
      `    the architecture question backwards. Confirm 01 passed before paying.`,
  );
}

const body = {
  customer: { email: "spike@example.com", firstName: "Spike", lastName: "Test", phoneNumber: "9785551010" },
  shoppingCart: {
    lineItems: [
      { name: "Thai Dye Shaved Snow", price: 950, unitQty: 1, note: "spike test — not a real order" },
      { name: "Brown Sugar Milk Tea", price: 725, unitQty: 1 },
    ],
  },
};
const total = body.shoppingCart.lineItems.reduce((a, l) => a + l.price * l.unitQty, 0);
console.log(`\n  cart: ${body.shoppingCart.lineItems.length} lines, ${money(total)} before tax`);
console.log("  POST /invoicingcheckoutservice/v1/checkouts …");

const session = await hostedCheckout(body);

console.log(`\n  checkoutSessionId ${session.checkoutSessionId}`);
if (session.expirationTime) console.log(`  expires           ${new Date(session.expirationTime).toLocaleString()}`);

mkdirSync("scripts/spike/.out", { recursive: true });
writeFileSync("scripts/spike/.out/hco-before.json", JSON.stringify({ before, session, sentCart: body }, null, 2) + "\n");

console.log(`\n  ${"═".repeat(66)}`);
console.log(`  PAY HERE:\n\n    ${session.href}\n`);
console.log(`  ${"═".repeat(66)}`);
console.log(
  `\n  Use a Clover sandbox test card — the current list is at\n` +
    `  https://docs.clover.com/dev/docs/ecommerce-test-cards\n` +
    `  (do not guess a number; a declined card proves nothing).`,
);
if (ENV === "production") console.log(`\n  ⚠ CLOVER_ENV=production — this URL will charge a REAL card. Stop unless that is intended.`);

console.log(
  `\n  While you are on the page, note for findings.md. Clover documents four body\n` +
    `  fields we are deliberately NOT sending, so record the default each produces:\n` +
    `    · branding — pageConfigUuid selects a saved Hosted Checkout page config\n` +
    `    · tax — taxRates:[{name, rate}] is accepted; is tax added without it, or is\n` +
    `      the total exactly the ${money(total)} we sent?\n` +
    `    · tips — tips:{enabled:false} is the documented off switch; is it on by default?\n` +
    `    · redirect — redirectUrls:{success, failure}, HTTPS only, and a Merchant\n` +
    `      Dashboard setting (Settings → Ecommerce → Hosted Checkout) OVERRIDES it\n\n` +
    `  Then run:  node scripts/spike/06-probe.mjs`,
);

pass("Checkout session open. Snapshot saved to scripts/spike/.out/hco-before.json.");
