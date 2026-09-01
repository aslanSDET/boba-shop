import type { ProductType } from "@/types/boba";

/**
 * Stand-in illustrations for items we have no photograph of. Purely
 * presentational, deliberately kept out of `MenuItem` so the Amplify Data
 * schema stays a model of what the shop sells (PLAN §5.1). Items that do have
 * a photo never reach this file.
 */
export interface ItemArt {
  /** Liquid or snow gradient, top stop to bottom stop. */
  fill: [string, string];
  /** Foam, cream, or condensed-milk cap. */
  cap?: string;
  /** Pearls settled at the bottom. */
  pearl?: string;
  /** Brown sugar tiger stripes clinging to the cup wall. */
  streaks?: boolean;
  /** Colours of the topping flecks scattered over a snow or ice mound. */
  flecks?: string[];
  /** Wash behind the illustration on the menu tile. */
  tint: string;
}

const TAPIOCA = "#33201a";

const ART: Record<string, ItemArt> = {
  "classic-milk-tea": {
    fill: ["#e9d8b5", "#b58c56"],
    pearl: TAPIOCA,
    tint: "#b58c56",
  },
  "thai-milk-tea": {
    fill: ["#f6c894", "#e07b32"],
    pearl: TAPIOCA,
    tint: "#e07b32",
  },
  "taro-milk-tea": {
    fill: ["#e9dcf6", "#a184d2"],
    pearl: TAPIOCA,
    tint: "#a184d2",
  },
  "matcha-milk-tea": {
    fill: ["#dcebbc", "#7fa351"],
    cap: "#f4ede0",
    tint: "#7fa351",
  },
  "honeydew-milk-tea": {
    fill: ["#eaf7d2", "#a5cc74"],
    pearl: TAPIOCA,
    tint: "#a5cc74",
  },
  "jasmine-green-milk-tea": {
    fill: ["#f0f2da", "#b6bf7c"],
    pearl: TAPIOCA,
    tint: "#b6bf7c",
  },
  "coffee-milk-tea": {
    fill: ["#e3cbae", "#7c4c28"],
    pearl: TAPIOCA,
    tint: "#7c4c28",
  },
  "lychee-lemonade": {
    fill: ["#fdf6dd", "#e7d484"],
    tint: "#e7d484",
  },
  "strawberry-lemonade": {
    fill: ["#fddfc0", "#ef7f88"],
    tint: "#ef7f88",
  },
  "passionfruit-green-tea": {
    fill: ["#fbd05b", "#e2802a"],
    pearl: "#b4661c",
    tint: "#e2802a",
  },

  "mango-snow": {
    fill: ["#fee9b4", "#f2ab30"],
    cap: "#fff6e6",
    flecks: ["#e0654f", "#7fa351", "#ffffff"],
    tint: "#f2ab30",
  },
  "matcha-snow": {
    fill: ["#e6f0cd", "#8fae5e"],
    cap: "#f6f9ec",
    flecks: ["#7a3b2e", "#ffffff", "#e8c98a"],
    tint: "#8fae5e",
  },
  "original-milk-snow": {
    fill: ["#fdf6ea", "#e0cfb2"],
    cap: "#ffffff",
    flecks: ["#e0654f", "#8fae5e", "#f2ab30"],
    tint: "#d8c8ad",
  },

  "pandan-egg-puff": {
    fill: ["#dcecb4", "#94b45c"],
    tint: "#94b45c",
  },

  "chocolate-egg-puff": {
    fill: ["#e7c8a2", "#875733"],
    tint: "#875733",
  },
  "ube-egg-puff": {
    fill: ["#e6d6f5", "#8d6ac0"],
    tint: "#8d6ac0",
  },
  "grass-jelly-ice": {
    fill: ["#e2e9e3", "#5a6f60"],
    cap: "#fdf8ee",
    flecks: ["#2f3a33", "#f2ab30", "#ffffff"],
    tint: "#5a6f60",
  },
  "hawaiian-ice": {
    fill: ["#eaf7fe", "#9fd3ef"],
    flecks: ["#ef4b6a", "#3fb3e0", "#8ad04a"],
    tint: "#5fb6dd",
  },
  "hawaiian-ice-cream": {
    fill: ["#f4eefe", "#c3aee8"],
    cap: "#fff8ea",
    flecks: ["#ef4b6a", "#3fb3e0", "#f2ab30"],
    tint: "#9b8ad0",
  },
};

