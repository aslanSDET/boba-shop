/**
 * Seeds a sandbox test merchant from the real Billerica catalog.
 *
 *   node --env-file=.env.local scripts/spike/seed-sandbox.mjs        # 3 items (spike default)
 *   node --env-file=.env.local scripts/spike/seed-sandbox.mjs 25     # a slice
 *   node --env-file=.env.local scripts/spike/seed-sandbox.mjs all    # the whole shop
 *
 * A generic "Test Item" would prove almost nothing. Print-eligibility depends on
 * orders referencing inventory items with LINKED modifier groups, and the things
 * most likely to break — multi-select toppings, a required size, a drizzle that
 * costs extra — only show up with real modifier structure. So we replay real
 * items out of assets/clover/billerica.json.
 *
 * Also creates two tax rates mirroring the real shop, where every single item
 * carries exactly two taxIds. A sandbox with only NO_TAX_APPLIED cannot tell us
 * whether our tax maths agrees with Clover's.
 *
 * ── WRITTEN FOR VOLUME, BECAUSE "all" IS ~1,700 CALLS ─────────────────────────
 *
 * The whole catalog is 119 items, 12 categories, 85 modifier groups and 1,064
 * modifiers, plus the links between them. Three things make that survivable:
 *
 *   1. Existing names are fetched ONCE into maps. The earlier version listed the
 *      full catalog on every lookup, which is fine for 3 items and quadratic for
 *      119.
 *   2. Every write retries on 429 and 5xx with backoff. Clover rate-limits, and
 *      a surveyed integration had three separate 429s swallowed as nulls before
 *      anyone noticed (scripts/spike/prior-art.md).
 *   3. Everything is keyed by name and skipped if present, so an interrupted run
 *      is resumed by running it again.
 *
 * SANDBOX ONLY — refuses to run against production.
 */
import { readFileSync } from "node:fs";
import { api, MERCHANT_ID, heading, pass, money, fail, ENV } from "./lib/clover.mjs";

heading("seed", "Seed sandbox inventory", "replay the real Billerica catalog into a test merchant");

if (ENV !== "sandbox") {
  fail(`CLOVER_ENV is "${ENV}". This script only runs against sandbox — it writes inventory,\n` +
       `  and writing invented items into a real shop's menu is not something to do by accident.`);
}

const mId = MERCHANT_ID();
const arg = process.argv[2] ?? "3";
const ALL = arg === "all";
const WANT = ALL ? Infinity : Number(arg);
if (!ALL && !Number.isFinite(WANT)) fail(`Expected a number or "all", got "${arg}".`);

const src = JSON.parse(readFileSync("assets/clover/billerica.json", "utf8"));
const groupsById = src.modifierGroups;
const modsByGroup = src.modifiers.reduce((acc, m) => ((acc[m.groupId] ??= []).push(m), acc), {});

/**
 * $0 items are real: eight shaved-snow flavours price themselves through a
 * required "Snow Size" group. The slice mode still prefers priced items with the
 * most modifier groups, because that is what steps 03-04 need.
 */
const candidates = ALL
  ? src.items
  : src.items
      .filter((i) => i.price > 0 && i.modifierGroupIds?.length)
      .sort((a, b) => b.modifierGroupIds.length - a.modifierGroupIds.length)
      .slice(0, WANT);

if (!candidates.length) fail("No suitable items found in assets/clover/billerica.json.");

// --- write helper: retry the failures that are worth retrying ---------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function write(path, body, { tries = 5 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await api(path, { method: "POST", body, soft: true });
    } catch (e) {
      const retryable = e.status === 429 || (e.status >= 500 && e.status < 600);
      if (!retryable || attempt >= tries) throw e;
      const wait = Math.min(200 * 2 ** attempt, 8000);
      process.stdout.write(e.status === 429 ? "~" : "!");
      await sleep(wait);
    }
  }
}

/** Every existing name in one pass, so nothing lists the catalog per lookup. */
async function indexOf(path) {
  const map = new Map();
  for (let offset = 0; ; offset += 1000) {
    const page = await api(`/v3/merchants/${mId}/${path}?limit=1000&offset=${offset}`);
    const els = page.elements ?? [];
    for (const e of els) if (!map.has(e.name)) map.set(e.name, e);
    if (els.length < 1000) break;
  }
  return map;
}

console.log("  reading what is already there…");
const [haveItems, haveCats, haveGroups, haveTax] = await Promise.all(
  ["items", "categories", "modifier_groups", "tax_rates"].map(indexOf),
);
console.log(`    ${haveItems.size} items · ${haveCats.size} categories · ${haveGroups.size} modifier groups · ${haveTax.size} tax rates\n`);

