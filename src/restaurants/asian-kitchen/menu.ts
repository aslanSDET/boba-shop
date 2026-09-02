/**
 * Asian Kitchen, 1652 Center Point Pkwy, Birmingham AL — menu data.
 *
 * ── PROVISIONAL, AND DELIBERATELY SELF-CONTAINED ─────────────────────────────
 *
 * Transcribed from their public ordering listing on 2026-09-01. It is a third
 * party's copy of a menu, not the menu, and every price here is replaced the
 * moment we can read their real Square catalog (docs/ASIAN-KITCHEN.md §3).
 *
 * The types are local on purpose. `src/types/boba.ts` describes Snowdaes —
 * `ProductType` is DRINK | SHAVED_SNOW | EGG_PUFF | SHAVED_ICE, which means
 * nothing here. PLATFORM.md §3 says duplicate first and extract the shared
 * shape only once two restaurants actually work, so this file owns its own
 * vocabulary rather than bending Snowdaes' to fit.
 *
 * ── THE MODIFIER SHAPE IS THE POINT ──────────────────────────────────────────
 *
 * Their top sellers are combos: "Pick Any Three Items" is three entrées and a
 * side, and the entrées are *also* standalone menu items. Read from the live
 * configurator: four required Select-1 groups, plus two optional add-on groups.
 * Beef and shrimp carry a +$1.50 delta.
 *
 * Measured and worth keeping: three of the five most-common orders on that
 * listing are
 * the SAME entrée three times. `popularCombos` and `repeatable` both exist
 * because of that, not as speculation.
 */

export interface ModifierOption {
  id: string;
  name: string;
  /** Added to the item price when chosen. Dollars. */
  priceDelta: number;
  /**
   * Chilli marks, 1 or 2, exactly as their board prints them. Not our
   * judgement of how hot the food is — a transcription of their own symbol.
   */
  spice?: 1 | 2;
  /** Their board labels every single choice with a calorie count. */
  calories?: number;
  /** The board's ⭐: this choice carries the premium surcharge. */
  premium?: boolean;
}

export interface ModifierGroup {
  id: string;
  label: string;
  /** How many must be chosen. `min === max === 1` is a radio group. */
  min: number;
  max: number;
  /**
   * How many independent times this group is asked. Their configurator repeats
   * "Item Choice" three times; we ask once and repeat, so "same for all three"
   * is expressible instead of three identical dropdowns.
   */
  repeat?: number;
  /**
   * The thing being chosen, when the label is not already it. Labels are
   * written for the person filling the form, so most are nouns ("Entrée",
   * "Side") but some are prompts ("Fries or veg sticks"). Counting and
   * prompting need the noun, and no amount of string-trimming turns that one
   * into it — "choose a fries or veg stick" is not English.
   */
  noun?: string;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  /** `/asian-kitchen/menu/*.jpg`, or undefined — the tile falls back to a mark. */
  image?: string;
  /** Ranked on their listing. 1 is the most liked item in the store. */
  rank?: number;
  /**
   * A junior portion. Their board is explicit — "Jr. entrée, jr. side" — so a
   * Kids Meal is a different, smaller product, not a cheaper way to buy the
   * same food. Without this flag it is the cheapest plate containing any given
   * entrée, and every upsell on the site would point at it.
   */
  junior?: true;
  modifierGroups?: string[];
  /**
   * Pre-built orders people actually place, option ids in group order.
   *
   * NOT RENDERED. It was a "What people order" list at the top of the item
   * sheet, and it turned out to be one more set of things to choose from
   * sitting directly above the set of things to choose from — the opposite of
   * the clarity the sheet was rebuilt for. The measurement behind it is real
   * and hard to re-obtain (three of the five most common orders on their
   * listing are the same entrée three times), so the data stays; the UI does
   * not. Delete both together if it is still unused when Square lands.
   */
  popularCombos?: Array<{ label: string; picks: string[] }>;
}

export interface MenuCategory {
  id: string;
  name: string;
  /** Shown under the category heading when the shop says something about it. */
  note?: string;
}

