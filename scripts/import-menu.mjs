/**
 * Generate the real Snowdaes menu from a Clover catalog export.
 *
 *   node scripts/import-menu.mjs            # both locations
 *   node scripts/import-menu.mjs billerica  # one
 *
 * Reads assets/clover/<location>.json (pulled from the shop's own Clover
 * account) and writes src/config/menu.<location>.generated.ts conforming to the
 * existing types in src/types/boba.ts. Nothing here is hand-maintained —
 * PLAN.md 8.7 makes Clover the source of truth for names, prices and modifiers,
 * so re-running this is how the menu changes.
 *
 * Curated fields Clover has no home for (illustration colourways, "popular"
 * flags, editorial copy) must NOT be added to the generated file — they belong
 * in src/config/item-art.ts and friends, keyed by Clover id, so a re-import
 * cannot wipe them. Prior art on this: the surveyed Django integration
 * preserves locally-curated fields by name across every resync.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const LOCATIONS = process.argv.slice(2).length ? process.argv.slice(2) : ["billerica", "lowell"];

/** Clover money is integer cents; our types are dollars. */
const dollars = (cents) => Math.round(cents ?? 0) / 100;

/** Clover writes "no ceiling" as MAX_INT rather than null. */
const UNLIMITED = 2147483647;

/**
 * Twelve Clover categories collapse onto four product types. This only decides
 * which illustration stands in when an item has no photo (src/types/boba.ts),
 * so a rough fit is fine — but a NEW category must be added here deliberately
 * rather than defaulted, which is why the fallback throws.
 */
const PRODUCT_TYPE = {
  "Puffles": "EGG_PUFF",
  "Egg Puffs (Bagged)": "EGG_PUFF",
  "Shaved Snow": "SHAVED_SNOW",
  "Ice Cream": "SHAVED_SNOW",
  "Asian Ice": "SHAVED_ICE",
  "Hawaiian Ice": "SHAVED_ICE",
  "Milk Tea": "DRINK",
  "Fruit Teas": "DRINK",
  "Fruit Slush": "DRINK",
  "Specialty Drinks": "DRINK",
  "Milkshakes": "DRINK",
  "Toppings": "DRINK",
  // Lowell-only. Both are counter add-ons rather than a product line of their
  // own; DRINK only decides the stand-in illustration.
  "Drizzles": "DRINK",
  "MISC ITEMS": "DRINK",
};

/**
 * Photo filenames were slugged by hand, and an apostrophe was treated
 * inconsistently: "S'Mores" is on disk as `s-mores`, not `smores`. So try both
 * readings rather than silently missing a photo we already have.
 */
