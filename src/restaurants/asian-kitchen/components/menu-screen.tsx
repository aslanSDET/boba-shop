"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  CATEGORIES,
  article,
  nounOf,
  whatYouGet,
  ITEMS,
  MODIFIER_GROUPS,
  itemsIn,
  optionById,
  type MenuItem,
  type ModifierGroup,
  type ModifierOption,
} from "../menu";
import { RESTAURANT, clockLabel, isOpenNow } from "../config";
import { type Line, saveCart } from "../cart";

/**
 * Asian Kitchen's ordering screen.
 *
 * ── WHAT THIS IS BUILT AROUND ────────────────────────────────────────────────
 *
 * Measured, not assumed (docs/ASIAN-KITCHEN.md §8): three of the five most
 * common "Pick Any Three" orders on their public ordering listing are the SAME entrée
 * three times. So the two fast paths — the saved usual, and one-tap popular
 * combinations — come before the builder, and the builder itself offers "same
 * for all three" rather than asking the same question three times.
 *
 * Their own configurator asks for four separate Select-1 groups with the side
 * wedged between the first and second entrée. This asks for two.
 *
 * ── NO PAYMENT HERE ──────────────────────────────────────────────────────────
 *
 * Square is not wired up. The cart is local state and "Add to order" adds to it;
 * nothing is priced by a POS and no money can move. Snowdaes' rule still holds
 * and will apply the moment Square lands: the POS is the calculator, and totals
 * shown before then are a preview.
 */

/**
 * The first row of tiles is what the browser measures as the Largest
 * Contentful Paint. next/image lazy-loads everything by default, so without a
 * priority hint those photos do not start downloading until after the page has
 * painted — the LCP then waits on a second round trip. CATEGORIES and the menu
 * are static module data, so the first section that actually renders can be
 * resolved once here rather than recomputed per render.
 */
const FIRST_SECTION = CATEGORIES.find((c) => itemsIn(c.id).length > 0)?.id;

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });


/** Group ids an item asks for, expanded to real groups. */
const categoryName = (id: string) => CATEGORIES.find((c) => c.id === id)?.name ?? "";

/** How many entrées a plate buys — the numeral on its badge. */
const plateCount = (item: MenuItem) => {
  const g = whatYouGet(item);
  return g ? Number(g.included.match(/^(\d+)/)?.[1] ?? 0) : 0;
};

/** 1, 2, 3 … then the junior portion, then anything else. */
const plateOrder = (item: MenuItem) => {
  if (item.junior) return 100;
  const n = plateCount(item);
  return /^Pick Any/.test(item.name) ? n : 200 + n;
};

const MAPS_URL = `https://maps.google.com/?q=${encodeURIComponent(RESTAURANT.address)}`;

/* "1652 Center Point Pkwy, Birmingham, AL 35215" -> street, then the rest. The
   header leads with the street because that is what someone collecting an order
   is actually looking for; the city stays for anyone who needs it. */
const [ADDRESS_STREET, ...ADDRESS_REST] = RESTAURANT.address.split(",");
const ADDRESS_CITY = ADDRESS_REST.join(",").trim();

function groupsFor(item: MenuItem): ModifierGroup[] {
  return (item.modifierGroups ?? []).map((id) => MODIFIER_GROUPS[id]).filter(Boolean);
}

function priceOf(item: MenuItem, picks: string[]): number {
  return picks.reduce((sum, id) => sum + (optionById(id)?.priceDelta ?? 0), item.price);
}

function labelOf(item: MenuItem, picks: string[]): string {
  if (!picks.length) return item.name;
  const names = picks.map((id) => optionById(id)?.name).filter(Boolean) as string[];
  // "Sesame Chicken ×3" reads better than the same words three times.
  const counted: string[] = [];
  for (const n of names) {
    const last = counted[counted.length - 1];
    if (last?.startsWith(n)) {
      const m = last.match(/ ×(\d+)$/);
      counted[counted.length - 1] = `${n} ×${m ? Number(m[1]) + 1 : 2}`;
    } else {
      counted.push(n);
    }
  }
  return `${item.name} · ${counted.join(" · ")}`;
}