// --- taxes -----------------------------------------------------------------
// MEASURED: percent = rate / 100_000. 6.25% => 625_000. Setting 6_250_000
// here charged 62.5% on a real order, so do not "correct" this upward.
for (const [name, pct] of [["MA Meals Tax", 6.25], ["Local Option Meals Tax", 0.75]]) {
  if (haveTax.has(name)) continue;
  const t = await write(`/v3/merchants/${mId}/tax_rates`, { name, rate: Math.round(pct * 100_000), isDefault: true });
  haveTax.set(name, t);
  console.log(`  + tax  ${name}  ${pct}%`);
}

// --- categories ------------------------------------------------------------
const catOfItem = new Map();
for (const c of Object.values(src.categories)) for (const id of c.items ?? []) if (!catOfItem.has(id)) catOfItem.set(id, c);

for (const c of Object.values(src.categories).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
  if (haveCats.has(c.name)) continue;
  const made = await write(`/v3/merchants/${mId}/categories`, { name: c.name, sortOrder: c.sortOrder ?? 0 });
  haveCats.set(c.name, made);
  console.log(`  + category  ${c.name}`);
}

// --- modifier groups (once each, with every modifier) ----------------------
const neededGroups = new Set(candidates.flatMap((i) => i.modifierGroupIds ?? []));
const groupIdBySrc = new Map();
let madeGroups = 0, madeMods = 0, toppedUp = 0;

console.log(`\n  modifier groups (${neededGroups.size})`);
for (const gid of neededGroups) {
  const g = groupsById[gid];
  if (!g) continue;
  const already = haveGroups.get(g.name);
  if (already) {
    groupIdBySrc.set(gid, already.id);
    // A group that exists is NOT necessarily complete. An earlier run of this
    // script capped modifiers at 8 per group, so three groups came back short.
    // Skipping an existing group wholesale would have left them that way
    // forever, and the gap is invisible until an order is missing a topping.
    const want = (modsByGroup[gid] ?? []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const live = await api(`/v3/merchants/${mId}/modifier_groups/${already.id}/modifiers?limit=1000`);
    const haveNames = new Set((live.elements ?? []).map((m) => m.name));
    for (const m of want) {
      if (haveNames.has(m.name)) continue;
      await write(`/v3/merchants/${mId}/modifier_groups/${already.id}/modifiers`, { name: m.name, price: m.price ?? 0 });
      madeMods++;
      toppedUp++;
    }
    continue;
  }

  const group = await write(`/v3/merchants/${mId}/modifier_groups`, {
    name: g.name,
    minRequired: g.minRequired ?? 0,
    // Clover's real catalog writes "unlimited" as MAX_INT; 0 is how the API says it.
    maxAllowed: !g.maxAllowed || g.maxAllowed > 100 ? 0 : g.maxAllowed,
    showByDefault: true,
  });
  groupIdBySrc.set(gid, group.id);
  haveGroups.set(g.name, group);
  madeGroups++;

  const mods = (modsByGroup[gid] ?? []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const m of mods) {
    await write(`/v3/merchants/${mId}/modifier_groups/${group.id}/modifiers`, { name: m.name, price: m.price ?? 0 });
    madeMods++;
  }
  process.stdout.write(".");
}
console.log(`\n    + ${madeGroups} groups, ${madeMods} modifiers` + (toppedUp ? ` (${toppedUp} topping up groups that already existed)` : ""));

// --- items, their category, and the links that make them printable ---------
console.log(`\n  items (${candidates.length})`);
let madeItems = 0, skipped = 0;
for (const item of candidates) {
  let created = haveItems.get(item.name);
  if (created) { skipped++; }
  else {
    created = await write(`/v3/merchants/${mId}/items`, {
      name: item.name,
      price: item.price ?? 0,
      priceType: "FIXED",
      defaultTaxRates: true,
    });
    haveItems.set(item.name, created);
    madeItems++;
  }

  const srcCat = catOfItem.get(item.id);
  const cat = srcCat && haveCats.get(srcCat.name);
  if (cat) {
    await write(`/v3/merchants/${mId}/category_items`, {
      elements: [{ category: { id: cat.id }, item: { id: created.id } }],
    }).catch(() => {});
  }

  for (const gid of item.modifierGroupIds ?? []) {
    const newGid = groupIdBySrc.get(gid);
    if (!newGid) continue;
    await write(`/v3/merchants/${mId}/item_modifier_groups`, {
      elements: [{ item: { id: created.id }, modifierGroup: { id: newGid } }],
    }).catch(() => {});
  }
  process.stdout.write(madeItems && !(madeItems % 10) ? String(madeItems) : ".");
}

console.log();
pass(
  `Seeded. ${madeItems} items created, ${skipped} already present, ` +
  `${madeGroups} modifier groups with ${madeMods} modifiers.\n` +
  `  Re-run any time — everything is keyed by name and skipped if present.`,
);
