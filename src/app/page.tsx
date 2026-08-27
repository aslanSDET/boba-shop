"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Plus, ShoppingBag } from "lucide-react";
import { MENU_CATEGORIES, MENU_ITEMS } from "@/config/menu";
import { SHOP } from "@/config/shop";
import { Testimonials } from "@/components/testimonials";
import { SiteFooter } from "@/components/site-footer";
import { PromoStrip } from "@/components/promo-strip";
import { Wordmark } from "@/components/wordmark";
import { formatPrice } from "@/lib/format";
import { ItemVisual } from "@/components/item-visual";
import { ModifierDrawer } from "@/components/modifier-drawer";
import { CartSheet } from "@/components/cart-sheet";
import { CartBarButton } from "@/components/cart-bar-button";
import { useCart } from "@/store/useCart";
import { cn } from "@/lib/utils";
import type { MenuItem } from "@/types/boba";

export default function Home() {
  const [activeCategory, setActiveCategory] = useState(MENU_CATEGORIES[0].id);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const itemCount = useCart((s) => s.totalItemCount());
  const railRef = useRef<HTMLElement>(null);

  const itemsForCategory = useMemo(
    () => MENU_ITEMS.filter((item) => item.categoryId === activeCategory),
    [activeCategory],
  );

  function selectCategory(id: string) {
    setActiveCategory(id);
    // Otherwise a shorter category can leave you scrolled past its last item.
    railRef.current?.scrollIntoView({ block: "start" });
  }

  function handlePromo(target: string) {
    if (target === "locations") {
      document.getElementById("locations")?.scrollIntoView({ block: "center" });
      return;
    }
    selectCategory(target);
  }

  function openDrawerFor(item: MenuItem) {
    setSelectedItem(item);
    setDrawerOpen(true);
  }

  return (
    <div className="flex min-h-screen flex-col">
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
        {/* Decorative product shots fill the hero the way both reference sites do */}
        <Image
          src="/menu/brown-sugar-milk-tea.png"
          alt=""
          width={300}
          height={360}
          aria-hidden
          className="pointer-events-none absolute -bottom-6 -left-10 hidden w-[220px] rotate-[-8deg] lg:block xl:-left-4 xl:w-[260px]"
        />
        <Image
          src="/menu/asian-ice.png"
          alt=""
          width={300}
          height={360}
          aria-hidden
          className="pointer-events-none absolute -right-10 -bottom-8 hidden w-[220px] rotate-[7deg] lg:block xl:-right-4 xl:w-[260px]"
        />
        <header className="relative mx-auto flex w-full max-w-2xl flex-col items-center px-5 pt-14 pb-12 text-center sm:px-8 sm:pt-20">
          <h1 className="whitespace-nowrap text-[4rem] leading-[0.9] sm:text-[12rem]">
            <Wordmark />
          </h1>
          <p className="mt-4 font-display text-2xl leading-snug text-brand-ink italic sm:mt-5 sm:text-[2rem]">
            {SHOP.tagline}
          </p>
          <p className="mx-auto mt-4 max-w-[42ch] text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            {SHOP.blurb}
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() =>
                railRef.current?.scrollIntoView({ block: "start" })
              }
              className="rounded-full bg-primary px-6 py-3.5 text-[15px] font-semibold text-primary-foreground transition-transform duration-150 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
              className="rounded-full border border-border bg-card px-6 py-3.5 text-[15px] font-semibold transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Find a shop
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2">
              <span className="size-2 rounded-full bg-[#4f9d3a]" />
              Open now
            </span>
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
          <div className="no-scrollbar mx-auto flex max-w-6xl gap-2.5 overflow-x-auto px-5 py-3.5 sm:justify-center sm:px-8">
            {MENU_CATEGORIES.map((category) => {
              const active = category.id === activeCategory;
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectCategory(category.id)}
                  className={cn(
                    "shrink-0 rounded-full px-5 py-2.5 text-[15px] font-medium whitespace-nowrap transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
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
        </nav>

        <main className="mx-auto w-full max-w-6xl px-5 pt-8 pb-16 sm:px-8 sm:pt-10 sm:pb-20">
          {itemsForCategory.length === 0 ? (
            <p className="py-20 text-center text-base text-muted-foreground">
              Nothing on the menu here yet. Try another category.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
              {itemsForCategory.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openDrawerFor(item)}
                    className="group flex h-full w-full flex-col items-center rounded-3xl border border-border bg-card p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_10px_28px_rgba(26,21,18,0.09)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-5"
                  >
                    {/* Badge and + ride the circle so every card keeps the same text rhythm */}
                    <span className="relative mx-auto w-full max-w-[180px]">
                      <ItemVisual
                        item={item}
                        className="aspect-square w-full rounded-full"
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

                    <span className="mt-4 block font-display text-[19px] leading-snug font-semibold text-balance sm:text-xl">
                      {item.name}
                    </span>
                    <span className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-muted-foreground sm:text-sm">
                      {item.description}
                    </span>
                    <span className="mt-auto pt-3 font-mono text-[15px] font-medium tabular-nums">
                      {formatPrice(item.basePrice)}
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
