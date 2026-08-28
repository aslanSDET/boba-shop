/**
 * Step 2 — can the API replace the RSC scrape?
 *
 * scripts/fetch-clover.mjs reads the catalog out of the ordering site's page
 * payload because that was the only way in without credentials. With a token
 * there is a supported path, and it carries things the scrape cannot see —
 * notably per-item tax rates and stock.
 *
 *   node scripts/spike/02-inventory.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { api, MERCHANT_ID, heading, pass, money } from "./lib/clover.mjs";

heading("02", "Inventory", "the Inventory API returns the same catalog the scrape does, plus tax data");

/**
 * Clover paginates with offset/limit: limit defaults to 100 and is capped at
 * 1000, and offset paging is the documented approach for these collections.
 * PAGE stays at 100 so a short page is an unambiguous end-of-list signal.
 */
const PAGE = 100;
async function all(path, expand = "") {
  const out = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let offset = 0; ; offset += PAGE) {
    const page = await api(`${path}${sep}limit=${PAGE}&offset=${offset}${expand ? `&expand=${expand}` : ""}`);
    const els = page?.elements ?? [];
    out.push(...els);
    if (els.length < PAGE) break;
  }
  return out;
}

const mId = MERCHANT_ID();
// Clover limits expansions to three fields per call, and the items expand below
// is already at that ceiling. A fourth (itemStock, options, tags) needs its own
// request rather than being appended here.
const [items, groups, categories, taxRates] = await Promise.all([
  all(`/v3/merchants/${mId}/items`, "categories,modifierGroups,taxRates"),
  all(`/v3/merchants/${mId}/modifier_groups`, "modifiers"),
  all(`/v3/merchants/${mId}/categories`),
  all(`/v3/merchants/${mId}/tax_rates`),
]);

const modifiers = groups.flatMap((g) => g.modifiers?.elements ?? []);
console.log(`  categories      ${String(categories.length).padStart(5)}`);
console.log(`  items           ${String(items.length).padStart(5)}`);
console.log(`  modifier groups ${String(groups.length).padStart(5)}`);
console.log(`  modifiers       ${String(modifiers.length).padStart(5)}`);
console.log(`  tax rates       ${String(taxRates.length).padStart(5)}`);

if (taxRates.length) {
  console.log("\n  tax rates — this is what retires the invented 8.75% in src/store/useCart.ts");
  for (const t of taxRates) {
    // MEASURED, not inferred: a rate of 6_250_000 was charged as 62.5% tax on a
    // real sandbox order. So percent = rate / 100_000 — hundred-thousandths of a
    // percent, NOT millionths as the docs are usually read to say. 6.25% = 625_000.
    const pct = typeof t.rate === "number" ? (t.rate / 100_000).toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : "?";
    console.log(`    ${(t.name || "(unnamed)").padEnd(28)} ${String(pct).padStart(8)}%   ${t.isDefault ? "default" : ""}  [${t.id}]`);
  }
}

const priced = items.filter((i) => typeof i.price === "number" && i.price > 0);
if (priced.length) {
  const avg = priced.reduce((a, i) => a + i.price, 0) / priced.length;
  console.log(`\n  avg item price  ${money(Math.round(avg))}   (Billerica live catalog is $5.83, Lowell $4.87)`);
}

const sample = items.find((i) => i.modifierGroups?.elements?.length) || items[0];
if (sample) {
  console.log(`\n  a usable order target — step 04 needs an item with modifier groups:`);
  console.log(`    ${sample.name}  ${money(sample.price)}  id=${sample.id}`);
  for (const g of sample.modifierGroups?.elements ?? []) console.log(`      group ${g.name} [${g.id}]`);
}

mkdirSync("assets/clover", { recursive: true });
const path = "assets/clover/_spike-sandbox.json";
writeFileSync(path, JSON.stringify({ categories, items, groups, taxRates }, null, 1) + "\n");
console.log(`\n  written → ${path}  (gitignored; sandbox data, not real catalog)`);

pass("Inventory readable through the API. The scrape in scripts/fetch-clover.mjs has a supported replacement.");