/* ── categories ───────────────────────────────────────────────────────────
 * Their listing repeats items under a "Most Ordered" section as well as their
 * real category. One place each here; `rank` carries the same information
 * without duplicating a row.
 */
/* ── derived detail ───────────────────────────────────────────────────────
 *
 * This menu is a graph, not a list. Twelve of the entrées are ALSO the choices
 * inside "Pick Any Three Items", and four of the sides are its side choices —
 * the same dish, priced two ways. The source listing never says so; it just
 * repeats the names in a dropdown.
 *
 * That relationship is the most useful thing we can tell someone looking at a
 * plain entrée, because 49 of these 68 items arrived with no description at
 * all. Rather than invent ingredients for food nobody here has cooked, the item
 * sheet reads the connection back out of the modifier groups. Nothing below is
 * a second copy of anything: delete a group and these answers change with it.
 */

/**
 * Group labels are written for the person filling the form, so some are nouns
 * ("Entrée", "Side") and some are prompts ("Fries or veg sticks"). Counting
 * needs the noun, or you get "6 choose a sodas".
 */
export function nounOf(g: ModifierGroup): string {
  if (g.noun) return g.noun;
  return g.label
    .toLowerCase()
    .replace(/^(choose|add|pick)\s+(a|an|the)\s+/, "")
    .replace(/s$/, "")
    .trim();
}

/** "entrée" wants "an". Vowel-initial is good enough for this vocabulary. */
export function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? "an" : "a";
}

/** "1 entrée", "3 entrées" — singular and plural off the same label. */
function countOf(n: number, g: ModifierGroup): string {
  const noun = nounOf(g);
  return n === 1 ? `1 ${noun}` : `${n} ${noun}s`;
}

/**
 * What a customer actually receives, for an item that carries modifier groups.
 * `null` for a plain dish, which receives itself and needs no explaining.
 */
export function whatYouGet(
  item: MenuItem,
): { included: string; choices: string; surcharge: string | null } | null {
  const groups = (item.modifierGroups ?? [])
    .map((id) => MODIFIER_GROUPS[id])
    .filter(Boolean);
  /*
   * A size is a property of the thing, not one of its parts. Counting it as a
   * component gave "1 size, 1 flavour and 1 soda", and reading its ladder as
   * surcharges gave "some choices add $3.00 or $9.00 or $27.00" — which is
   * true of a 30-piece box and useless as a warning. The size group is Step 1
   * of the rail regardless, so nobody misses it.
   */
  const required = groups.filter((g) => g.min > 0 && nounOf(g) !== "size");

  /*
   * Only worth spelling out for something assembled from parts. A fountain
   * drink has one required group too, but "what you get: 1 soda" above a list
   * of six sodas tells nobody anything.
   */
  const assembled = required.length >= 2 || required.some((g) => (g.repeat ?? 1) > 1);
  if (!assembled) return null;

  /* "1 flavour and 1 side and 1 soda" is three ands. Comma the list and keep
     "and" for the last join only. */
  const parts = required.map((g) => countOf((g.repeat ?? 1) * g.min, g));
  const included =
    parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];

  const choices = required.map((g) => countOf(g.options.length, g)).join(", ");

  const deltas = [
    ...new Set(
      required.flatMap((g) => g.options.filter((o) => o.priceDelta > 0).map((o) => o.priceDelta)),
    ),
  ].sort((a, b) => a - b);
  const surcharge = deltas.length
    ? `Some choices add ${deltas.map((d) => `$${d.toFixed(2)}`).join(" or ")}.`
    : null;

  return { included, choices, surcharge };
}