export function MenuScreen() {
  const [cart, setCart] = useState<Line[]>([]);
  const [open, setOpen] = useState<MenuItem | null>(null);
  const [active, setActive] = useState(CATEGORIES[0].id);
  const railRef = useRef<HTMLElement | null>(null);
  /*
   * Open or closed is decided on the client, never on the server.
   *
   * This page is statically prerendered — `○ /` in the build output — so
   * whatever `isOpenNow()` answers during a build is frozen into the HTML and
   * served to everyone until the next deploy. A shop permanently "Open now"
   * because that is when someone ran `next build` is worse than saying
   * nothing. Rendering it blank on the server and filling it in after mount is
   * the only version that is ever right; the interval keeps a page left open
   * on somebody's phone honest when the shop closes under it.
   *
   * `isOpenNow` already reads the clock in America/Chicago, so this is Central
   * regardless of where the visitor or the server is.
   */
  const [status, setStatus] = useState<ReturnType<typeof isOpenNow> | null>(null);
  useEffect(() => {
    const tick = () => setStatus(isOpenNow());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  /* Mirrored to sessionStorage so it survives the navigation to /checkout,
     which a useState does not. See cart.ts for why session and not local. */
  const addLine = (line: Line) =>
    setCart((c) => {
      const next = [...c, line];
      saveCart(next);
      return next;
    });

  /*
   * Which section is in view — the rail reflects position rather than guessing.
   *
   * This was an IntersectionObserver watching a thin band ("-52px 0px -70%"),
   * and it had two faults. The 52px was the old rail's height, hardcoded; the
   * rail now wraps and stands 97px on a phone, so the band sat inside the
   * headings it was meant to track. Worse, a band only answers "is a heading
   * inside it right now" — jump the page far enough in one frame and every
   * heading passes through between callbacks, nothing intersects, and the rail
   * keeps whatever it last showed. Scrolling to the bottom left "Pick a Meal"
   * lit.
   *
   * Asking the geometry directly answers for any scroll position, however you
   * got there: the active section is the last one whose heading has passed
   * under the rail. The rail measures itself, so its height can change without
   * this going stale again.
   */
  useEffect(() => {
    const heads = [...CATEGORIES.map((c) => `ak-${c.id}`), "ak-about"]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!heads.length) return;

    /*
     * The rail's height is not a constant: one row of pills on a wide screen,
     * two once they wrap, and the wrap point moves with the text. Anything that
     * needs to clear it — this spy's cutoff line, and every heading's
     * scroll-margin-top — has to read the real number, so it is published as a
     * custom property and consumed from CSS. Hardcoding it is what put the
     * "About" heading underneath the rail in the first place.
     */
    const rail = railRef.current;
    const publishHeight = () => {
      if (rail) {
        document.documentElement.style.setProperty(
          "--ak-rail-h",
          `${Math.round(rail.getBoundingClientRect().height)}px`,
        );
      }
    };
    publishHeight();
    const ro = rail ? new ResizeObserver(publishHeight) : null;
    if (rail && ro) ro.observe(rail);

    let frame = 0;
    const pick = () => {
      frame = 0;
      /*
       * Must sit *below* where scroll-margin-top parks a heading (rail + 14px
       * in theme.css), or the section you just tapped lands a few pixels under
       * the line and the rail lights the previous one instead. 20 > 14 with
       * room for rounding.
       */
      const line = (railRef.current?.getBoundingClientRect().bottom ?? 56) + 20;
      let current = heads[0];
      for (const h of heads) {
        if (h.getBoundingClientRect().top > line) break;
        current = h;
      }
      setActive(current.id.replace("ak-", ""));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(pick);
    };

    pick();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
    };
  }, []);

  const total = cart.reduce((s, l) => s + l.price, 0);

  return (
    <div className="ak">
      <a className="ak-skip" href="#ak-menu">
        Skip to the menu
      </a>

      <header className="ak-header">
        <div className="ak-header-inner">
          <div className="ak-identity">
            <div className="ak-mark">
              {/* Their actual badge. The lettered circle it replaces was a
                  stand-in drawn before anyone had seen the real mark. */}
              <Image
                className="ak-mark-badge"
                src="/asian-kitchen/badge.png"
                alt=""
                width={46}
                height={46}
                priority
              />
              <h1 className="ak-wordmark">{RESTAURANT.name}</h1>
            </div>
            <p className="ak-tagline">{RESTAURANT.tagline}</p>
          </div>

          <div className="ak-where">
            {/* The state, then the range it refers to. The hours are a fact
                about the shop; "open till 7:45" was a fact about this minute
                and read as pressure. Central is named because the shop is in
                Alabama and the visitor may not be. */}
            <span className="ak-when">
              {status && (
                <span className="ak-open" data-open={status.open}>
                  {status.open ? "Open" : "Closed"}
                </span>
              )}
              <span className="ak-hours">
                {clockLabel(RESTAURANT.hours.open)} &ndash;{" "}
                {clockLabel(RESTAURANT.hours.close)}{" "}
                <abbr className="ak-tz" title="Central Time">
                  CT
                </abbr>
              </span>
            </span>
            <a className="ak-address" href={MAPS_URL} target="_blank" rel="noreferrer">
              <span className="ak-address-street">{ADDRESS_STREET}</span>
              <span className="ak-address-city">{ADDRESS_CITY}</span>
            </a>
          </div>
        </div>
      </header>

      {/*
        A band of their own counter, sized and framed for the loop the owner
        intends to shoot. Until `hero.video` is set this is the still on its
        own — the same frame a <video poster> paints before its first decode,
        so switching costs one line in config.ts and nothing here moves.
      */}
      <section className="ak-hero" aria-label={RESTAURANT.name}>
        {RESTAURANT.hero.video ? (
          <video
            className="ak-hero-media"
            poster={RESTAURANT.hero.poster}
            src={RESTAURANT.hero.video}
            autoPlay
            muted
            loop
            playsInline
            /* Decoration. Nothing here is information, so it is hidden from
               assistive tech rather than described. */
            aria-hidden="true"
            tabIndex={-1}
          />
        ) : (
          /*
            A plain <img>, not next/image. The poster is an SVG we drew, and
            next/image refuses SVG unless `dangerouslyAllowSVG` is switched on
            for every image the app serves — a real setting to weaken for one
            file that needs no optimising anyway. It is 4 KB and resolution
            independent.
          */
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ak-hero-media" src={RESTAURANT.hero.poster} alt="" />
        )}
        <div className="ak-hero-copy">
          <p className="ak-hero-eyebrow">{RESTAURANT.hero.eyebrow}</p>
          <p className="ak-hero-headline">{RESTAURANT.hero.headline}</p>
        </div>
      </section>

      <nav className="ak-rail" aria-label="Menu categories" ref={railRef}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-current={active === c.id}
            onClick={() => {
              const el = document.getElementById(`ak-${c.id}`);
              el?.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "auto"
                  : "smooth",
                block: "start",
              });
            }}
          >
            {c.name}
          </button>
        ))}

        {/* Not a category, so it sits after a divider rather than in the run of
            food. It is still in the rail because the About section is otherwise
            unreachable without scrolling past the whole menu. */}
        <span className="ak-rail-sep" aria-hidden="true" />
        <button
          type="button"
          className="ak-rail-about"
          aria-current={active === "about"}
          onClick={() => {
            document.getElementById("ak-about")?.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "auto"
                : "smooth",
              block: "start",
            });
          }}
        >
          About
        </button>
      </nav>

      <main id="ak-menu" style={{ scrollMarginTop: "calc(var(--ak-rail-h, 57px) + 14px)" }}>
        {CATEGORIES.map((cat) => {
          const items = itemsIn(cat.id);
          if (!items.length) return null;

          /*
           * "Pick a Meal" is not a category of dishes, it is the shop's
           * product: entrées plus a side, in three sizes. Rendered as three
           * thumbnails in a grid of sixty-eight it read as nothing at all, and
           * nobody could tell how many entrées each one bought. It gets its
           * own shape, and keeps the section id so the rail and the scroll-spy
           * are unaffected.
           */
          const isPlates = cat.id === "meals";

          return (
            <section key={cat.id} aria-labelledby={`ak-${cat.id}`}>
              <h2 className="ak-section-head" id={`ak-${cat.id}`}>
                {isPlates ? "Pick a Meal" : cat.name}
              </h2>
              {isPlates ? (
                <p className="ak-section-note">
                  Every plate is an entrée plus one side. Pick how many entrées you want.
                </p>
              ) : (
                cat.note && <p className="ak-section-note">{cat.note}</p>
              )}

              {isPlates ? (
                /*
                 * Ordered 1, 2, 3 and then the two named plates. The listing's
                 * order was 3, 2, 1 — descending, which reads as a price list
                 * rather than as "how many do you want". Kids Meal and Family
                 * Feast go last because their numeral is not their identity:
                 * a Kids Meal showing "1" directly under Pick Any One Item
                 * showing "1" is two different things wearing the same badge.
                 */
                <div className="ak-plates">
                  {[...items]
                    .sort((a, b) => plateOrder(a) - plateOrder(b))
                    .map((item) => {
                    const gets = whatYouGet(item);
                    const n = plateCount(item) || "";
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="ak-plate"
                        data-lead={item.rank === 2 || undefined}
                        data-junior={item.junior || undefined}
                        onClick={() => setOpen(item)}
                      >
                        {item.rank === 2 && <span className="ak-plate-flag">Most ordered</span>}
                        {/*
                          The photo is back. These five are the best-selling
                          things on the menu and they were the only items on
                          the page showing no food at all — a green numeral
                          where every other card had a dish. The count still
                          matters, so it rides the corner of the photo instead
                          of replacing it.
                        */}
                        <span className="ak-plate-media">
                          {item.image ? (
                            <Image
                              src={item.image}
                              alt=""
                              fill
                              sizes="76px"
                              priority
                              style={{ objectFit: "cover" }}
                            />
                          ) : (
                            <span className="ak-nophoto" aria-hidden="true">
                              AK
                            </span>
                          )}
                          <span className="ak-plate-n" aria-hidden="true">
                            {item.junior ? "JR" : n || "\u2605"}
                          </span>
                        </span>
                        <span className="ak-plate-body">
                          <span className="ak-plate-name">{item.name}</span>
                          <span className="ak-plate-sub">
                            {gets ? gets.included : item.description}
                          </span>
                        </span>
                        <span className="ak-plate-price">
                          <span className="ak-plate-from">From</span>
                          {money(item.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                /*
                 * Photo tiles. The food is what people are choosing between,
                 * so it leads — the plates band above is the only place a
                 * number outranks a picture.
                 */
                <div className="ak-grid">
                  {items.map((item, i) => (
                    <button
                      key={item.id}
                      type="button"
                      className="ak-tile"
                      onClick={() => setOpen(item)}
                    >
                      <span className="ak-thumb">
                        {item.image ? (
                          <Image
                            src={item.image}
                            alt=""
                            fill
                            sizes="(min-width: 792px) 240px, (min-width: 620px) 33vw, 50vw"
                            priority={cat.id === FIRST_SECTION && i < 3}
                            style={{ objectFit: "cover" }}
                          />
                        ) : (
                          <span className="ak-nophoto" aria-hidden="true">
                            AK
                          </span>
                        )}
                      </span>
                      <h3>{item.name}</h3>
                      <span className="ak-price">{money(item.price)}</span>
                      {item.description && <p className="ak-desc">{item.description}</p>}
                      {item.rank && <span className="ak-badge">#{item.rank} MOST LIKED</span>}
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </main>

      {cart.length > 0 && (
        <div className="ak-cart">
          {/* A link, not a button with a handler: checkout is a route, so the
              browser should treat it as one — middle-click, long-press, back. */}
          <a className="ak-btn" href="/checkout">
            {cart.length} {cart.length === 1 ? "item" : "items"} · {money(total)} · Checkout
          </a>
        </div>
      )}

      <section className="ak-about" id="ak-about" aria-labelledby="ak-about-head">
        <div className="ak-about-head">
          <Image
            className="ak-about-badge"
            src="/asian-kitchen/badge.png"
            alt=""
            width={86}
            height={86}
          />
          <h2 id="ak-about-head">{RESTAURANT.name}</h2>
          <p className="ak-about-tag">{RESTAURANT.tagline}</p>
        </div>

        <p className="ak-about-lede">
          A takeout counter on Center Point Parkway. The menu is built around plates
          &mdash; one, two or three entr&eacute;es with a side &mdash; alongside wings,
          Philly steaks and house specials.
        </p>

        {/*
          A real map, not a picture of one. `output=embed` needs no API key and no
          billing account, which matters for a shop that does not have either;
          `loading="lazy"` keeps it off the critical path, since almost nobody
          scrolls this far before ordering.
        */}
        <div className="ak-map">
          <iframe
            title={`Map to ${RESTAURANT.name}`}
            src={`https://www.google.com/maps?q=${encodeURIComponent(RESTAURANT.address)}&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="ak-map-card">
            <div className="ak-map-addr">
              <span className="ak-map-street">{ADDRESS_STREET}</span>
              <span className="ak-map-city">{ADDRESS_CITY}</span>
            </div>
            <a className="ak-map-go" href={MAPS_URL} target="_blank" rel="noreferrer">
              Directions
            </a>
          </div>
        </div>

        <dl className="ak-facts">
          {/* One row, not two: the state and the hours were saying the same
              thing twice, and the hours are the same range every day. */}
          <div className="ak-fact ak-fact-status" data-open={status?.open}>
            <dt>
              <span className="ak-dot" aria-hidden="true" />
              {status ? (status.open ? "Open now" : "Closed") : "Opening hours"}
            </dt>
            <dd className="ak-num">
              Every day, {clockLabel(RESTAURANT.hours.open)} &ndash;{" "}
              {clockLabel(RESTAURANT.hours.close)} Central
            </dd>
          </div>
          <div className="ak-fact">
            <dt>Phone</dt>
            {/* Bracketed, not invented. docs/ASIAN-KITCHEN.md §6. */}
            <dd className={RESTAURANT.phone ? "ak-num" : "ak-todo"}>
              {RESTAURANT.phone ?? "[ask the owner]"}
            </dd>
          </div>
          <div className="ak-fact">
            <dt>Collection</dt>
            <dd>Pickup only &middot; no delivery</dd>
          </div>
        </dl>

        {/* Their own board says so, and it answers why the sign says hibachi. */}
        <div className="ak-soon">
          <p className="ak-soon-label">Coming soon</p>
          <p className="ak-soon-name">Hibachi</p>
          <p className="ak-soon-note">
            Chicken, steak, seafood and a combination plate. On the board in the shop,
            not yet on the counter.
          </p>
        </div>
      </section>

      <footer className="ak-foot">
        <p className="ak-foot-lead">
          Prototype &mdash; not a live ordering service. No payment is connected and no
          order reaches the kitchen.
        </p>
        <p className="ak-fineprint">
          Menu, prices and hours were transcribed from a public listing on
          1&nbsp;September&nbsp;2026, have not been confirmed by the restaurant and may be
          out of date. Food photography is placeholder, may be subject to third-party
          copyright, and will be replaced before launch. Please confirm anything that
          matters &mdash; prices, hours, allergens &mdash; with the restaurant directly.
        </p>
      </footer>

      {open && (
        <ItemSheet
          key={open.id}
          item={open}
          onClose={() => setOpen(null)}
          onAdd={(line) => {
            addLine(line);
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

/* ── the sheet ────────────────────────────────────────────────────────────── */

/*
 * One option, wearing what their board prints about it: the chilli marks, the
 * calorie count, and the surcharge. None of it is our invention — it is all on
 * the wall, and it is what makes the choice feel like reading a takeout board
 * rather than filling in a form.
 */
function OptionFace({ option: o }: { option: ModifierOption }) {
  return (
    <>
      <span className="ak-opt-name">{o.name}</span>
      {o.spice ? (
        <span className="ak-spice" aria-label={o.spice === 2 ? "hot" : "a little heat"}>
          {"\u{1F336}".repeat(o.spice)}
        </span>
      ) : null}
      {o.calories ? (
        <span className="ak-cal">
          {o.calories}
          <span aria-hidden="true"> cal</span>
        </span>
      ) : null}
      {o.priceDelta > 0 ? <span className="delta">+{money(o.priceDelta)}</span> : null}
    </>
  );
}

function ItemSheet({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  onClose: () => void;
  onAdd: (line: Line) => void;
}) {
  const groups = groupsFor(item);
  const included = whatYouGet(item);

  /*
   * Their own description for a combo is usually the same sentence `whatYouGet`
   * derives — "3 entrées & 1 side" against "3 entrées and 1 side" — so showing
   * both reads as a stutter. Compare them normalised and keep only one. Kids
   * Meal ("Jr. entrée, jr. side, 12 oz drink & cookie") and Family Feast
   * ("Enough for four") say more than the derived line, and survive this.
   */
  const bare = (t: string) => t.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
  const description =
    item.description && included && bare(item.description) === bare(included.included)
      ? null
      : item.description;
  const required = groups.filter((g) => g.min > 0);
  const optional = groups.filter((g) => g.min === 0);

  /** Selections per group id. Repeated groups hold `repeat` entries. */
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    /*
     * Escape closes, and Tab stays inside. Without the trap, tabbing out of an
     * open sheet lands on the menu behind it — which is still scrolled where it
     * was, and on a phone is not even on screen.
     */
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab") return;
      const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    /*
     * `overflow: hidden` on the body does NOT stop iOS Safari scrolling the page
     * behind a sheet — it is the oldest bug in mobile web, and the page ends up
     * somewhere else when the sheet closes. Pinning the body and restoring the
     * offset afterwards is the fix that actually holds.
     */
    const y = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, y);
    };
  }, [onClose]);

  /*
   * Drag the sheet down to dismiss it — the gesture every phone user tries
   * first on a bottom sheet. Bound to the grabber and the photo only, never the
   * scrolling body, so it can never fight a scroll. The close button stays: a
   * gesture must not be the only way out.
   */
  const drag = useRef({ startY: 0, dy: 0, active: false });
  const grabRef = useRef<HTMLSpanElement>(null);

  const onDragStart = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    /*
     * Whether this is a bottom sheet is a layout question, and layout is CSS's
     * to answer — `.ak-grab` is display:none from 640px up, where the sheet is
     * a centred dialog and dragging it down would mean nothing. Reading that
     * back beats repeating the breakpoint here as a number, which is how the
     * two drift apart.
     */
    if (!grabRef.current || getComputedStyle(grabRef.current).display === "none") return;
    drag.current = { startY: e.clientY, dy: 0, active: true };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent) => {
    if (!drag.current.active || !sheetRef.current) return;
    const dy = Math.max(0, e.clientY - drag.current.startY);
    drag.current.dy = dy;
    /*
     * `translate`, not `transform`. The open animation animates `transform`,
     * and a running animation beats an inline style — so a drag begun inside
     * that first 220ms was silently ignored. These are independent properties
     * and compose, so the two never contend.
     */
    sheetRef.current.style.transition = "none";
    sheetRef.current.style.translate = `0 ${dy}px`;
  };

  const onDragEnd = () => {
    if (!drag.current.active || !sheetRef.current) return;
    const { dy } = drag.current;
    drag.current.active = false;
    sheetRef.current.style.transition = "";
    sheetRef.current.style.translate = "";
    // A third of the sheet is the point of no return; below that it springs back.
    if (dy > sheetRef.current.offsetHeight / 3) onClose();
  };

  const repeatOf = (g: ModifierGroup) => g.repeat ?? 1;
  /** How many choices this group is actually asking for. */
  const wants = (g: ModifierGroup) => repeatOf(g) * g.min;
  const chosenIn = (g: ModifierGroup) => (picks[g.id] ?? []).filter(Boolean);

  /*
   * A group asking for three entrées used to be one row of toggle pills with a
   * hidden write cursor: tapping filled slot 0, then 1, then 2. Two entrées the
   * same looked identical to one, there was no way to take one back, and the
   * pill said "pressed" whether you had ordered it once or three times.
   *
   * A counter order is a bag of quantities — "two sesame and a general tso" —
   * so that is what this stores and what the UI shows. Add appends, remove
   * takes the last one back, and the count is on screen.
   */
  const addPick = (g: ModifierGroup, optionId: string) => {
    setPicks((p) => {
      const current = (p[g.id] ?? []).filter(Boolean);
      if (current.length >= wants(g)) return p;
      return { ...p, [g.id]: [...current, optionId] };
    });
  };

  const removePick = (g: ModifierGroup, optionId: string) => {
    setPicks((p) => {
      const current = [...(p[g.id] ?? []).filter(Boolean)];
      const last = current.lastIndexOf(optionId);
      if (last < 0) return p;
      current.splice(last, 1);
      return { ...p, [g.id]: current };
    });
  };

  /** Single-choice groups replace rather than accumulate. */
  const setOnly = (g: ModifierGroup, optionId: string) =>
    setPicks((p) => ({ ...p, [g.id]: [optionId] }));

  const toggleOptional = (g: ModifierGroup, optionId: string) => {
    setPicks((p) => {
      const current = p[g.id] ?? [];
      const has = current.includes(optionId);
      if (has) return { ...p, [g.id]: current.filter((x) => x !== optionId) };
      if (current.length >= g.max) return p;
      return { ...p, [g.id]: [...current, optionId] };
    });
  };

  // Not memoised: `groups` is rebuilt each render, so a manual memo could not be
  // preserved by the compiler. The work is a flatMap over at most six arrays.
  const flat = groups.flatMap((g) => (picks[g.id] ?? []).filter(Boolean));

  /*
   * The button used to read "Choose 4 more" on a Pick Any Three — the sum of
   * three entrée slots and one side. Nobody thinks of a meal as four slots;
   * they think "three mains and a side". So name the next thing the order is
   * actually waiting on, and count only within that.
   */
  const need = required
    .map((g) => ({ g, total: wants(g), have: chosenIn(g).length }))
    .find((x) => x.have < x.total);

  /*
   * Finishing the entrées left you at the bottom of a fifteen-row list with the
   * side group somewhere below the fold and nothing saying so. When a group
   * fills, bring the next one to the top of the sheet — the hand-off the step
   * rail describes, done for you rather than left as a scroll.
   */
  const goToGroup = (id: string) => {
    document.getElementById(`ak-g-${id}`)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  };

  const needLabel = need
    ? (() => {
        const noun = nounOf(need.g);
        const left = need.total - need.have;
        if (need.total === 1) return `Choose ${article(noun)} ${noun}`;
        if (need.have === 0) return `Choose ${need.total} ${noun}s`;
        return `${left} more ${left === 1 ? noun : `${noun}s`}`;
      })()
    : null;

  const price = priceOf(item, flat);

  const lastNeed = useRef<string | null>(null);
  useEffect(() => {
    const id = need?.g.id ?? null;
    // Only on a real hand-off between groups: not on first open, and not when
    // the last group completes and there is nowhere left to send anyone.
    if (id && lastNeed.current && lastNeed.current !== id) goToGroup(id);
    lastNeed.current = id;
  }, [need?.g.id]);

  return (
    <div
      className="ak-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      onPointerDown={(e) => {
        if (!sheetRef.current?.contains(e.target as Node)) onClose();
      }}
    >
      <div className="ak-sheet" ref={sheetRef}>
        <span
          className="ak-grab"
          ref={grabRef}
          aria-hidden="true"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        />
        <div className="ak-sheet-body">
        <div
          className={`ak-sheet-hero${required.length ? " ak-sheet-hero-short" : ""}`}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <button
            type="button"
            className="ak-close"
            onClick={onClose}
            ref={closeRef}
            aria-label="Close"
          >
            ×
          </button>
          {item.image ? (
            <Image
              src={item.image}
              alt=""
              fill
              sizes="(min-width: 640px) 560px, 100vw"
              priority
              style={{ objectFit: "cover" }}
            />
          ) : (
            <span className="ak-nophoto" aria-hidden="true">
              AK
            </span>
          )}
        </div>

        <h2>{item.name}</h2>
        <p className="ak-sheet-meta">
          {categoryName(item.categoryId)} · {money(item.price)}
          {item.rank ? (
            <>
              {" · "}
              <b>#{item.rank} most liked</b>
            </>
          ) : null}
        </p>

        {description && <p className="ak-sheet-desc">{description}</p>}

        {/*
          49 of the 68 items arrived with no description, so an item sheet used
          to be a photo, a name and a price. These two blocks are the honest way
          to fill it: both are read back out of the modifier groups rather than
          written by us, so neither can claim anything about food nobody here
          has tasted. See `whatYouGet` in menu.ts.
        */}
        {/*
          The step rail. The counts and the button copy already say how many
          picks a group wants; what neither says is how many groups there ARE,
          or which one you are standing in — which is what made an order feel
          open-ended. Filled and empty dots answer both before the first tap.
        */}
        {required.length > 1 && (
          <ol className="ak-steps">
            {required.map((g, i) => {
              const total = wants(g);
              const have = chosenIn(g).length;
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    className="ak-step"
                    data-state={have >= total ? "done" : need?.g.id === g.id ? "now" : "todo"}
                    onClick={() => goToGroup(g.id)}
                  >
                    <span className="ak-step-n">Step {i + 1}</span>
                    <span className="ak-step-label">{g.label}</span>
                    <span className="ak-step-dots" aria-hidden="true">
                      {Array.from({ length: total }, (_, k) => (
                        <span key={k} data-on={k < have || undefined} />
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
            {optional.length > 0 && (
              <li>
                <button
                  type="button"
                  className="ak-step"
                  data-state="todo"
                  onClick={() => goToGroup(optional[0].id)}
                >
                  <span className="ak-step-n">Optional</span>
                  <span className="ak-step-label">Add-ons</span>
                  <span className="ak-step-skip">skip</span>
                </button>
              </li>
            )}
          </ol>
        )}

        {included && (
          <p className="ak-sheet-gets">
            <b>{included.included}.</b> Choose from {included.choices}.
            {included.surcharge ? ` ${included.surcharge}` : ""}
          </p>
        )}

        {required.map((g) => {
          const total = wants(g);
          const chosen = chosenIn(g);
          const done = chosen.length >= total;
          /* Rows once a group is long or asks more than once: fifteen entrées
             with calorie counts do not read as a pill cloud, and the wing
             flavours are printed in a deliberate hot-to-mild order that a
             wrapped row destroys. Short groups stay pills. */
          const asRows = total > 1 || g.options.length > 6;

          return (
            <div className="ak-group" key={g.id} id={`ak-g-${g.id}`}>
              <div className="ak-group-head">
                <h3>{g.label}</h3>
                <span className={`ak-count${done ? " is-done" : ""}`}>
                  {done
                    ? "Done"
                    : total > 1
                      ? `${chosen.length} of ${total}`
                      : "Pick 1"}
                </span>
              </div>

              {asRows ? (
                <div className="ak-rows">
                  {g.options.map((o) => {
                    const count = chosen.filter((x) => x === o.id).length;
                    const full = chosen.length >= total;
                    return (
                      <div className="ak-row" key={o.id} data-on={count > 0}>
                        <button
                          type="button"
                          className="ak-row-main"
                          /*
                           * Capacity only blocks a group that counts. Asking
                           * for one side is not "full at one" — it is a radio,
                           * and tapping another option replaces the pick.
                           * Guarding on `full` alone disabled every option
                           * except the one already chosen the instant you
                           * chose it, so the first tap was final and there was
                           * no way to change your mind.
                           */
                          disabled={total > 1 && full && count === 0}
                          aria-label={`Add ${o.name}`}
                          onClick={() => (total === 1 ? setOnly(g, o.id) : addPick(g, o.id))}
                        >
                          <OptionFace option={o} />
                        </button>
                        {total > 1 ? (
                          <span className="ak-qty" data-on={count > 0}>
                            {count > 0 && (
                              <>
                                <button
                                  type="button"
                                  aria-label={`Remove one ${o.name}`}
                                  onClick={() => removePick(g, o.id)}
                                >
                                  &minus;
                                </button>
                                <b aria-hidden="true">{count}</b>
                                <button
                                  type="button"
                                  aria-label={`Add another ${o.name}`}
                                  disabled={full}
                                  onClick={() => addPick(g, o.id)}
                                >
                                  +
                                </button>
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="ak-tick" aria-hidden="true">
                            {count > 0 ? "\u2713" : ""}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="ak-opts">
                  {g.options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className="ak-opt"
                      aria-pressed={chosen.includes(o.id)}
                      onClick={() => setOnly(g, o.id)}
                    >
                      <OptionFace option={o} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {optional.map((g) => {
          const chosen = picks[g.id] ?? [];
          return (
            <div className="ak-group" key={g.id} id={`ak-g-${g.id}`}>
              <div className="ak-group-head">
                <h3>{g.label}</h3>
                <span className="ak-count">optional</span>
              </div>
              <div className="ak-opts">
                {g.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="ak-opt"
                    aria-pressed={chosen.includes(o.id)}
                    onClick={() => toggleOptional(g, o.id)}
                  >
                    <OptionFace option={o} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        </div>

        <div className="ak-sheet-foot">
          <p className="ak-status" aria-live="polite">
            {need
              ? `${need.g.label} — ${need.total - need.have} to go`
              : flat.length
                ? labelOf(item, flat).replace(`${item.name} · `, "")
                : "Ready"}
          </p>
          <button
            type="button"
            className="ak-btn"
            disabled={Boolean(need)}
            onClick={() =>
              onAdd({
                itemId: item.id,
                picks: flat,
                price,
                label: labelOf(item, flat),
              })
            }
          >
            {needLabel ?? `Add to Order · ${money(price)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export { ITEMS };