/**
 * Flavour colourways, read off the item name when the curated map above misses.
 *
 * Without this, 40 of the 49 photoless items landed on one `FALLBACK.DRINK`
 * entry and the menu grid rendered forty identical brown boba cups on forty
 * identical beige tiles — Kiwi, Watermelon Fruit Slush and Vanilla Milkshake
 * all drawn as a milk tea. A grid that repeats one picture reads as a loading
 * state, not as a menu, and it is actively wrong about what is in the cup.
 *
 * Order is priority order — first match wins — so the specific entries sit
 * above the generic ones they contain ("thai green" before "thai", "green
 * apple" before "green tea"). Matching on the name rather than the id is the
 * same bet `itemArtFor` makes below: names survive a Clover re-import, ids do
 * not.
 */
const FLAVORS: Array<{ match: RegExp; art: ItemArt }> = [
  { match: /thai green/i, art: { fill: ["#e8f0c8", "#9bb156"], tint: "#9bb156" } },
  { match: /thai/i, art: { fill: ["#f6c894", "#e07b32"], tint: "#e07b32" } },
  { match: /brown sugar/i, art: { fill: ["#e9d3b0", "#8a5622"], streaks: true, tint: "#8a5622" } },
  { match: /green apple/i, art: { fill: ["#e9f6cf", "#8cc63f"], tint: "#8cc63f" } },
  { match: /matcha/i, art: { fill: ["#dcebbc", "#7fa351"], cap: "#f4ede0", tint: "#7fa351" } },
  { match: /honeydew/i, art: { fill: ["#eaf7d2", "#a5cc74"], tint: "#a5cc74" } },
  { match: /winter melon/i, art: { fill: ["#f4ecd6", "#c2a25e"], tint: "#c2a25e" } },
  { match: /taro|ube/i, art: { fill: ["#e9dcf6", "#a184d2"], tint: "#a184d2" } },
  { match: /oolong/i, art: { fill: ["#e7d3ac", "#a4703a"], tint: "#a4703a" } },
  { match: /jasmine/i, art: { fill: ["#f0f2da", "#b6bf7c"], tint: "#b6bf7c" } },
  { match: /coffee|wake-?up/i, art: { fill: ["#e3cbae", "#7c4c28"], tint: "#7c4c28" } },
  { match: /cookies|crème|creme|oreo/i, art: { fill: ["#f3ece2", "#6d625a"], cap: "#fffaf2", tint: "#8b8078" } },
  { match: /chocolate|nutella|fudge/i, art: { fill: ["#e0c3a0", "#6b4326"], tint: "#6b4326" } },
  { match: /vanilla|horchata/i, art: { fill: ["#fdf6e6", "#e3cf9f"], cap: "#fffaf2", tint: "#dcc48e" } },
  { match: /strawberry/i, art: { fill: ["#fddfe0", "#e8596b"], tint: "#e8596b" } },
  { match: /watermelon/i, art: { fill: ["#ffdfe2", "#f2607a"], tint: "#f2607a" } },
  { match: /dragon/i, art: { fill: ["#fbdcef", "#d64a9b"], tint: "#d64a9b" } },
  { match: /mango|apricot/i, art: { fill: ["#fee9b4", "#f2ab30"], tint: "#f2ab30" } },
  { match: /peach|just peachy/i, art: { fill: ["#ffe4cd", "#f4926a"], tint: "#f4926a" } },
  { match: /passion ?fruit/i, art: { fill: ["#fbd05b", "#e2802a"], tint: "#e2802a" } },
  { match: /pineapple/i, art: { fill: ["#fdf0b6", "#e8c02f"], tint: "#e8c02f" } },
  { match: /banana/i, art: { fill: ["#fdf3c8", "#dcc257"], tint: "#dcc257" } },
  { match: /kiwi/i, art: { fill: ["#e6f4c4", "#84b83f"], tint: "#84b83f" } },
  { match: /pear/i, art: { fill: ["#f2f4d2", "#bcc267"], tint: "#bcc267" } },
  { match: /avocado/i, art: { fill: ["#e6f0c9", "#8aa356"], tint: "#8aa356" } },
  { match: /lychee|longan/i, art: { fill: ["#fdf2ee", "#e6b3a8"], tint: "#e0a496" } },
  { match: /coconut/i, art: { fill: ["#fdfaf4", "#ddd2be"], tint: "#d6c9b2" } },
  { match: /red bean/i, art: { fill: ["#eddcd4", "#8e4a3f"], tint: "#8e4a3f" } },
  { match: /honey/i, art: { fill: ["#fbeec4", "#dda63a"], tint: "#dda63a" } },
  { match: /ice cream/i, art: { fill: ["#fdf6ea", "#e0cfb2"], cap: "#ffffff", tint: "#d8c8ad" } },
  { match: /lemonade|lemon/i, art: { fill: ["#fdf6dd", "#e7d484"], tint: "#e7d484" } },
  { match: /\btea\b/i, art: { fill: ["#f6e3bd", "#c08a44"], tint: "#c08a44" } },
];

