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
 * An item with a photograph never reaches here, and an unrecognised name falls
 * back to the product type rather than to nothing.
 */
export function itemArtFor(nameOrId: string, productType: ProductType): ItemArt {
  const slug = nameOrId
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return ART[slug] ?? ART[nameOrId] ?? FALLBACK[productType];
}