export const CATEGORIES: MenuCategory[] = [
  { id: "meals", name: "Pick a Meal" },
  { id: "house", name: "House Special" },
  /*
   * No standalone "Entrées" category.
   *
   * DoorDash sells single entrées at $7.99 and $11.19. Nobody else does: Uber
   * Eats has no such category, and the board lists these dishes only under
   * "ENTREE CHOICES" — the picker for Pick A Meal — with no price against any
   * of them. They were the last DoorDash prices left in this file once the
   * rest moved to Uber Eats, and side by side the two sources produced
   * nonsense: a single Sesame Chicken at $7.99 beside a Pick Any One Item —
   * an entrée AND a side — also at $7.99, so the site was offering to add a
   * side for nothing, and a plate of Mongolian Beef came out $2.20 cheaper
   * than the beef alone.
   *
   * If the counter really does sell a single entrée, this is one category and
   * sixteen items to restore — but it needs a price from the owner, not from
   * the one platform we stopped trusting (docs/ASIAN-KITCHEN.md §3b).
   */
  { id: "wings", name: "Wings" },
  {
    id: "philly",
    name: "Philly Steaks",
    note: "Upgrade to a combo with fries and a Coca-Cola. Extras cost more.",
  },
  { id: "sides", name: "Sides" },
  { id: "drinks", name: "Drinks" },
];

/* ── modifier groups ──────────────────────────────────────────────────────── */

/*
 * Uber Eats' eleven, in Uber Eats' order, read live on 1 Sep 2026 — the source
 * this menu now follows throughout.
 *
 * The in-store board lists four more: Kung Pao Chicken, Mushroom Chicken,
 * Pepper Steak and Jalapeño Shrimp. They are on neither platform, so they are
 * not offered here; if the owner says the board is right they are four lines
 * to add back. DoorDash lists two nobody else does — Chicken and Broccoli,
 * Spicy Grill Chicken — and they are gone with the rest of DoorDash's data.
 *
 * Heat is theirs too: they label General Tso, Black Pepper Chicken, Mongolian
 * Beef and Black Pepper Shrimp "(Mild)" and Spicy Beef "(Medium)", which is
 * the one and two chilli marks the board prints.
 */
const BEEF = 1.0;
const SHRIMP = 1.5;

const ENTREES: ModifierOption[] = [
  { id: "e-honey", name: "Honey Chicken", priceDelta: 0, calories: 490 },
  { id: "e-sesame", name: "Sesame Chicken", priceDelta: 0, calories: 520 },
  { id: "e-tso", name: "General Tso Chicken", priceDelta: 0, calories: 450, spice: 1 },
  { id: "e-orange", name: "Orange Chicken", priceDelta: 0, calories: 490 },
  { id: "e-bpchicken", name: "Black Pepper Chicken", priceDelta: 0, calories: 180, spice: 1 },
  { id: "e-teriyaki", name: "Grilled Teriyaki Chicken", priceDelta: 0, calories: 320 },
  { id: "e-veg", name: "Mixed Vegetables", priceDelta: 0, calories: 130 },
  { id: "e-brocbeef", name: "Broccoli Beef", priceDelta: BEEF, calories: 150, premium: true },
  { id: "e-mongolian", name: "Mongolian Beef", priceDelta: BEEF, calories: 150, spice: 1, premium: true },
  { id: "e-spicybeef", name: "Spicy Beef", priceDelta: BEEF, calories: 180, spice: 2, premium: true },
  { id: "e-bpshrimp", name: "Black Pepper Shrimp", priceDelta: SHRIMP, calories: 200, spice: 1, premium: true },
];

const SIDES: ModifierOption[] = [
  { id: "s-lomein", name: "Lo Mein", priceDelta: 0, calories: 570 },
  { id: "s-friedrice", name: "Fried Rice", priceDelta: 0, calories: 520 },
  { id: "s-steamrice", name: "Steamed Rice", priceDelta: 0, calories: 380 },
  { id: "s-veg", name: "Mixed Vegetables", priceDelta: 0, calories: 80 },
  { id: "s-eggroll", name: "Chicken Egg Roll", priceDelta: 0, calories: 150 },
  { id: "s-springroll", name: "Veg Spring Roll", priceDelta: 0, calories: 120 },
  { id: "s-rangoon", name: "Cream Cheese Rangoon", priceDelta: 0, calories: 190 },
];