const slugs = (s) => {
  const base = s.toLowerCase();
  const strip = base.replace(/['\u2019]/g, "");
  const split = base.replace(/['\u2019]/g, "-");
  const clean = (t) => t.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [...new Set([clean(strip), clean(split)])];
};

/** A stable, readable JS identifier for a modifier group const. */
const identFor = (name, id, taken) => {
  let base = "mg_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  if (!/^mg_[a-z]/.test(base)) base = "mg_g";
  let ident = base, n = 2;
  while (taken.has(ident)) ident = `${base}_${n++}`;
  taken.add(ident);
  return ident;
};

const lit = (v) => JSON.stringify(v);

// Photos already downloaded from the shop's Clover CDN (PLAN 9, commit 111679c).
const PHOTO_DIR = join(ROOT, "public/menu/items");
const photos = existsSync(PHOTO_DIR)
  ? new Map(readdirSync(PHOTO_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => [f.replace(/\.[^.]+$/, ""), f]))
  : new Map();

function build(location) {
  const src = join(ROOT, "assets/clover", `${location}.json`);
  if (!existsSync(src)) throw new Error(`No catalog at ${src}`);
  const { categories, modifierGroups, modifiers, items } = JSON.parse(readFileSync(src, "utf8"));

  // Clover ships modifiers as one flat list carrying groupId, not nested.
  const optionsByGroup = new Map();
  for (const m of modifiers) {
    if (!optionsByGroup.has(m.groupId)) optionsByGroup.set(m.groupId, []);
    optionsByGroup.get(m.groupId).push(m);
  }

  const cats = Object.values(categories).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const categoryOfItem = new Map();
  for (const c of cats) for (const id of c.items ?? []) if (!categoryOfItem.has(id)) categoryOfItem.set(id, c);

  // ---- modifier groups, emitted once and referenced, or the file is enormous
  const taken = new Set();
  const groupIdent = new Map();
  const groupBlocks = [];
  for (const g of Object.values(modifierGroups)) {
    const opts = (optionsByGroup.get(g.id) ?? []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const ident = identFor(g.name, g.id, taken);
    groupIdent.set(g.id, ident);
    const max = g.maxAllowed >= UNLIMITED ? null : g.maxAllowed;
    const kind = max === 1 ? "single" : "multi";
    const lines = [
      `const ${ident}: ModifierGroup = {`,
      `  id: ${lit(g.id)},`,
      `  label: ${lit(g.name)},`,
      `  kind: ${lit(kind)},`,
      `  min: ${g.minRequired ?? 0},`,
    ];
    if (max !== null) lines.push(`  max: ${max},`);
    lines.push(`  options: [`);
    for (const o of opts) {
      const parts = [`id: ${lit(o.id)}`, `name: ${lit(o.name)}`, `priceDelta: ${dollars(o.price)}`];
      lines.push(`    { ${parts.join(", ")} },`);
    }
    lines.push(`  ],`, `};`);
    groupBlocks.push({ ident, name: g.name, count: opts.length, text: lines.join("\n") });
  }

  // ---- items
  const itemBlocks = [];
  const warnings = [];
  for (const c of cats) {
    for (const id of c.items ?? []) {
      const it = items.find((x) => x.id === id);
      if (!it) { warnings.push(`category ${c.name} references missing item ${id}`); continue; }
      if (categoryOfItem.get(id) !== c) continue; // first category wins; noted below

      const type = PRODUCT_TYPE[c.name];
      if (!type) throw new Error(`No productType mapping for category "${c.name}". Add it to PRODUCT_TYPE.`);

      const groups = (it.modifierGroupIds ?? []).map((gid) => groupIdent.get(gid)).filter(Boolean);
      const required = (it.modifierGroupIds ?? []).some((gid) => (modifierGroups[gid]?.minRequired ?? 0) > 0);
      if (!it.price && !required) warnings.push(`${it.name} is $0 with no required group — it would add to the cart free`);

      const photo = slugs(it.name).map((s) => photos.get(s)).find(Boolean);
      const remote = it.images?.find((i) => i.name === "xxxhdpi_1x1") ?? it.images?.[0];

      const lines = [
        `  {`,
        `    id: ${lit(it.id)},`,
        `    categoryId: ${lit(c.id)},`,
        `    productType: ${lit(type)},`,
        `    name: ${lit(it.name)},`,
        `    description: ${lit(it.description ?? "")},`,
        `    basePrice: ${dollars(it.price)},`,
      ];
      if (photo) lines.push(`    imageUrl: ${lit(`/menu/items/${photo}`)},`, `    imageFit: "cover",`);
      else if (remote) lines.push(`    // Clover CDN, not yet downloaded: ${remote.source}`);
      lines.push(
        `    modifierGroups: [${groups.join(", ")}],`,
        `    isAvailable: true,`,
        `  },`,
      );
      itemBlocks.push(lines.join("\n"));
    }
  }

  const used = new Set();
  for (const b of itemBlocks) for (const m of b.matchAll(/\bmg_[a-z0-9_]+/g)) used.add(m[0]);
  const kept = groupBlocks.filter((g) => used.has(g.ident));

  const header = `// GENERATED by scripts/import-menu.mjs from assets/clover/${location}.json — DO NOT EDIT.
// Clover is the source of truth for names, prices and modifiers (PLAN.md §8.7).
// Re-run the script instead of editing; curated fields live elsewhere, keyed by
// Clover id, so a re-import cannot wipe them.
//
// ${itemBlocks.length} items · ${kept.length} modifier groups · ${cats.length} categories

import type { MenuCategory, MenuItem, ModifierGroup } from "@/types/boba";

export const CATEGORIES: MenuCategory[] = [
${cats.map((c) => `  { id: ${lit(c.id)}, name: ${lit(c.name)}, productType: ${lit(PRODUCT_TYPE[c.name])} },`).join("\n")}
];

`;

  const body =
    kept.map((g) => g.text).join("\n\n") +
    `\n\nexport const ITEMS: MenuItem[] = [\n` + itemBlocks.join("\n") + `\n];\n`;

  const out = join(ROOT, "src/config", `menu.${location}.generated.ts`);
  writeFileSync(out, header + body, "utf8");

  return { out, items: itemBlocks.length, groups: kept.length, cats: cats.length, warnings, photos: itemBlocks.filter((b) => b.includes("imageUrl")).length };
}

for (const loc of LOCATIONS) {
  const r = build(loc);
  console.log(`\n${loc}`);
  console.log(`  ${r.items} items · ${r.groups} modifier groups · ${r.cats} categories · ${r.photos} with local photos`);
  console.log(`  -> ${r.out.replace(ROOT, "")}`);
  for (const w of r.warnings) console.log(`  ! ${w}`);
}
