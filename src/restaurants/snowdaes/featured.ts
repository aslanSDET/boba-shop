import { categoryIdByName, itemByName } from "@/restaurants/snowdaes/menu";
import type { MenuItem } from "@/restaurants/snowdaes/types";

/**
 * The promo cards on the home page, and where each one sends you.
 *
 * ── WHY THIS IS NOT `promos.ts` ──────────────────────────────────────────────
 *
 * `promos.ts` already exists and means discount CODES sent to Clover
 * (`NEWCUSTOMER`, 10% off). These are marketing cards that happen to share the
 * word. One is money the till has to honour; the other is a picture on a page.
 * Merging them produces a bug where a marketing card looks like a discount.
 *
 * ── WHY THE TARGETS ARE CLASSES ──────────────────────────────────────────────
 *
 * This started as a bare string that `handlePromo` picked apart:
 *
 *     if (target === "locations") { ... }
 *     const item = itemByName(target); if (item) { ... }
 *     const id = categoryIdByName(target); if (id) { ... }
 *
 * — a page component switching on the shape of its data, which put the
 * knowledge of what a target MEANS in the component that reacts to it rather
 * than in the target. Adding a fifth kind meant editing that chain, and the
 * chain was ordered: a category that happened to share a name with an item
 * would have silently resolved to the item.
 *
 * Each kind now resolves itself against a `PromoStage` — the small set of
 * things the page can do. The component calls `target.activate(stage)` and
 * knows nothing else.
 */

/**
 * What the home page can do on a card's behalf. Deliberately three verbs and no
 * page internals: a target cannot reach for React state, a ref, or the DOM.
 */
export interface PromoStage {
  /**
   * Open an item's modifier drawer, over the grid for its own category.
   *
   * Setting that category is part of THIS verb rather than something a target
   * composes, because it comes with a constraint a caller would get wrong: the
   * page must not scroll while the drawer mounts. A smooth scroll racing the
   * mount lands somewhere different on every viewport, and on a phone the sheet
   * locks body scroll mid-animation. The drawer is what the reader is looking
   * at, so nothing needs to be brought into view behind it.
   */
  openItem(item: MenuItem): void;
  /**
   * Move the grid to a category AND bring it into view.
   *
   * The scroll is the whole point here — no drawer opens, so a card that only
   * swapped the active category would change something a screen above the fold
   * and read as a dead link. (It did: "Six toppings, your call" appeared to do
   * nothing at all.)
   */
  revealCategory(categoryId: string): void;
  /** Send the reader to the addresses in the footer. */
  showLocations(): void;
}

export abstract class PromoTarget {
  abstract activate(stage: PromoStage): void;
  /**
   * Where this card goes with NO JavaScript running.
   *
   * A promo card is painted long before the page is interactive — measured at
   * 810ms against 1654ms to first working tap on a 6x-throttled CPU — and for
   * that whole window a `<button onClick>` looked ready and silently ate the
   * tap. As an `<a href>` the card does something useful from the first paint,
   * and gains middle-click and open-in-new-tab on the way.
   *
   * It is deliberately a coarse destination. Only the active category's items
   * are in the DOM, so there is no `#item-…` to aim at for a drink filed under
   * a category the reader is not looking at; `#menu-top` is the honest answer
   * and it is the one the hydrated handler improves on, never contradicts.
   */
  abstract get href(): string;
}

/**
 * One drink or dessert, by NAME.
 *
 * Names, never Clover ids: ids are rewritten by `scripts/import-menu.mjs`, and
 * this already broke once — cards held ids from the hand-written menu
 * ("shaved-snow"), so after the first real import two of three selected a
 * category that no longer existed and emptied the grid.
 *
 * A name can go stale too, when the owner renames a drink in Clover. So an item
 * carries the category it lives in and falls back to it: a card that lands one
 * category away is better than a card that does nothing when tapped.
 */
export class ItemTarget extends PromoTarget {
  constructor(
    private readonly itemName: string,
    private readonly fallbackCategory: string,
  ) {
    super();
  }

  get href(): string {
    return "#menu-top";
  }

  activate(stage: PromoStage): void {
    const item = itemByName(this.itemName);
    if (item) {
      stage.openItem(item);
      return;
    }
    /* The name went stale. No drawer opens, so this falls through to the
       category and DOES scroll — same reasoning as `CategoryTarget`. */
    const categoryId = categoryIdByName(this.fallbackCategory);
    if (categoryId) stage.revealCategory(categoryId);
  }
}

/** A whole category, for a card whose point is the choice within it. */
export class CategoryTarget extends PromoTarget {
  constructor(private readonly categoryName: string) {
    super();
  }

