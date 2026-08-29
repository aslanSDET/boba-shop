import type {
  MenuCategory,
  MenuItem,
  ModifierGroup,
  SelectedModifiers,
} from "@/types/boba";
import { CATEGORIES as BILLERICA_CATEGORIES, ITEMS as BILLERICA_ITEMS } from "./menu.billerica.generated";
import { CATEGORIES as LOWELL_CATEGORIES, ITEMS as LOWELL_ITEMS } from "./menu.lowell.generated";

/**
 * The real menu, generated from each shop's own Clover catalog by
 * `scripts/import-menu.mjs`. Clover is the source of truth for names, prices
 * and modifiers (PLAN.md §8.7), so the data files are regenerated rather than
 * edited — this module only picks a location and holds the pricing helpers.
 *
 * The two stores genuinely differ (PLAN.md §8.6): Billerica carries 119 items
 * in 12 categories, Lowell 122 in 14, sharing 104 by name. There is no merged
 * menu and there must not be one — a customer standing in Lowell being offered
 * a Billerica-only drink is a wrong order, not a near miss.
 */
export type LocationId = "billerica" | "lowell";

export const LOCATIONS: Record<LocationId, { name: string; categories: MenuCategory[]; items: MenuItem[] }> = {
  billerica: { name: "North Billerica", categories: BILLERICA_CATEGORIES, items: BILLERICA_ITEMS },
  lowell: { name: "Lowell", categories: LOWELL_CATEGORIES, items: LOWELL_ITEMS },
};

/**
 * Shown until a location chooser exists. Billerica is the newer store and the
 * one whose ordering URL the project started from.
 */
export const DEFAULT_LOCATION: LocationId = "billerica";

/**
 * "Toppings", "Drizzles" and "MISC ITEMS" are real Clover categories, but they
 * hold counter add-ons — a $1 scoop of almonds — that online belong inside a
 * drink's modifier list, where 24 of the 26 already appear by name. They are
 * imported rather than dropped, because Clover owns the catalog and hiding data
 * at import time makes the mirror lie. They are filtered here, at the point of
 * presentation, which is a decision we can reverse in one line once the owner
 * confirms whether anyone buys them on their own.
 */
const ADDON_CATEGORIES = new Set(["Toppings", "Drizzles", "MISC ITEMS"]);

export const MENU_CATEGORIES: MenuCategory[] = LOCATIONS[DEFAULT_LOCATION].categories.filter(
  (c) => !ADDON_CATEGORIES.has(c.name),
);

export const MENU_ITEMS: MenuItem[] = LOCATIONS[DEFAULT_LOCATION].items.filter((item) =>
  MENU_CATEGORIES.some((c) => c.id === item.categoryId),
);

/**
 * Categories are looked up by NAME, not by id, for the same reason the
 * illustration colourways are (`src/config/item-art.ts`): the ids are Clover's,
 * opaque, and free to change whenever an item is rebuilt in their dashboard.
 * Anything in our own code that points at a category — a promo card, a deep
 * link — has to survive a re-import, and only the name does.
 */
export function categoryIdByName(name: string): string | undefined {
  const wanted = name.trim().toLowerCase();
  return MENU_CATEGORIES.find((c) => c.name.trim().toLowerCase() === wanted)?.id;
}

/**
 * The cheapest this item can actually be bought for, and whether that is a
 * floor rather than the price.
 *
 * Eight shaved-snow items carry `basePrice: 0` because Clover keeps their whole
 * price in a required "Snow Size" group — Thai Dye is $0.00 + Kiddie $9.25. A
 * tile rendering `basePrice` therefore reads "$0.00", which is not a cheap
 * dessert, it is a broken page. So the minimum cost of satisfying every
 * required group is folded in, and `from` says whether to label it as a floor.
 *
 * `from` is deliberately *not* set for a required group whose cheapest option
 * is free (every "Milk Tea Type" group, where oat milk is +$0.55 but the
 * default is $0.00). Those items have a real price; saying "from $6.45" would
 * be hedging a number we know exactly.
 */
export function startingPrice(item: MenuItem): { amount: number; from: boolean } {
  let amount = item.basePrice;
  let from = false;
  for (const group of item.modifierGroups) {
    if (group.min <= 0) continue;
    const cheapest = group.options
      .map((o) => o.priceDelta)
      .sort((a, b) => a - b)
      .slice(0, group.min)
      .reduce((sum, delta) => sum + delta, 0);
    amount += cheapest;
    if (cheapest > 0) from = true;
  }
  return { amount, from };
}

export function defaultSelection(item: MenuItem): SelectedModifiers {
  const selection: SelectedModifiers = {};
  for (const group of item.modifierGroups) {
    selection[group.id] = group.defaults ? [...group.defaults] : [];
  }
  return selection;
}

export function calculateCartItemPrice(
  item: MenuItem,
  modifiers: SelectedModifiers,
): number {
  let price = item.basePrice;
  for (const group of item.modifierGroups) {
    for (const optionId of modifiers[group.id] ?? []) {
      price += group.options.find((o) => o.id === optionId)?.priceDelta ?? 0;
    }
  }
  return price;
}

/** Groups that still need a choice before the item can be added. */
export function unmetGroups(
  item: MenuItem,
  modifiers: SelectedModifiers,
): ModifierGroup[] {
  return item.modifierGroups.filter(
    (g) => (modifiers[g.id] ?? []).length < g.min,
  );
}

/** "Large · 100% · Regular ice · Tapioca boba, Cheese foam" */
export function describeModifiers(
  item: MenuItem,
  modifiers: SelectedModifiers,
): string {
  const parts: string[] = [];
  for (const group of item.modifierGroups) {
    const names = (modifiers[group.id] ?? [])
      .map((id) => group.options.find((o) => o.id === id)?.name)
      .filter((n): n is string => Boolean(n));
    if (names.length > 0) parts.push(names.join(", "));
  }
  return parts.join(" · ");
}
