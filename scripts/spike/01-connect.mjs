/**
 * Step 1 — is the token real, and what may it do?
 *
 * Run this first. Every later step assumes it passed.
 *   node scripts/spike/01-connect.mjs
 */
import { api, MERCHANT_ID, heading, pass, ENV } from "./lib/clover.mjs";

heading("01", "Connect", "the merchant API token works and carries the permissions we need");

const m = await api(`/v3/merchants/${MERCHANT_ID()}`);
console.log(`  merchant : ${m.name || "(unnamed)"}  [${m.id}]`);
if (m.address) console.log(`  address  : ${[m.address.address1, m.address.city, m.address.state].filter(Boolean).join(", ")}`);
console.log(`  currency : ${m.currency || "?"}    timezone: ${m.timezone || "?"}`);

// Probe each permission the integration actually needs, so a missing one is
// named here rather than surfacing three steps later as an opaque 403.
const probes = [
  ["read  inventory", `/v3/merchants/${MERCHANT_ID()}/items?limit=1`],
  ["read  modifier groups", `/v3/merchants/${MERCHANT_ID()}/modifier_groups?limit=1`],
  ["read  tax rates", `/v3/merchants/${MERCHANT_ID()}/tax_rates?limit=1`],
  ["read  orders", `/v3/merchants/${MERCHANT_ID()}/orders?limit=1`],
  ["read  order types", `/v3/merchants/${MERCHANT_ID()}/order_types?limit=1`],
  ["read  tenders", `/v3/merchants/${MERCHANT_ID()}/tenders?limit=1`],
  ["read  devices", `/v3/merchants/${MERCHANT_ID()}/devices?limit=1`],
];

console.log("\n  permission probes");
let missing = 0;
for (const [label, path] of probes) {
  try {
    const r = await api(path);
    const n = r?.elements?.length ?? 0;
    console.log(`    ✓ ${label.padEnd(22)} ok${n === 0 ? "  (empty, but readable)" : ""}`);
  } catch {
    // api() exits on failure, so reach this only if that changes.
    console.log(`    ✗ ${label.padEnd(22)} DENIED`);
    missing++;
  }
}

console.log(
  `\n  Write access (creating orders, printing) is not probed here — it would leave\n` +
    `  junk on the merchant. Steps 04 and 05 exercise it for real.`,
);

if (ENV === "production") {
  console.log(
    `\n  ⚠ CLOVER_ENV=production. Step 04 will create a REAL order on a REAL merchant\n` +
      `    and step 05 will print a REAL ticket. Do that only with the owner watching.`,
  );
}

pass(missing === 0 ? "Connected. Token is valid and readable across every endpoint the integration needs." : `Connected, but ${missing} permission(s) missing — re-issue the token.`);
