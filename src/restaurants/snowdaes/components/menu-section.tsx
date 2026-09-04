"use client";

import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { MENU_CATEGORIES, MENU_ITEMS, startingPrice } from "@/restaurants/snowdaes/menu";
import type { PromoStage } from "@/restaurants/snowdaes/featured";
import { PromoStrip } from "@/restaurants/snowdaes/components/promo-strip";
import { ItemVisual } from "@/restaurants/snowdaes/components/item-visual";
import { ModifierDrawer } from "@/restaurants/snowdaes/components/modifier-drawer";
import { formatPrice } from "@/restaurants/snowdaes/lib/format";
import { cn } from "@/restaurants/snowdaes/lib/utils";
import type { MenuItem } from "@/restaurants/snowdaes/types";

/*
 * The drawer is imported EAGERLY, and that is a measured decision rather than
 * an oversight.
 *
 * Lazy-loading it looked obviously right — a Radix dialog plus a vaul drawer,
 * none of it on screen at first paint — and it did cut first-paint JavaScript
 * from 290KB to 257KB. But it made the thing a customer actually does slower:
 * tapping a promo card went from 805ms to 1019ms at 6x CPU throttle, because
 * the chunk only starts downloading once the tap has already happened.
 *
 * Opening an item IS this page. Trading 33KB off first paint for 214ms onto
 * every single open is the wrong way round, so it stays eager. The cart sheet
 * in `cart-dock.tsx` is lazy on the same measurement read the other way: it is
 * opened once per visit, late, and never on the critical path.
 */

/**
 * Everything on the home page that reacts to a tap: the promo rail, the
 * category rail, the grid it filters, and the drawer all three can open.
 *
 * ── WHY THESE FOUR ARE ONE ISLAND AND NOT FOUR ───────────────────────────────
 *
 * They share two pieces of state and cannot be split without inventing a
 * channel between them: `activeCategory`, which the rail sets and the grid
 * reads, and `selectedItem`, which BOTH a grid tile and a promo card set. The
 * promo rail is not decoration next to the menu — "Add one" opens the same
 * drawer a tile opens, and "Start building" moves the same grid.
 *
 * What is NOT in here is the point of the file. The hero, its four product
 * shots, the wordmark, the testimonials and the footer are static markup, and
 * while they lived in one `"use client"` page they were shipped, parsed and
 * hydrated before a single tap worked anywhere. They are server-rendered HTML
 * now and cost the browser no JavaScript at all.
 */

/**
 * Eight shaved-snow items are `basePrice: 0` — Clover keeps their price in a
 * required "Snow Size" group — so a tile printing `basePrice` says "$0.00" and
 * the whole card reads as broken. `startingPrice` folds in the cheapest way to
 * satisfy the required groups; "from" only appears when that floor is genuinely
 * above the base, which is those eight items and nothing else.
 */
function ItemPrice({ item }: { item: MenuItem }) {
  const { amount, from } = startingPrice(item);
  return (
    <>
      {from && (
        <span className="mr-1.5 font-sans text-[13px] font-normal text-muted-foreground">
          from
        </span>
      )}
      {formatPrice(amount)}
    </>
  );
}

