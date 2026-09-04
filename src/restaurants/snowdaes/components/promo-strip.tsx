"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/restaurants/snowdaes/lib/utils";
import {
  FEATURED,
  type FeaturedPromo,
  type PromoTarget,
} from "@/restaurants/snowdaes/featured";

export function PromoStrip({ onSelect }: { onSelect: (target: PromoTarget) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  /*
   * Whether the rail can still move, read off the SCROLL POSITION rather than
   * inferred from `index`.
   *
   * `index` cannot answer this once the viewport shows more than one card. At
   * the end of the rail the last dot is current by definition (see `onScroll`),
   * so `index` is 4 whether there are three cards off-screen to the left or
   * none — and `disabled={index <= 0}` was therefore right about Previous only
   * by accident. The scroll offsets know exactly, so they are asked directly.
   */
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  /**
   * How far one card is from the next, MEASURED off the two first cards.
   *
   * This used to be a constant — `{ base: 300 + 12, md: 336 + 20 }` — which
   * duplicated the Tailwind classes in JS and silently drifted the moment the
   * track gained `sm:gap-5`. Card width changes at `md` but the gap changes at
   * `sm`, so between 640px and 767px the real step is 320px while the constant
   * said 312, and `aria-current` landed a dot early at the end of the rail.
   *
   * Reading it back means the class list is the only place the number lives.
   * The fallback is only for a first paint with nothing laid out yet.
   */
  const step = useCallback(() => {
    const items = scroller.current?.querySelectorAll<HTMLElement>("li");
    if (items && items.length > 1) {
      return items[1].offsetLeft - items[0].offsetLeft;
    }
    return 312;
  }, []);

  /**
   * A real scroll container, not a translated track: swipe momentum, trackpads,
   * shift-wheel and keyboard scrolling all come free, and the cards still reach
   * if this JS never runs. The arrows and dots only nudge `scrollLeft` — they
   * are not the source of truth for position, `onScroll` is.
   */
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    /*
     * At the end of the rail, the LAST dot is current — not whatever
     * `scrollLeft / step` works out to.
     *
     * Once the viewport shows more than one card, the rail runs out of scroll
     * before that division reaches the last index: at 1280px the track is
     * 1760px in a 1088px window, so scrollLeft maxes at 672 while the last
     * index would need 1424. The last dot was therefore unreachable — tap it,
     * the rail scrolls to the end, and `aria-current` stayed two dots behind.
     */
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft < 1);
    setAtEnd(max - el.scrollLeft < 1);
    setIndex(
      max - el.scrollLeft < 1
        ? FEATURED.length - 1
        : Math.round(el.scrollLeft / step()),
    );
  }, [step]);

  /** Reduced-motion users get a jump; see the note in `go`. */
  function behavior(): ScrollBehavior {
    return typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
  }

  /**
   * One card left or right of WHERE THE RAIL ACTUALLY IS.
   *
   * ── WHY THE ARROWS DO NOT USE `go(index ± 1)` ────────────────────────────────
   *
   * Because Previous stopped working at the right-hand end, and looked broken
   * doing it. Scrolled fully right, `index` is pinned to the last card (4) even
   * though the rail has run out of scroll long before that card's own offset:
   * at 1280px the track is 1824px in a 1152px window, so `scrollLeft` maxes at
   * 672 while index 4 would need 1424. Previous then called `go(3)`, which
   * scrolled to 3 x step = 1068, the browser clamped that back to 672 — the
   * position it was already in — and `onScroll` set the index straight back to
   * 4. The button was enabled, took the click, and moved nothing.
   *
   * Nudging from the live `scrollLeft` cannot desynchronise that way: the
   * arrows mean "one card along from here", which is what an arrow beside a
   * scrolling rail has always meant. The dots keep meaning "jump to card N",
   * which is a different question and still `go`.
   */
  function nudge(direction: -1 | 1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollLeft + direction * step(), behavior: behavior() });
  }

  function go(to: number) {
    const el = scroller.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(to, FEATURED.length - 1));
    /*
     * `behavior` is decided here rather than left to CSS. `globals.css` forces
     * `scroll-behavior: auto` under `prefers-reduced-motion`, but per CSSOM
     * View an explicit `behavior` argument to `scrollTo()` OVERRIDES the
     * computed property — the CSS only wins for calls that omit it. So passing
     * a bare "smooth" animated the rail for reduced-motion users anyway
     * (measured: 19 distinct scroll positions over ~300ms), and tapping a dot
     * is the only way to move the rail on a phone.
     */
    el.scrollTo({ left: clamped * step(), behavior: behavior() });
  }

  return (
    <section aria-label="Featured" className="w-full py-12 sm:py-14">
      <div className="mx-auto flex w-full max-w-6xl items-baseline justify-between gap-4 px-5 pb-5 sm:px-8">
        <h2 className="font-display text-[22px] leading-tight font-semibold sm:text-[26px]">
          What&rsquo;s on right now
        </h2>
        {/* Desktop only: on a phone the rail is swiped, and two more tap
            targets beside a scrollable strip only get in the way. */}
        <div className="hidden gap-2 md:flex">
          <RailButton label="Previous" disabled={atStart} onClick={() => nudge(-1)}>
            <ChevronLeft className="size-4" />
          </RailButton>
          <RailButton label="Next" disabled={atEnd} onClick={() => nudge(1)}>
            <ChevronRight className="size-4" />
          </RailButton>
        </div>
      </div>

      {/* `mx-auto w-max` on the track centres the cards when they all fit and
          keeps the rail scrollable when they do not — the same trick the
          category rail uses, and why there is no separate "few promos" layout.
          Padding lives on the track so both ends survive the scroll.

          `max-w-6xl` on the scroller matches the heading row above and the dots
          below, so the first card starts on the same vertical as the h2. The
          rail was full-bleed while both of those were centred in a 1152px
          column: identical up to 1152px, then visibly out of step — measured
          96px against 32px at 1280, and 176px against 32px at 1440. Below
          1152px the class does nothing, so every phone keeps the edge-to-edge
          rail. */}
      <div
        ref={scroller}
        onScroll={onScroll}
        className="no-scrollbar mx-auto max-w-6xl snap-x snap-mandatory scroll-px-5 overflow-x-auto overscroll-x-contain sm:scroll-px-8"
      >
        {/* `py-1.5` is for the CARD'S FOCUS RING, not for looks. The cards are
            the full height of the scroll container, and `overflow-x-auto`
            computes `overflow-y: auto`, which clips at the padding box — so a
            `outline-offset-2` ring, needing 4px above and below, was cut off
            flush on both edges and a keyboard user saw only its left and right
            sides. Outlines add nothing to scrollable overflow, so this never
            produces a vertical scrollbar. */}
        <ul className="mx-auto flex w-max gap-3 px-5 py-1.5 sm:gap-5 sm:px-8">
          {FEATURED.map((promo) => (
            /* `min()`, not a flat 300px: at 320px the card is exactly the
               viewport minus the track's own 20px padding, so it ended flush
               against the right edge with no sliver of the next card — the one
               cue that the rail scrolls at all, on the one width where the
               arrows are hidden. Capped at 300px, so nothing at 348px and up
               changes. */
            <li
              key={promo.id}
              className="w-[min(300px,calc(100vw-3rem))] shrink-0 snap-start md:w-[336px]"
            >
              <PromoCard promo={promo} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      </div>

      {/* The dot is a 6px pill inside a 28x44 button, not a 6px button.
          Measured before this: the hit area matched the visual exactly, so a
          tap 8px off missed entirely and landed on the section behind — and
          since the arrows are `hidden md:flex`, these dots are the only way to
          reach a specific card on a phone. 28px clears WCAG 2.5.8's 24px floor
          on the narrow axis and 44px is comfortable on the tall one. The row
          carries no gap: the padding inside each button is the gap, so the hit
          areas touch and there is no dead strip between them. */}
      <div className="mx-auto flex w-full max-w-6xl px-4 pt-2 sm:px-7">
        {FEATURED.map((promo, n) => (
          <button
            key={promo.id}
            type="button"
            onClick={() => go(n)}
            aria-label={`Show ${promo.title}`}
            aria-current={n === index}
            className="grid h-11 w-7 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
          >
            <span
              className={cn(
                "h-1.5 rounded-full transition-[width,background-color] duration-200",
                n === index ? "w-5 bg-primary" : "w-1.5 bg-input",
              )}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

function RailButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-9 place-items-center rounded-full border border-border bg-card transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink disabled:cursor-default disabled:opacity-40 disabled:hover:border-border"
    >
      {children}
    </button>
  );
}

function PromoCard({
  promo,
  onSelect,
}: {
  promo: FeaturedPromo;
  onSelect: (target: PromoTarget) => void;
}) {
  const { target } = promo;
  /*
   * An ANCHOR when the card goes somewhere, not a button.
   *
   * As a `<button onClick>` the card did nothing at all until React had
   * hydrated — measured at 844ms on a 6x-throttled CPU, during which it was
   * painted, looked ready, and swallowed every tap. An anchor navigates from
   * the first paint with no JavaScript at all; the click handler below then
   * upgrades a plain left-click into the drawer or the category jump.
   *
   * The modifier keys are checked before `preventDefault` so cmd-click,
   * middle-click and "open in new tab" keep working — the things a real link
   * gives you and a button never could.
   */
  const Wrapper = target ? "a" : "div";

  return (
    <Wrapper
      {...(target
        ? {
            href: target.href,
            onClick: (event: React.MouseEvent) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onSelect(target);
            },
          }
        : {})}
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-border p-6 pr-28 text-left sm:p-7 sm:pr-32",
        target &&
          "transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_10px_28px_rgba(26,21,18,0.09)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink",
      )}
      /* `color-mix`, not hex-alpha suffixes. The tints moved into `theme.css`
         as custom properties, and the old `${promo.tint}3d` only ever worked
         because tint was a raw hex — `var(--promo-tint-1)3d` is not a colour
         and the whole gradient silently drops. 24%/8% reproduce the `3d`/`14`
         alphas it replaced. */
      style={{
        background: `radial-gradient(120% 120% at 100% 100%, color-mix(in srgb, ${promo.tint} 24%, transparent), color-mix(in srgb, ${promo.tint} 8%, transparent) 55%, var(--card))`,
      }}
    >
      <span className="font-mono text-[10px] tracking-[0.2em] text-brand-ink uppercase">
        {promo.eyebrow}
      </span>
      {/* leading-[1.2], not 1.1: at 26px Fraunces' descenders reach 59px over
          two lines while a 1.1 line box is 57.2px, and the card clips
          `overflow-hidden` — so every card whose heading wrapped lost the
          bottom of its "y" and "g". Measured on all three. */}
      <span className="mt-2 font-display text-[26px] leading-[1.2] font-semibold text-balance">
        {promo.title}
      </span>
      <span className="mt-2.5 max-w-[26ch] text-[14px] leading-relaxed text-muted-foreground">
        {promo.body}
      </span>
      {promo.cta && (
        <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] uppercase">
          {promo.cta}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
        </span>
      )}
      {promo.fineprint && (
        <span className="mt-4 max-w-[30ch] text-[11px] leading-snug text-muted-foreground">
          {promo.fineprint}
        </span>
      )}

      {promo.badge && (
        <span className="absolute top-5 right-5 rounded-full bg-foreground px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] text-background uppercase sm:top-6 sm:right-6">
          {promo.badge}
        </span>
      )}

      <Image
        src={promo.image}
        alt=""
        width={220}
        height={220}
        /* Without `sizes` these fall back to fixed 1x/2x and fetch 640px for a
           128px slot — 6x the pixels needed. The two fit modes render at
           different sizes, so they declare different values. */
        sizes={
          promo.fit === "cover"
            ? "(min-width: 640px) 160px, 144px"
            : "(min-width: 640px) 128px, 112px"
        }
        className={
          promo.fit === "cover"
            ? "pointer-events-none absolute -right-6 -bottom-6 size-36 rounded-full object-cover sm:size-40"
            : "pointer-events-none absolute right-2 bottom-2 size-28 object-contain sm:size-32"
        }
      />
    </Wrapper>
  );
}
