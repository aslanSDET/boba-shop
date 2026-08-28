/**
 * Seeds a sandbox test merchant with a faithful slice of the real Billerica
 * catalog, so steps 03-04 test the shape we actually ship.
 *
 * A generic "Test Item" would prove almost nothing. Print-eligibility depends
 * on orders referencing inventory items with LINKED modifier groups, and the
 * things most likely to break — multi-select toppings, a required size, a
 * drizzle that costs extra — only show up with real modifier structure. So we
 * replay real items out of assets/clover/billerica.json.
 *
 * Also creates two tax rates mirroring the real shop, where every single item
 * carries exactly two taxIds. A sandbox with only NO_TAX_APPLIED cannot tell us
 * whether our tax maths agrees with Clover's.
 *
 * SANDBOX ONLY — refuses to run against production. Re-running skips anything
 * already present by name, so it is safe to repeat.
 *
 *   node scripts/spike/seed-sandbox.mjs [howManyItems]
 */
import { readFileSync } from "node:fs";
import { api, MERCHANT_ID, heading, pass, money, fail, ENV } from "./lib/clover.mjs";

heading("seed", "Seed sandbox inventory", "steps 03-04 have real items with real modifier groups to work with");

if (ENV !== "sandbox") {
  fail(`CLOVER_ENV is "${ENV}". This script only runs against sandbox — it writes inventory,\n` +
       `  and writing invented items into a real shop's menu is not something to do by accident.`);
}

const mId = MERCHANT_ID();
const WANT = Number(process.argv[2] || 3);
const MAX_MODS_PER_GROUP = 8;

const src = JSON.parse(readFileSync("assets/clover/billerica.json", "utf8"));
const groupsById = src.modifierGroups;
const modsByGroup = src.modifiers.reduce((acc, m) => ((acc[m.groupId] ??= []).push(m), acc), {});

// Prefer items with the most modifier groups — they exercise the most surface.
const candidates = src.items
  .filter((i) => i.price > 0 && i.modifierGroupIds?.length)
  .sort((a, b) => b.modifierGroupIds.length - a.modifierGroupIds.length)
  .slice(0, WANT);

if (!candidates.length) fail("No suitable items found in assets/clover/billerica.json.");

const existing = async (path, name) => {
  const page = await api(`/v3/merchants/${mId}/${path}?limit=1000`);
  return (page.elements ?? []).find((e) => e.name === name);
};

// --- taxes ---------------------------------------------------------------
// MEASURED: percent = rate / 100_000. 6.25% => 625_000. Setting 6_250_000
// here charged 62.5% on a real order, so do not "correct" this upward.
console.log("  tax rates");
for (const [name, pct] of [["MA Meals Tax", 6.25], ["Local Option Meals Tax", 0.75]]) {
  const have = await existing("tax_rates", name);
  if (have) { console.log(`    = ${name} already present [${have.id}]`); continue; }
  const t = await api(`/v3/merchants/${mId}/tax_rates`, {
    method: "POST",
    body: { name, rate: Math.round(pct * 100_000), isDefault: true },
  });
  console.log(`    + ${name}  ${pct}%  [${t.id}]`);
}

// --- categories, items, modifier groups ----------------------------------
const madeGroups = new Map();   // source group id -> created group id

for (const item of candidates) {
  console.log(`\n  ${item.name}  ${money(item.price)}`);

  let created = await existing("items", item.name);
  if (created) {
    console.log(`    = item already present [${created.id}]`);
  } else {
    created = await api(`/v3/merchants/${mId}/items`, {
      method: "POST",
      body: { name: item.name, price: item.price, priceType: "FIXED", defaultTaxRates: true },
    });
    console.log(`    + item [${created.id}]`);
  }

  // category
  const srcCat = Object.values(src.categories).find((c) => c.items?.includes(item.id));
  if (srcCat) {
    let cat = await existing("categories", srcCat.name);
    if (!cat) {
      cat = await api(`/v3/merchants/${mId}/categories`, { method: "POST", body: { name: srcCat.name } });
      console.log(`    + category ${srcCat.name} [${cat.id}]`);
    }
    await api(`/v3/merchants/${mId}/category_items`, {
      method: "POST",
      body: { elements: [{ category: { id: cat.id }, item: { id: created.id } }] },
    }).catch(() => {});
  }

  // modifier groups + modifiers, then the association that makes it printable
  for (const gid of item.modifierGroupIds) {
    const g = groupsById[gid];
    if (!g) continue;
    let newGid = madeGroups.get(gid);
    if (!newGid) {
      let group = await existing("modifier_groups", g.name);
      if (!group) {
        group = await api(`/v3/merchants/${mId}/modifier_groups`, {
          method: "POST",
          body: {
            name: g.name,
            minRequired: g.minRequired ?? 0,
            // Clover's real catalog uses 2147483647 for "unlimited"; keep it sane.
            maxAllowed: !g.maxAllowed || g.maxAllowed > 100 ? 0 : g.maxAllowed,
            showByDefault: true,
          },
        });
        const mods = (modsByGroup[gid] ?? []).slice(0, MAX_MODS_PER_GROUP);
        for (const m of mods) {
          await api(`/v3/merchants/${mId}/modifier_groups/${group.id}/modifiers`, {
            method: "POST",
            body: { name: m.name, price: m.price ?? 0 },
          });
        }
        console.log(`    + group ${g.name}  (${mods.length} modifiers, min ${g.minRequired ?? 0})  [${group.id}]`);
      } else {
        console.log(`    = group ${g.name} already present [${group.id}]`);
      }
      newGid = group.id;
      madeGroups.set(gid, newGid);
    }
    await api(`/v3/merchants/${mId}/item_modifier_groups`, {
      method: "POST",
      body: { elements: [{ item: { id: created.id }, modifierGroup: { id: newGid } }] },
    }).catch(() => {});
  }
}

pass(`Seeded ${candidates.length} item(s). Run 02-inventory.mjs to confirm, then 03-atomic-order.mjs.`);