export function MenuSection() {
  const [activeCategory, setActiveCategory] = useState(MENU_CATEGORIES[0].id);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const railRef = useRef<HTMLElement>(null);
  const railScrollerRef = useRef<HTMLDivElement>(null);

  const itemsForCategory = useMemo(
    () => MENU_ITEMS.filter((item) => item.categoryId === activeCategory),
    [activeCategory],
  );

  function openDrawerFor(item: MenuItem) {
    setSelectedItem(item);
    setDrawerOpen(true);
  }

  function selectCategory(id: string) {
    setActiveCategory(id);
    // Otherwise a shorter category can leave you scrolled past its last item.
    railRef.current?.scrollIntoView({ block: "start" });
    // Eleven categories do not fit a 375px rail, so the one that just became
    // active is usually off-screen when the jump came from a promo card. Set
    // `scrollLeft` directly rather than calling `scrollIntoView` on the pill:
    // that would also scroll the page vertically and fight the line above.
    const scroller = railScrollerRef.current;
    const pill = scroller?.querySelector<HTMLElement>(`[data-category="${CSS.escape(id)}"]`);
    if (scroller && pill) {
      scroller.scrollTo({
        left: pill.offsetLeft - (scroller.clientWidth - pill.offsetWidth) / 2,
        behavior: "smooth",
      });
    }
  }

  /**
   * The three things a promo card is allowed to ask of this page.
   *
   * This replaced an `if`-chain that picked a target string apart — the page
   * deciding what a target MEANT, rather than the target knowing it. Each kind
   * resolves itself against this stage now (`featured.ts`), so adding a new
   * kind touches nothing here, and a category can no longer be shadowed by an
   * item that happens to share its name.
   *
   * Two verbs and not one with a flag: `openItem` owns "move the category
   * without scrolling" as an implementation detail, because a page scroll
   * racing a drawer's mount lands somewhere different on every viewport and on
   * a phone the sheet locks body scroll mid-animation. `revealCategory` DOES
   * scroll — no drawer opens, so a card that only swapped the active category
   * would change something a screen above the fold and read as a dead link.
   * Splitting them means no caller can pair them the wrong way round.
   */
  const promoStage: PromoStage = {
    openItem: (item) => {
      /* Quietly, without `selectCategory`'s scroll — see `PromoStage`. */
      setActiveCategory(item.categoryId);
      openDrawerFor(item);
    },
    revealCategory: selectCategory,
    showLocations: () =>
      document.getElementById("locations")?.scrollIntoView({ block: "center" }),
  };

  return (
    <>
      <PromoStrip onSelect={(target) => target.activate(promoStage)} />

      <div className="flex-1">
        <nav
          ref={railRef}
          id="menu-top"
          aria-label="Menu categories"
          className="sticky top-0 z-30 border-y border-border bg-background/88 backdrop-blur-md"
        >
          {/* `justify-center` on the scroller itself is a trap once the rail
              overflows — it pushes the first pills into the unreachable
              start-overflow, and eleven categories overflow even at max-w-6xl.
              An auto-margined `w-max` track centres when it fits and stays
              fully scrollable when it doesn't. Padding lives on the track so
              both ends survive the scroll. */}
          <div
            ref={railScrollerRef}
            className="no-scrollbar overflow-x-auto overscroll-x-contain py-3.5"
          >
            <div className="mx-auto flex w-max gap-2.5 px-5 sm:px-8">
              {MENU_CATEGORIES.map((category) => {
                const active = category.id === activeCategory;
                return (
                  <button
                    key={category.id}
                    type="button"
                    data-category={category.id}
                    aria-pressed={active}
                    onClick={() => selectCategory(category.id)}
                    className={cn(
                      "shrink-0 rounded-full px-5 py-3 text-base font-medium whitespace-nowrap transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground",
                    )}
                  >
                    {category.name}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        <main
          id="menu"
          className="mx-auto w-full max-w-6xl px-5 pt-8 pb-16 sm:px-8 sm:pt-10 sm:pb-20"
        >
          {itemsForCategory.length === 0 ? (
            <p className="py-20 text-center text-base text-muted-foreground">
              Nothing on the menu here yet. Try another category.
            </p>
          ) : (
            /* Card scroll margins keep a focused card clear of the sticky rail
               above and the fixed cart bar below (WCAG 2.4.11) */
            <ul className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
              {itemsForCategory.map((item) => (
                <li key={item.id} className="scroll-mt-24 scroll-mb-28">
                  <button
                    type="button"
                    onClick={() => openDrawerFor(item)}
                    className="group flex h-full w-full flex-col items-center rounded-3xl border border-border bg-card p-4 text-center transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_10px_28px_rgba(26,21,18,0.09)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink sm:p-5"
                  >
                    {/* Badge and + ride the circle so every card keeps the same text rhythm */}
                    <span className="relative mx-auto w-full max-w-[180px]">
                      <ItemVisual
                        item={item}
                        className="aspect-square w-full rounded-full"
                        px={360}
                        sizes="180px"
                      />
                      {item.isPopular && (
                        <span className="absolute top-0 left-0 rounded-full bg-primary px-2.5 py-1 font-mono text-[9px] tracking-[0.16em] text-primary-foreground uppercase">
                          Popular
                        </span>
                      )}
                      <span
                        aria-hidden
                        className="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground sm:size-10"
                      >
                        <Plus className="size-[18px]" />
                      </span>
                    </span>

                    <span className="mt-4 block font-display text-xl leading-snug font-semibold text-balance sm:text-[22px]">
                      {item.name}
                    </span>
                    {/* 42 of 93 items have `description: ""` in Clover. An
                        always-rendered subtitle leaves those cards carrying a
                        dangling empty line, so the element only exists when
                        there is copy for it. */}
                    {item.description && (
                      <span className="mt-1.5 line-clamp-2 text-[15px] leading-relaxed text-muted-foreground">
                        {item.description}
                      </span>
                    )}
                    <span className="mt-auto pt-3 font-mono text-base font-medium tabular-nums">
                      <ItemPrice item={item} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>

      <ModifierDrawer
        key={selectedItem?.id ?? "none"}
        item={selectedItem}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </>
  );
}
