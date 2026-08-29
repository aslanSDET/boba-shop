"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, ShoppingBag } from "lucide-react";
import { categoryIdByName, MENU_CATEGORIES, MENU_ITEMS, startingPrice } from "@/config/menu";
import { SHOP } from "@/config/shop";
import { Testimonials } from "@/components/testimonials";
import { SiteFooter } from "@/components/site-footer";
import { OpenBadge } from "@/components/open-badge";
import { PromoStrip } from "@/components/promo-strip";
import { Wordmark } from "@/components/wordmark";
import { HeroArt } from "@/components/hero-art";
import { formatPrice } from "@/lib/format";
import { ItemVisual } from "@/components/item-visual";
import { ModifierDrawer } from "@/components/modifier-drawer";
import { CartSheet } from "@/components/cart-sheet";
import { CartBarButton } from "@/components/cart-bar-button";
import { useCart } from "@/store/useCart";
import { cn } from "@/lib/utils";
import type { MenuItem } from "@/types/boba";

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

export default function Home() {
  const [activeCategory, setActiveCategory] = useState(MENU_CATEGORIES[0].id);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const itemCount = useCart((s) => s.totalItemCount());
  const railRef = useRef<HTMLElement>(null);
  const railScrollerRef = useRef<HTMLDivElement>(null);

  const itemsForCategory = useMemo(
    () => MENU_ITEMS.filter((item) => item.categoryId === activeCategory),
    [activeCategory],
  );

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

  function handlePromo(target: string) {
    if (target === "locations") {
      document.getElementById("locations")?.scrollIntoView({ block: "center" });
      return;
    }
    // Promo cards name a category, because category ids are Clover's and change
    // on a re-import. Before this resolved by name they still held ids from the
    // hand-written menu ("shaved-snow"), so two of the three cards selected a
    // category that no longer exists and emptied the grid.
    const id = categoryIdByName(target);
    if (id) selectCategory(id);
  }

  function openDrawerFor(item: MenuItem) {
    setSelectedItem(item);
    setDrawerOpen(true);
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Ahead of the menu sit two CTAs, two status pills, three promo cards and
          six category buttons — too much to tab through to reach an order. */}
      <a
        href="#menu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-5 focus:py-3 focus:text-[15px] focus:font-semibold focus:text-primary-foreground focus:outline-2 focus:outline-offset-2 focus:outline-brand-ink"
      >
        Skip to menu
      </a>

      {/* Slim utility bar keeps pickup context pinned without stealing hero space */}
      <div className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <p className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
            Pickup · {SHOP.pickupLocation}
          </p>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={`Open order, ${itemCount} items`}
            className="relative grid size-11 shrink-0 place-items-center rounded-full border border-border bg-card transition-colors hover:border-primary"
          >
            <ShoppingBag className="size-[18px]" />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 font-mono text-[11px] leading-5 font-semibold text-primary-foreground tabular-nums">
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <section className="relative overflow-hidden border-b border-border bg-accent">
        {/* Decorative product shots fill the hero the way both reference sites do.
            Four corners rather than two: the bottom pair alone left the top half
            reading as empty next to the references. Larger, lower-set pair at the
            bottom, smaller pair up top, so the eye still lands on the wordmark.

            Egg puffs is the one full-frame photo here (no alpha, `cover` in
            menu.ts), so it gets the circular crop the promo strip and the menu
            tiles already use rather than floating as a hard rectangle. No
            rotation — a circle has nothing to rotate. */}
        {/* Larger than the other three on purpose: it is a cropped circle rather
            than a free-floating cut-out, so it needs more area to read as a
            product. Sourced from the AVIF (456x550) instead of the 400x480 PNG
            because at 250px on a 2x screen the PNG has no resolution to spare. */}
        <HeroArt
          src="/eggpuffs.avif"
          width={456}
          height={550}
          sizes="(min-width: 1280px) 250px, 180px"
          className="pointer-events-none absolute -top-4 left-2 hidden size-[180px] rounded-full object-cover lg:block xl:top-0 xl:left-10 xl:size-[250px]"
        />
        <HeroArt
          src="/menu/mangonada.png"
          width={300}
          height={360}
          sizes="(min-width: 1280px) 190px, 165px"
          className="pointer-events-none absolute -top-10 -right-12 hidden h-auto w-[165px] rotate-[-11deg] lg:block xl:-top-6 xl:-right-6 xl:w-[190px]"
        />
        <HeroArt
          src="/menu/brown-sugar-milk-tea.png"
          width={300}
          height={360}
          sizes="(min-width: 1280px) 260px, 220px"
          className="pointer-events-none absolute -bottom-6 -left-10 hidden h-auto w-[220px] rotate-[-8deg] lg:block xl:-left-4 xl:w-[260px]"
        />
        <HeroArt
          src="/menu/asian-ice.png"
          width={300}
          height={360}
          sizes="(min-width: 1280px) 260px, 220px"
          className="pointer-events-none absolute -right-10 -bottom-8 hidden h-auto w-[220px] rotate-[7deg] lg:block xl:-right-4 xl:w-[260px]"
        />
        <header className="relative mx-auto flex w-full max-w-2xl flex-col items-center px-5 pt-14 pb-12 text-center sm:px-8 sm:pt-20">
          {/* "Snowdaes" is set `whitespace-nowrap`, so its width is not a
              layout result but a fixed multiple of the font-size: 4.68em in
              Fraunces 600 with `tracking-tight` (4.8825em of advances, less
              8 x 0.025em of negative tracking). A flat 192px from the `sm`
              breakpoint up was therefore 899px of unbreakable text at a
              640px viewport, which is why it both got guillotined by the
              section's `overflow-hidden` below ~900px and ran under the
              corner art above `lg`. The size has to be derived from the
              space available, not picked.

              Below `lg` the only constraint is the viewport, so 17vw (capped
              at 9rem) keeps the phone lockup the size it already was.

              From `lg` the art appears and becomes the binding constraint:
              the left shot reaches x=188 at `lg` and x=290 at `xl`, so the
              half-width has to stay clear of 290px. `(100vw - 676px) / 4.75`
              solves that with ~50px of air, and the 4.75 divisor is the
              4.68em text ratio rounded up so the margin errs wide. */}
          <h1 className="text-[length:clamp(3rem,17vw,9rem)] leading-[0.9] whitespace-nowrap lg:text-[length:clamp(8rem,calc((100vw-676px)/4.75),12rem)]">
            {/* The mark is 0.65em: up to ~94px below lg, ~125px at the 12rem cap */}
            <Wordmark priority sizes="(min-width: 1024px) 125px, 95px" />
          </h1>
          <p className="mt-4 font-display text-2xl leading-snug text-brand-ink italic sm:mt-5 sm:text-[2rem]">
            {SHOP.tagline}
          </p>
          <p className="mx-auto mt-4 max-w-[46ch] text-base leading-relaxed text-muted-foreground sm:text-[17px]">
            {SHOP.blurb}
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() =>
                railRef.current?.scrollIntoView({ block: "start" })
              }
              className="rounded-full bg-primary px-7 py-4 text-base font-semibold text-primary-foreground transition-transform duration-150 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
            >
              See the menu
            </button>
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById("locations")
                  ?.scrollIntoView({ block: "center" })
              }
              className="rounded-full border border-border bg-card px-7 py-4 text-base font-semibold transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
            >
              Find a shop
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            {/* Real, from the shop's Clover hours. Renders nothing when we
                cannot find out — see OpenBadge. */}
            <OpenBadge />
            {/* Still hardcoded, and correctly so: Clover returns no prep time,
                and this is the figure the owner puts on their own listing. */}
            <span className="rounded-full border border-border bg-card px-3.5 py-2">
              Ready in {SHOP.wait}
            </span>
          </div>
        </header>
      </section>

      <PromoStrip onSelect={handlePromo} />

      <div className="flex-1">
        <nav
          ref={railRef}
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

      <Testimonials />
      <div className={cn(itemCount > 0 && "pb-24")}>
        <SiteFooter />
      </div>

      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/92 px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <div className="mx-auto max-w-2xl">
            <CartBarButton onClick={() => setCartOpen(true)} />
          </div>
        </div>
      )}

      <ModifierDrawer
        key={selectedItem?.id ?? "none"}
        item={selectedItem}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
      <CartSheet open={cartOpen} onOpenChange={setCartOpen} />
    </div>
  );
}