/*
 * Uber Eats' nine, in their order — and here the board is the odd one out.
 *
 *   Uber Eats + DoorDash   these nine, no Mango Habanero
 *   in-store board         seven, including Mango Habanero, and without
 *                          Mild, Asian BBQ or Orange
 *
 * The opposite of the price story, where the board and Uber Eats agreed
 * against DoorDash. Two platforms beat one photograph, so this follows them —
 * but Mango Habanero may be a genuinely new in-store flavour that has not
 * reached either platform yet, which is an owner question rather than a
 * conflict to resolve here.
 */
const WING_FLAVOURS: ModifierOption[] = [
  { id: "w-buffalo", name: "Buffalo", priceDelta: 0, spice: 2 },
  { id: "w-asianspice", name: "Asian Spice", priceDelta: 0, spice: 1 },
  { id: "w-sweetchili", name: "Sweet Chili", priceDelta: 0, spice: 1 },
  { id: "w-mild", name: "Mild", priceDelta: 0 },
  { id: "w-lemonpepper", name: "Lemon Pepper", priceDelta: 0 },
  { id: "w-asianbbq", name: "Asian BBQ", priceDelta: 0 },
  { id: "w-teriyaki", name: "Teriyaki", priceDelta: 0 },
  { id: "w-honeyglaze", name: "Honey Glaze", priceDelta: 0 },
  { id: "w-orange", name: "Orange", priceDelta: 0 },
];

