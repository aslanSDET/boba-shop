/**
 * Step 4 — fire the kitchen ticket.
 *
 * POST /v3/merchants/{mId}/print_event is the whole reason Option B works:
 * it routes to the firing device's order printer, so an order created by us
 * comes out of the same printer as an order taken at the counter.
 *
 * The returned print-event id is stored on our Order as printEventId — proof
 * the kitchen actually saw the order, which is worth more than any status
 * field we could invent (PLAN.md §8.7, rule 3).
 *
 *   node scripts/spike/04-print.mjs [orderId]
 */
import { readFileSync, existsSync } from "node:fs";
import { api, MERCHANT_ID, heading, pass, fail } from "./lib/clover.mjs";

heading("04", "Print event", "an API-created order fires a ticket on the merchant's own printer");

const mId = MERCHANT_ID();
let orderId = process.argv[2];
if (!orderId) {
  const p = "scripts/spike/.out/last-order.json";
  if (!existsSync(p)) fail("No order id given and no saved order. Run 03-atomic-order.mjs first, or pass an order id.");
  orderId = JSON.parse(readFileSync(p, "utf8")).id;
  console.log(`  using saved order ${orderId}`);
}

const devices = await api(`/v3/merchants/${mId}/devices?limit=20`);
const list = devices.elements ?? [];
console.log(`  devices on this merchant: ${list.length || "none"}`);
for (const d of list) console.log(`    · ${d.productName || d.model || "device"}  serial=${d.serial ?? "?"}  [${d.id}]`);
if (!list.length) {
  console.log(
    `\n  ⚠ No devices. In the sandbox this is normal — the print event will be accepted\n` +
      `    but there is nothing to print on. The call still proves the endpoint and the\n` +
      `    permission. Confirm real printing against the shop's own merchant later.`,
  );
}

console.log("\n  POST /v3/merchants/{mId}/print_event …");
const ev = await api(`/v3/merchants/${mId}/print_event`, { method: "POST", body: { orderRef: { id: orderId } } });

console.log(`\n  print event id ${ev.id}`);
console.log(`  state          ${ev.state ?? "(none)"}`);
if (ev.deviceRef) console.log(`  device         ${ev.deviceRef.id}`);

if (ev.id) {
  const status = await api(`/v3/merchants/${mId}/print_event/${ev.id}`).catch(() => null);
  if (status) console.log(`  polled state   ${status.state ?? "(none)"}`);
  console.log(`\n  Note: once a job prints, Clover discards it — the status is not replayable.`);
}

pass(`Print event ${ev.id} accepted. If a real device is attached, a ticket should be in hand.`);
