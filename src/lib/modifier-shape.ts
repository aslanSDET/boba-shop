import type { ModifierGroup, ModifierOption } from "@/types/boba";

/**
 * Reads the structure Clover encodes in modifier *names*.
 *
 * The real catalog has a median of 55 options per item and a worst case of 94 —
 * "Rainbow Mango Toppings" alone has 36. Rendered flat, as the first version
 * did, that is a wall of pills nobody can shop from on a phone.
 *
 * But the wall is not flat. Across the menu's 4,962 options, 130 are named
 * "No X" and 139 "Extra X", and they pair up: a group is really *the two or
 * three things the drink comes with*, each of which can be removed or doubled,
 * followed by *the add-on list*. Thai Dye Toppings is 34 options and reads as
 * "comes with Rainbow Mochi and Fruity Pebbles, plus 30 you can add".
 *
 * Clover has no field saying this — the shop expressed it by naming things
 * carefully, and the naming is consistent enough to read. So this parses names
 * rather than inventing a schema, which also means a re-import cannot break it.
 * An unrecognised group degrades to "everything is an add-on", which is exactly
 * the old behaviour.
 */

/** Something the item comes with: removable, and sometimes doubleable. */
export interface IncludedIngredient {
  /** What a person calls it — "Rainbow Mochi", not "No Rainbow Mochi". */
  label: string;
  /** Selecting this is how you REMOVE the ingredient. */
  remove: ModifierOption;
  /** Selecting this doubles it, when the shop offers that. */
  extra?: ModifierOption;
}

export interface ShapedGroup {
  group: ModifierGroup;
  /** Non-empty only when the shop named things "No X". */
  included: IncludedIngredient[];
  /** Plain add-ons, minus any "Extra X" paired into `included`. */
  adds: ModifierOption[];
  required: boolean;
  /** Long, optional lists start closed so the required choice is reachable. */
  startClosed: boolean;
}

const NO = /^no\s+/i;
const EXTRA = /^extra\s+/i;
const norm = (s: string) => s.trim().toLowerCase();

/** Above this an add-on list is a scroll hazard rather than a set of choices. */
const LONG_LIST = 8;
/** Above this, finding one topping by eye stops working and needs a filter. */
export const FILTERABLE = 12;

export function shapeGroup(group: ModifierGroup): ShapedGroup {
  const required = group.min > 0;
  const included: IncludedIngredient[] = [];
  const pairedExtras = new Set<string>();

  for (const option of group.options) {
    if (!NO.test(option.name)) continue;
    const label = option.name.replace(NO, "").trim();
    const extra = group.options.find(
      (o) => EXTRA.test(o.name) && norm(o.name.replace(EXTRA, "")) === norm(label),
    );
    if (extra) pairedExtras.add(extra.id);
    included.push({ label, remove: option, extra });
  }

  const removeIds = new Set(included.map((i) => i.remove.id));
  const adds = group.options.filter((o) => !removeIds.has(o.id) && !pairedExtras.has(o.id));

  return {
    group,
    included,
    adds,
    required,
    startClosed: !required && adds.length > LONG_LIST,
  };
}

/**
 * Required groups first, then shortest first.
 *
 * Eight shaved-snow items are priced $0 because the price lives in a required
 * "Snow Size" group. If that group sits below a 34-option topping list, the
 * item looks free and the Add button looks broken. Ordering is not cosmetic
 * here — it is what makes those items buyable.
 */
export function shapeItemGroups(groups: ModifierGroup[]): ShapedGroup[] {
  return groups.map(shapeGroup).sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.group.options.length - b.group.options.length;
  });
}