  get href(): string {
    return "#menu-top";
  }

  activate(stage: PromoStage): void {
    const categoryId = categoryIdByName(this.categoryName);
    if (categoryId) stage.revealCategory(categoryId);
  }
}

/** The shop addresses in the footer. */
export class LocationsTarget extends PromoTarget {
  get href(): string {
    return "#locations";
  }

  activate(stage: PromoStage): void {
    stage.showLocations();
  }
}

export interface FeaturedPromo {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  /** Cut-outs float; full-frame shots get cropped into the corner. */
  fit: "contain" | "cover";
  /** A `--promo-tint-*` custom property from the restaurant's `theme.css`. */
  tint: string;
  /**
   * Absent means the card announces something you cannot act on here. It then
   * renders as a plain div with no CTA — not a disabled button, which would
   * still be announced as a control and still invite a tap.
   */
  target?: PromoTarget;
  cta?: string;
  /** Corner badge. For a standing caveat, not decoration. */
  badge?: string;
  /** One line under the CTA. Terms the reader must see. */
  fineprint?: string;
}

export const FEATURED: FeaturedPromo[] = [
  {
    id: "billerica",
    eyebrow: "Now open",
    title: "Billerica is serving",
    body: "Our second shop on Chelmsford Rd, same menu, shorter line.",
    image: "/brand/snowdaes-mark.png",
    fit: "contain",
    tint: "var(--promo-tint-1)",
    target: new LocationsTarget(),
    cta: "Get directions",
  },
  {
    id: "pandan-mango",
    eyebrow: "New",
    title: "Pandan Mango Sticky Rice",
    body: "Pandan almond milk, mango puree, coconut cream, sticky rice.",
    /* The catalog's own product shot, not the Instagram poster in
       `assets/menu-source/`: that poster's headline is baked into the pixels
       and lands ~7px tall in this card's thumbnail. Same file the menu tile
       uses, so card and item match. */
    image: "/menu/items/pandan-mango-sticky-rice.jpg",
    fit: "cover",
    tint: "var(--promo-tint-2)",
    target: new ItemTarget("Pandan Mango Sticky Rice", "Specialty Drinks"),
    cta: "Add one",
  },
  {
    id: "tote",
    eyebrow: "While supplies last",
    title: "Spend $25, take home a tote",
    body: "Canvas tote with the penguin on it, at the North Billerica counter.",
    /* A square of the bag's front, cropped from `assets/menu-source/tote.jpeg`
       at `extract({ left: 798, top: 829, width: 1072, height: 1072 })`. It
       replaced the penguin mark, which the "Billerica is serving" card two
       along was already using — two identical penguins in one rail, and
       neither said "tote".

       `cover` and not `contain`, which is what the other cut-outs use: those
       are transparent PNGs that float, and this source is a photo on a flat
       pale-blue ground that would show as a rectangle. Keying that ground out
       was tried and abandoned — the bag's left panel is a receding face
       catching blue ambient, so it measures 32-43 from the background while
       the drop shadow measures 36, and no single tolerance separates them.
       Filling the circle with the bag sidesteps the whole problem. */
    image: "/brand/snowdaes-tote.jpg",
    fit: "cover",
    tint: "var(--promo-tint-3)",
    /* No target and no CTA on purpose. The poster says "FOR IN STORE PURCHASES
       ONLY" twice, so there is nothing on this site to link to: a customer who
       spends $25 online and gets no tote will ring the shop, and the shop will
       be right. */
    badge: "In store",
    fineprint: "In-store purchases only — cannot be claimed on an online order.",
  },
  {
    id: "thai-dye",
    eyebrow: "Fan favourite",
    title: "Thai Dye snow",
    body: "Thai tea snow, rainbow mochi, Fruity Pebbles, condensed milk.",
    image: "/menu/thai-dye-snow.jpg",
    fit: "cover",
    tint: "var(--promo-tint-4)",
    target: new ItemTarget("Thai Dye", "Shaved Snow"),
    /* "Pick a size", not "Order one": Thai Dye is `basePrice: 0` and cannot be
       added until a snow size is chosen, so the CTA promises the step that
       actually happens. */
    cta: "Pick a size",
  },
  {
    id: "asian-ice",
    eyebrow: "Build your own",
    title: "Six toppings, your call",
    body: "Pick all six yourself. Red bean, mochi, lychee, mango, boba, corn.",
    image: "/menu/asian-ice.png",
    fit: "contain",
    tint: "var(--promo-tint-5)",
    /* A category, not an item: the point of the card is the choice among
       several ices, so landing in one drawer would be wrong. */
    target: new CategoryTarget("Asian Ice"),
    cta: "Start building",
  },
];