export const MODIFIER_GROUPS: Record<string, ModifierGroup> = {
  "entree-1": { id: "entree-1", label: "Entrée", min: 1, max: 1, repeat: 1, options: ENTREES },
  "entree-2": { id: "entree-2", label: "Entrées", min: 1, max: 1, repeat: 2, options: ENTREES },
  "entree-3": { id: "entree-3", label: "Entrées", min: 1, max: 1, repeat: 3, options: ENTREES },
  side: { id: "side", label: "Side", min: 1, max: 1, options: SIDES },
  /* Family Feast is three sides and two entrées — not the three-entrée shape
     we had it wearing. See the note on `meal-family`. */
  "side-3": { id: "side-3", label: "Sides", min: 1, max: 1, repeat: 3, options: SIDES },
  "wing-flavour": {
    id: "wing-flavour",
    label: "Flavour",
    min: 1,
    max: 1,
    options: WING_FLAVOURS,
  },
  "fountain-flavour": {
    id: "fountain-flavour",
    label: "Choose a soda",
    min: 1,
    max: 1,
    options: [
      { id: "d-coke", name: "Coca-Cola", priceDelta: 0 },
      { id: "d-diet", name: "Diet Coke", priceDelta: 0 },
      { id: "d-sprite", name: "Sprite", priceDelta: 0 },
      { id: "d-fanta", name: "Fanta", priceDelta: 0 },
      { id: "d-hic", name: "Hi-C Fruit Punch", priceDelta: 0 },
      { id: "d-pibb", name: "Pibb Xtra", priceDelta: 0 },
    ],
  },
  "fruit-flavour": {
    id: "fruit-flavour",
    label: "Flavour",
    min: 1,
    max: 1,
    options: [
      { id: "f-strawberry", name: "Strawberry", priceDelta: 0 },
      { id: "f-blueberry", name: "Blueberry", priceDelta: 0 },
      { id: "f-peach", name: "Peach", priceDelta: 0 },
    ],
  },
  "add-drinks": {
    id: "add-drinks",
    label: "Add a drink",
    min: 0,
    max: 5,
    options: [
      { id: "a-fruitlem", name: "Fruit Lemonade", priceDelta: 3.49 },
      { id: "a-fruittea", name: "Fruit Tea", priceDelta: 3.49 },
      { id: "a-fountain", name: "Fountain Drink", priceDelta: 2.99 },
      { id: "a-origlem", name: "Original Lemonade", priceDelta: 2.99 },
      { id: "a-sweettea", name: "Brewed Sweet Iced Tea", priceDelta: 2.99 },
    ],
  },
  /*
   * How many wings is a choice, not nine separate menu items.
   *
   * We had 6 / 10 / 15 / 30 / 50 as their own tiles, twice over — once plain
   * and once as combos — so the Wings section was nine cards for what is
   * really two products. Uber Eats asks for the count instead, and its deltas
   * land on exactly the prices we were hardcoding: 8.49 + 3.00 = 11.49,
   * + 9.00 = 17.49, + 27.00 = 35.49.
   *
   * The board's 50-piece party size is on neither platform and goes with the
   * other board-only extras; so does its "fries or veg sticks" choice, which
   * Uber Eats does not offer — their combo comes with fries, full stop.
   */
  "wing-size": {
    id: "wing-size",
    label: "How many",
    noun: "size",
    min: 1,
    max: 1,
    options: [
      { id: "ws-6", name: "6 pcs (Small)", priceDelta: 0 },
      { id: "ws-10", name: "10 pcs (Medium)", priceDelta: 3 },
      { id: "ws-15", name: "15 pcs (Large)", priceDelta: 9 },
      { id: "ws-30", name: "30 pcs (Extra Large)", priceDelta: 27 },
    ],
  },
  /*
   * Every cheesesteak is sold in three sizes and we carried one price, the
   * small. The deltas are the board's spread over its own small; the base price
   * stays as it is, because the board photographs may be some years old and
   * pricing is a separate question from structure.
   */
  "philly-size": {
    id: "philly-size",
    label: "Size",
    min: 1,
    max: 1,
    options: [
      { id: "ps-small", name: "Small", priceDelta: 0, calories: 490 },
      { id: "ps-regular", name: "Regular", priceDelta: 2.5 },
      { id: "ps-large", name: "Large", priceDelta: 5.5, calories: 1120 },
    ],
  },
  /* Uber Eats' six, in their order. We were missing Hot Pepper Relish. */
  "philly-extras": {
    id: "philly-extras",
    label: "Add-ons",
    min: 0,
    max: 6,
    options: [
      { id: "px-bacon", name: "Bacon", priceDelta: 1, calories: 75 },
      { id: "px-cheese", name: "Extra Cheese", priceDelta: 1, calories: 65 },
      { id: "px-jalapeno", name: "Jalapeños", priceDelta: 1, calories: 10 },
      { id: "px-banana", name: "Banana Peppers", priceDelta: 1, calories: 0 },
      { id: "px-relish", name: "Hot Pepper Relish", priceDelta: 1, calories: 15 },
      { id: "px-meat", name: "Extra Meat", priceDelta: 2, calories: 150 },
    ],
  },
  /*
   * The combo upgrade. Every Philly card carried the line "Upgrade to a combo
   * with fries and a Coca-Cola" — transcribed from the category description —
   * and there was no way whatsoever to do it. The site was advertising a
   * product it could not sell.
   *
   * One optional pick, exactly as Uber Eats models it, at the board's own
   * "Upgrade To Combo · Start From $3.49".
   */
  "philly-combo": {
    id: "philly-combo",
    label: "Make it a combo",
    noun: "combo",
    min: 0,
    max: 1,
    options: [
      { id: "pc-combo", name: "Add fries and a Coca-Cola", priceDelta: 3.49 },
    ],
  },
  /* The board prices every fountain and lemonade twice. We had one price and
     no way to ask for the large. */
  "drink-size": {
    id: "drink-size",
    label: "Size",
    min: 1,
    max: 1,
    options: [
      { id: "dz-regular", name: "Regular", priceDelta: 0 },
      { id: "dz-large", name: "Large", priceDelta: 1 },
    ],
  },
  "add-sides": {
    id: "add-sides",
    label: "Add a side",
    min: 0,
    max: 5,
    options: [
      { id: "a-eggroll", name: "Chicken Egg Roll", priceDelta: 1.5 },
      { id: "a-rangoon", name: "Cream Cheese Rangoon", priceDelta: 2.0 },
      { id: "a-springroll", name: "Veg Spring Roll", priceDelta: 1.0 },
      { id: "a-cajunranch", name: "Cajun Ranch Fries", priceDelta: 3.49 },
      { id: "a-mozz", name: "Mozzarella Sticks", priceDelta: 3.99 },
    ],
  },
};