const FALLBACK: Record<ProductType, ItemArt> = {
  DRINK: { fill: ["#e9d8b5", "#b58c56"], pearl: TAPIOCA, tint: "#b58c56" },
  SHAVED_SNOW: {
    fill: ["#fffaf2", "#e8dcc8"],
    cap: "#ffffff",
    flecks: ["#e0654f", "#8fae5e", "#f2ab30"],
    tint: "#d8c8ad",
  },
  EGG_PUFF: { fill: ["#f6e2b8", "#d8a55c"], tint: "#d8a55c" },
  SHAVED_ICE: {
    fill: ["#eaf7fe", "#9fd3ef"],
    flecks: ["#ef4b6a", "#3fb3e0", "#8ad04a"],
    tint: "#5fb6dd",
  },
};

/**
 * Colourways are keyed by a slug of the item NAME, not by its id.
 *
 * The menu is generated from Clover (`scripts/import-menu.mjs`) and its ids are
 * Clover's — opaque, and free to change if an item is ever rebuilt in their
 * dashboard. Names are what a person recognises and what survives a re-import,
 * so keying on the name is what keeps this curation from being silently lost.
 * The surveyed Django integration preserves its own curated fields by name for
 * exactly this reason (`scripts/spike/prior-art.md`).
 *
 * An item with a photograph still reaches here for its tile tint, and an
 * unrecognised name falls through the flavour table to the product type rather
 * than to nothing.
 */
export function itemArtFor(nameOrId: string, productType: ProductType): ItemArt {
  const slug = nameOrId
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const curated = ART[slug] ?? ART[nameOrId];
  if (curated) return curated;

  const flavor = FLAVORS.find((f) => f.match.test(nameOrId))?.art;
  if (!flavor) return FALLBACK[productType];

  const base = FALLBACK[productType];
  // Shape comes from `productType` in `item-art.tsx`, so a flavour must not
  // strip a mound of its condensed-milk drizzle and topping flecks \u2014 it only
  // recolours. Pearls are the reverse: they belong to milk teas, and the old
  // DRINK fallback was dropping tapioca into every fruit slush on the menu.
  const mounded = productType === "SHAVED_SNOW" || productType === "SHAVED_ICE";
  return {
    ...flavor,
    cap: flavor.cap ?? (mounded ? base.cap : undefined),
    flecks: flavor.flecks ?? (mounded ? base.flecks : undefined),
    pearl: flavor.pearl ?? (/milk tea|boba/i.test(nameOrId) ? TAPIOCA : undefined),
  };
}
