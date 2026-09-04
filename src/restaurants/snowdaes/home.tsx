import { SHOP } from "@/restaurants/snowdaes/shop";
import { Testimonials } from "@/restaurants/snowdaes/components/testimonials";
import { SiteFooter } from "@/restaurants/snowdaes/components/site-footer";
import { OpenBadge } from "@/restaurants/snowdaes/components/open-badge";
import { Wordmark } from "@/restaurants/snowdaes/components/wordmark";
import { HeroArt } from "@/restaurants/snowdaes/components/hero-art";
import { MenuSection } from "@/restaurants/snowdaes/components/menu-section";
import { CartButton } from "@/restaurants/snowdaes/components/cart-button";
import { CartDock } from "@/restaurants/snowdaes/components/cart-dock";

/**
 * The Snowdaes home page. A SERVER component — note the absent `"use client"`.
 *
 * ── WHY THAT ONE MISSING LINE IS THE WHOLE POINT ─────────────────────────────
 *
 * This file used to open with `"use client"`, which in the App Router does not
 * mean "this component is interactive" — it means every component it imports
 * becomes part of the browser bundle too. So the hero's four product shots, the
 * wordmark, the testimonials and the entire footer were shipped as JavaScript,
 * parsed, and hydrated before anything on the page would respond to a tap.
 *
 * MEASURED on the build before this change, at 390px against a 6x-throttled
 * CPU (a mid-range phone): the first promo card painted at 810ms and did not
 * respond to a click until 1654ms. For 844ms it looked completely ready and
 * silently swallowed every tap. At 4x it was 593ms. That is the whole of the
 * "first load, things were not clickable" report.
 *
 * What is interactive here is genuinely small, and it is now the only thing
 * that ships: `MenuSection` (rail, grid, drawer, promo cards), `CartButton`,
 * `CartDock`, and `OpenBadge`. Everything else on this page is HTML.
 *
 * ── AND WHY THE TWO HERO BUTTONS ARE LINKS NOW ───────────────────────────────
 *
 * "See the menu" and "Find a shop" were `<button onClick={scrollIntoView}>`,
 * which needs a hydrated React tree to do anything at all. As anchors they work
 * from the first paint, before a single byte of JavaScript has run — and they
 * gain middle-click and open-in-new-tab, which the buttons never had.
 */
export function SnowdaesHome() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Ahead of the menu sit two CTAs, two status pills, five promo cards and
          eleven category buttons — too much to tab through to reach an order. */}
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
          <CartButton />
        </div>
      </div>

      <section className="relative overflow-hidden border-b border-border bg-accent">
        {/* Decorative product shots fill the hero the way both reference sites do.
            Four corners rather than two: the bottom pair alone left the top half
            reading as empty next to the references. Larger, lower-set pair at the
            bottom, smaller pair up top, so the eye still lands on the wordmark.

            The only DISC in the composition — egg puffs are a full-frame
            photograph and the other three are cut-outs that float and bleed.
            A solid circle carries far more visual weight than a transparent
            cut-out of the same width, so matching the cut-outs' 220/260px made
            it the loudest thing in a hero whose subject is the wordmark. It is
            now clearly the smallest, and it bleeds off the top-left corner so
            it belongs to the same family instead of sitting on the page like
            an avatar. Sourced from the AVIF (456x550) rather than the 400x480
            PNG because at 250px on a 2x screen the PNG has no resolution to
            spare. */}
        <HeroArt
          src="/eggpuffs.avif"
          width={456}
          height={550}
          sizes="(min-width: 1280px) 250px, 180px"
          className="pointer-events-none absolute -top-6 -left-8 hidden size-[150px] rounded-full object-cover lg:block xl:-top-4 xl:-left-6 xl:size-[200px]"
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

          {/* Anchors, not buttons — see the note at the top of this file. Both
              work before any JavaScript has loaded. */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#menu-top"
              className="rounded-full bg-primary px-7 py-4 text-base font-semibold text-primary-foreground transition-transform duration-150 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
            >
              See the menu
            </a>
            <a
              href="#locations"
              className="rounded-full border border-border bg-card px-7 py-4 text-base font-semibold transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
            >
              Find a shop
            </a>
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

      <MenuSection />

      <Testimonials />
      <SiteFooter />
      <CartDock />
    </div>
  );
}