/* ── items ────────────────────────────────────────────────────────────────── */

const img = (file: string) => `/asian-kitchen/menu/${file}`;

export const ITEMS: MenuItem[] = [
  // ── Pick a Meal ─────────────────────────────────────────────────────────
  {
    id: "meal-3",
    categoryId: "meals",
    name: "Pick Any Three Items",
    description: "3 entrées & 1 side",
    price: 10.99,
    image: img("pick-any-three-items.jpg"),
    rank: 1,
    modifierGroups: ["entree-3", "side", "add-drinks", "add-sides"],
    popularCombos: [
      { label: "Sesame Chicken ×3 · Fried Rice", picks: ["e-sesame", "e-sesame", "e-sesame", "s-friedrice"] },
      { label: "Honey Chicken ×3 · Lo Mein", picks: ["e-honey", "e-honey", "e-honey", "s-lomein"] },
      { label: "Honey · Sesame · Orange · Lo Mein", picks: ["e-honey", "e-sesame", "e-orange", "s-lomein"] },
    ],
  },
  {
    id: "meal-2",
    categoryId: "meals",
    name: "Pick Any Two Items",
    description: "2 entrées & 1 side",
    price: 9.49,
    image: img("pick-any-two-items.jpg"),
    
    modifierGroups: ["entree-2", "side", "add-drinks", "add-sides"],
    popularCombos: [
      { label: "Sesame Chicken ×2 · Fried Rice", picks: ["e-sesame", "e-sesame", "s-friedrice"] },
      { label: "Honey Chicken ×2 · Lo Mein", picks: ["e-honey", "e-honey", "s-lomein"] },
    ],
  },
  {
    id: "meal-1",
    categoryId: "meals",
    name: "Pick Any One Item",
    description: "1 entrée & 1 side",
    price: 7.99,
    image: img("pick-any-one-item.jpg"),
    rank: 2,
    modifierGroups: ["entree-1", "side", "add-drinks", "add-sides"],
  },
  {
    id: "meal-kids",
    categoryId: "meals",
    name: "Kids Meal",
    description: "Jr. entrée, jr. side, 12 oz drink & cookie",
    junior: true,
    price: 5.99,
    image: img("kids-meal.jpg"),
    modifierGroups: ["entree-1", "side"],
  },
  {
    id: "meal-family",
    categoryId: "meals",
    name: "Family Feast",
    /*
     * The board: "3 sides, 2 entrées, 4 egg rolls & cookies · Serves 3-4".
     * We had this reusing the Pick-Any-Three shape — three entrées and one
     * side — which is a different meal. The egg rolls and cookies come with it
     * and are not chosen, so they belong in the description, not in a group.
     */
    description: "3 sides, 2 entrées, 4 egg rolls & cookies · serves 3–4",
    price: 32.49,
    image: img("family-feast.jpg"),
    modifierGroups: ["entree-2", "side-3"],
  },

  // ── House Special ───────────────────────────────────────────────────────
  { id: "h-comborice", categoryId: "house", name: "Combination Fried Rice", description: "Perfect combination of fried rice with shrimp, beef and chicken", price: 12.49, image: img("combination-fried-rice.jpg") },
  { id: "h-combolo", categoryId: "house", name: "Combination Lo Mein", description: "Chicken, shrimp & beef", price: 12.49, image: img("combination-lo-mein.jpg") },
  { id: "h-shrimprice", categoryId: "house", name: "Shrimp Fried Rice", price: 11.49, image: img("shrimp-fried-rice.jpg") },
  { id: "h-shrimplo", categoryId: "house", name: "Shrimp Lo Mein", price: 11.49, image: img("shrimp-lo-mein.jpg") },
  { id: "h-beefrice", categoryId: "house", name: "Beef Fried Rice", price: 11.49, image: img("beef-fried-rice.jpg") },
  { id: "h-beeflo", categoryId: "house", name: "Beef Lo Mein", price: 11.49, image: img("beef-lo-mein.jpg") },
  { id: "h-chickenrice", categoryId: "house", name: "Chicken Fried Rice", price: 10.49, image: img("chicken-fried-rice.jpg") },
  { id: "h-chickenlo", categoryId: "house", name: "Chicken Lo Mein", price: 10.49, image: img("chicken-lo-mein.jpg") },


  // ── Wings ───────────────────────────────────────────────────────────────
  { id: "w-plain", categoryId: "wings", name: "Wings", description: "Crispy and flavorful wings served with your choice of sauce", price: 8.49, image: img("6-pieces-wings-small.jpg"), modifierGroups: ["wing-size", "wing-flavour"] },
  { id: "w-combo", categoryId: "wings", name: "Wings Combo", description: "Regular fries and a drink · 32 oz drink on the extra large", price: 11.49, image: img("10-pieces-wings-combo-medium.jpg"), rank: 3, modifierGroups: ["wing-size", "wing-flavour", "fountain-flavour"] },

  // ── Philly ──────────────────────────────────────────────────────────────
  { id: "p-bacon", categoryId: "philly", name: "Bacon Cheesesteak", description: "Bacon, steak, grilled onions, mushrooms, cheese, lettuce, tomato, mayo & pickle", price: 7.99, image: img("bacon-cheesesteak.jpg"), modifierGroups: ["philly-size", "philly-extras", "philly-combo"] },
  { id: "p-original", categoryId: "philly", name: "Original Cheesesteak", description: "Steak, grilled onions, mushrooms, green peppers, cheese, lettuce, tomato, mayo & pickle", price: 6.99, image: img("original-cheesesteak.jpg"), modifierGroups: ["philly-size", "philly-extras", "philly-combo"] },
  { id: "p-chickensteak", categoryId: "philly", name: "Chicken & Steak Philly", description: "Chicken, steak, grilled onions, mushrooms, cheese, green peppers, lettuce, tomato, mayo & pickle", price: 6.99, image: img("chicken-and-steak-philly.jpg"), modifierGroups: ["philly-size", "philly-extras", "philly-combo"] },
  { id: "p-jalapeno", categoryId: "philly", name: "Jalapeño Cheesesteak", description: "Steak, jalapeño, grilled onions, mushrooms, green peppers, cheese, lettuce, tomato, mayo & pickle", price: 6.99, image: img("jalapeno-cheesesteak.jpg"), modifierGroups: ["philly-size", "philly-extras", "philly-combo"] },
  { id: "p-teriyaki", categoryId: "philly", name: "Chicken Teriyaki Philly", description: "Chicken, grilled onions, mushrooms, green peppers, cheese, teriyaki sauce, lettuce, tomato, mayo & pickle", price: 6.79, image: img("chicken-teriyaki-philly.jpg"), modifierGroups: ["philly-size", "philly-extras", "philly-combo"] },
  { id: "p-chicken", categoryId: "philly", name: "Original Philly Chicken", description: "Chicken, grilled onions, mushrooms, green peppers, cheese, lettuce, tomato, mayo & pickle", price: 6.79, image: img("original-philly-chicken.jpg"), modifierGroups: ["philly-size", "philly-extras", "philly-combo"] },

  // ── Sides ───────────────────────────────────────────────────────────────
  { id: "sd-veg", categoryId: "sides", name: "Side Mixed Vegetables", price: 5.49, image: img("side-mixed-vegetables.jpg") },
  { id: "sd-lomein", categoryId: "sides", name: "Side Lo Mein", description: "Original lo mein cooked with brown sauce, cabbage and carrots", price: 4.99, image: img("side-lo-mein.jpg") },
  { id: "sd-friedrice", categoryId: "sides", name: "Side Fried Rice", description: "Chinese fried rice with eggs, peas and carrots", price: 3.99, image: img("side-fried-rice.jpg") },
  { id: "sd-mozz", categoryId: "sides", name: "Mozzarella Sticks", price: 3.99, image: img("mozzarella-sticks.jpg") },
  { id: "sd-cajunranchcheese", categoryId: "sides", name: "Cajun Ranch Cheese Fries", price: 3.99, image: img("cajun-ranch-cheese-fries.jpg") },
  { id: "sd-gourmet", categoryId: "sides", name: "Gourmet Fries", price: 3.79, image: img("gourmet-fries.jpg") },
  { id: "sd-cajunranch", categoryId: "sides", name: "Cajun Ranch Fries", description: "Crispy fries topped with creamy ranch dressing and a sprinkle of Cajun seasoning", price: 3.49, image: img("cajun-ranch-fries.jpg") },
  { id: "sd-cajuncheese", categoryId: "sides", name: "Cajun Cheese Fries", price: 3.49, image: img("cajun-cheese-fries.jpg") },
  { id: "sd-cheesefries", categoryId: "sides", name: "Cheese Fries", price: 3.49, image: img("cheese-fries.jpg") },
  { id: "sd-steamrice", categoryId: "sides", name: "Side Steamed Rice", price: 2.99, image: img("side-steam-rice.jpg") },
  { id: "sd-cajun", categoryId: "sides", name: "Cajun Fries", price: 2.99, image: img("cajun-fries.jpg") },
  { id: "sd-fries", categoryId: "sides", name: "Original Fries", price: 2.49, image: img("original-fries.jpg") },
  { id: "sd-rangoon", categoryId: "sides", name: "Cream Cheese Rangoon", price: 2.0, image: img("cream-cheese-rangoon.jpg") },
  { id: "sd-eggroll", categoryId: "sides", name: "Chicken Egg Roll", price: 1.5, image: img("chicken-eggroll.jpg") },
  { id: "sd-springroll", categoryId: "sides", name: "Veg Spring Roll", price: 1.0, image: img("vegetables-springroll.jpg") },
  { id: "sd-yumyum", categoryId: "sides", name: "Yum Yum Sauce", price: 0.5, image: img("yum-yum-sauce.jpg") },

  // ── Drinks ──────────────────────────────────────────────────────────────
  { id: "dr-fruitlem", categoryId: "drinks", name: "Fruit Lemonade", price: 2.99, image: img("fruit-lemonade.jpg"), modifierGroups: ["drink-size", "fruit-flavour"] },
  { id: "dr-fruittea", categoryId: "drinks", name: "Fruit Tea", price: 3.49, image: img("fruit-tea.jpg"), modifierGroups: ["fruit-flavour"] },
  { id: "dr-bottled", categoryId: "drinks", name: "Bottled Drinks", price: 2.49, image: img("bottled-drinks.jpg") },
  { id: "dr-origlem", categoryId: "drinks", name: "Original Lemonade", price: 2.49, image: img("original-lemonade.jpg"), modifierGroups: ["drink-size"] },
  { id: "dr-sweettea", categoryId: "drinks", name: "Brewed Sweet Iced Tea", price: 1.99, image: img("brewed-sweet-iced-tea.jpg"), modifierGroups: ["drink-size"] },
  { id: "dr-arnold", categoryId: "drinks", name: "Arnold Palmer", price: 2.99, image: img("arnold-palmer.jpg") },
  { id: "dr-fountain", categoryId: "drinks", name: "Fountain Drink", price: 1.99, image: img("fountain-drink.jpg"), modifierGroups: ["drink-size", "fountain-flavour"] },
  { id: "dr-water", categoryId: "drinks", name: "Bottled Water", price: 1.99, image: img("bottled-water.jpg") },
];

/* ── helpers ──────────────────────────────────────────────────────────────── */

export const itemsIn = (categoryId: string) => ITEMS.filter((i) => i.categoryId === categoryId);

export const itemById = (id: string) => ITEMS.find((i) => i.id === id);

export const groupById = (id: string) => MODIFIER_GROUPS[id];

/** The store's three most-liked items, in rank order. */
export const RANKED = ITEMS.filter((i) => i.rank).sort((a, b) => a.rank! - b.rank!);

export const optionById = (id: string): ModifierOption | undefined => {
  for (const g of Object.values(MODIFIER_GROUPS)) {
    const found = g.options.find((o) => o.id === id);
    if (found) return found;
  }
  return undefined;
};
