# Promo cards on the Snowdaes home page

What `featured.ts` and `components/promo-strip.tsx` do and why. Companion to
`PLAN.md`.

## 0. TL;DR

- Five cards in a **horizontally-swiped rail**. Manual only — it never
  auto-advances.
- A card's `target` is a small **object that knows how to resolve itself** —
  `ItemTarget` opens a drawer, `CategoryTarget` jumps the grid,
  `LocationsTarget` scrolls to the footer. No target at all makes the card a
  non-tappable banner. See §12.
- An **item** card opens a drawer and does not scroll; a **category** card
  scrolls the grid into view. Getting that backwards made a card look dead.
- Product photos are **Clover's, as-is**. Do not retouch them.

## 1. Site scope (RESOLVED 2026-09-03)

Billerica only. `DEFAULT_LOCATION` stays `billerica` and no store switcher ships
in this phase. Lowell comes later, with a location field on promos then.

## 2. Why a rail (RESOLVED 2026-09-03)

Five cards do not fit above the menu as a grid, and stacking them on a phone
buries the thing people came for. The rail is one row at every width.

It is a **native scroll container** with `snap-x snap-mandatory`, not a
translated track: swipe momentum, trackpads, shift-wheel and keyboard scrolling
all come free, and the cards still reach if the JS never runs. Arrows and dots
only nudge `scrollLeft`; `onScroll` is the source of truth for which dot is
current.

Carousels were never in the running. Notre Dame measured **1% click-through
across every slide of one, 89% of it on slide one**, and Nielsen Norman found
auto-forwarding annoys people outright. Nothing here advances on a timer, so
there is no pause control to build and WCAG 2.2.2 does not apply.

`mx-auto w-max` on the track centres the cards when they all fit and keeps the
rail scrollable when they do not — the same trick the category rail uses, and
why there is no separate "few promos" layout.

## 3. The dots are 28×44 buttons, not 6px dots (RESOLVED 2026-09-03)

The first version made the button *be* the 6px visual pill. Measured: the hit
area matched the visual exactly, so a tap 8px off missed entirely and landed on
the section behind. Because the arrows are `hidden md:flex`, those dots are the
only way to reach a specific card on a phone — the primary control failing its
one job.

Now the pill is a `span` inside a `h-11 w-7` button: 28px clears WCAG 2.5.8's
24px floor on the narrow axis, 44px is comfortable on the tall one. The row
carries **no gap** — the padding inside each button is the gap, so the hit areas
touch and there is no dead strip between them.

`tests/snowdaes/promo-rail.spec.ts` asserts this as a measured hit area and
probes ±8px with `elementFromPoint`, not by reading a class name.

## 4. Targets are names, never ids (RESOLVED 2026-09-03)

`ItemTarget` and `CategoryTarget` both hold a NAME and resolve it at click time
through `itemByName` / `categoryIdByName`.

Ids belong to Clover and are rewritten by `scripts/import-menu.mjs`. This
already broke once: cards held ids from the hand-written menu (`"shaved-snow"`),
and after the first real import two of three selected a category that no longer
existed and emptied the grid.

An unresolvable name currently falls through to nothing. Acceptable at five
hand-written cards; it would not be at twenty.

## 5. Item cards do not scroll; category cards do (RESOLVED 2026-09-03)

For an **item**, `setActiveCategory(item.categoryId)` runs but
`selectCategory`'s scroll does not. The category still moves, so closing the
drawer leaves the customer on the grid the card pointed at — but a smooth
`scrollIntoView` racing the drawer's mount lands somewhere different on every
viewport, and on a phone the bottom sheet locks body scroll mid-animation.

For a **category**, the scroll is the entire point. This was briefly wired the
other way, and "Six toppings, your call" changed the active category a full
screen above the fold with no drawer to show for it — a card that looked like a
dead link. That is why `PromoStage` has two verbs rather than one with a flag:
`openItem` owns "set the category quietly" as an implementation detail, so no
caller can pair them wrongly.

## 6. The tote card is not a control (RESOLVED 2026-09-03)

The free-tote promo is in-store only — the poster says so twice ("FOR IN STORE
PURCHASES ONLY", "WHILE SUPPLIES LAST"). A customer who spends $25 online and
gets no tote will ring the shop, and the shop will be right.

So it ships with **no `target` and no `cta`**, which makes it render as a `div`,
not a disabled `button` — a disabled button is still announced as a control and
still invites a tap. It carries a dark `In store` badge and one line of fine
print. The test asserts the card holds zero buttons.

## 7. `+$9.25` was a lie on eight items (RESOLVED 2026-09-03)

Thai Dye is `basePrice: 0` — Clover keeps the whole price in the required Snow
Size group. The drawer heading read `from $9.25` while the chip below it read
`Kiddie +$9.25`, which together read as **$18.50**. In the same drawer
`Extra +$0.50` and `Chamoy +$1.50` genuinely *are* additions, so one `+` meant
two different things on one screen.

When an item has no base price the required group **is** the price, and its
options print absolute: `Kiddie $9.25 · Small $10.50 · Large $11.95`.

Measured across the catalog first: 8 items are `basePrice: 0` (all eight shaved
snows), each with exactly **one** paid required group, and **zero** items have
both a base price and a paid required group. The two cases never overlap. The
code still checks for a *single* such group rather than assuming, because a
re-import could change that.

## 8. Photos and posters (RESOLVED 2026-09-03)

**Photos are Clover's.** Of 44 item photos, 26 sit on pure black, 15 on pure
white, 3 in between, and the drawer circle-crops them onto a `#faf8f5` ground.
Do not fix this — they are mirrored from Clover like names and prices. If the
owner wants different pictures they upload different pictures.

**The Instagram posters are not card images — but they are a source of them.**
`assets/menu-source/new blend alert.jpg` and `billerica promo.jpg` are 1:1
posters with the message baked into the pixels, and the card renders its image
as a ~144px corner thumbnail where a baked-in headline lands about 7px tall. So
a poster never goes in whole. What works is cropping the *subject* out of it:

- The tote card uses `public/brand/snowdaes-tote.jpg` — the bag's face with its
  logo and both straps, cut from `billerica promo.jpg` at
  `extract({ left: 929, top: 525, width: 337, height: 360 })`. It replaced the
  penguin mark, which the "Billerica is serving" card two along was already
  using: two identical penguins in one rail, and neither said "tote". Cream and
  black also sit closer to the page than the poster's blue.
- The Pandan card needed no crop —
  `public/menu/items/pandan-mango-sticky-rice.jpg` is the catalog's own shot and
  the same file the menu tile uses, so card and item match.

`sharp` is already in `node_modules` (Next pulls it in) if another crop is
needed.

## 9. Naming — two things called "promo"

`promos.ts` already exists and means **discount codes sent to Clover**
(`NEWCUSTOMER`, 10% off). The marketing cards live in `featured.ts` — named for
that collision, not despite it — and share nothing with it. One is money the till
has to honour; the other is a picture on a page. Do not merge them.

## 10. Tests

`tests/snowdaes/promo-rail.spec.ts` — 12 tests. The rail had **zero** coverage
when it was written; the 52 tests that existed all drove checkout and the cart,
so a green suite said nothing about it, which is how the dot hit-area defect got
as far as it did.

Two locator traps, both hit while writing these, both worth knowing:

- Each dot's label is `Show <that card's title>`, so `getByRole("button", {
  name: /Thai Dye snow/ })` matches the card **and** its dot. Scope card lookups
  to the rail's `list`; the dots and arrows sit outside it.
- Inside the drawer, `"Thai Dye"` also matches the group headings `Thai Dye
  Drizzle` and `Thai Dye Toppings`. Use `exact: true`.

And one measurement trap: Playwright scrolls an element into view as part of
actionability, so reading `window.scrollY` before a click attributes
Playwright's own scroll to the page. Call `scrollIntoViewIfNeeded()` first, then
measure.

## 11. Two more from the mobile review (RESOLVED 2026-09-03)

**Reduced motion was bypassed for the rail's own scroll.** `theme.css` /
`globals.css` correctly zero the dot's width transition, but `scrollTo()` was
passing `behavior: "smooth"` explicitly — and per CSSOM View an explicit
argument OVERRIDES the computed `scroll-behavior`, so the CSS only wins for
calls that omit it. Measured: 19 distinct scroll positions over ~300ms with
reduced-motion emulated. `go()` now reads `matchMedia` and passes `"auto"`.

**The last dot could never become current.** Reported as an off-by-one between
640–767px, where a hardcoded `STEP.base = 300 + 12` disagreed with the real
320px step (card width changes at `md`, the track gap at `sm`). Two fixes, and
the second is the bigger one:

- The step is now **measured** off the first two cards' `offsetLeft`, so the
  class list is the only place the number lives and it cannot drift again.
- More importantly, once the viewport shows more than one card the rail runs
  out of scroll before `scrollLeft / step` reaches the last index — at 1280px
  the track is 1760px in a 1088px window, so `scrollLeft` maxes at 672 while
  the last index needs 1424. **No step arithmetic could have fixed that.**
  `onScroll` now treats "scrolled to the end" as "the last dot is current".

## 11b. Three more from the guidelines pass (RESOLVED 2026-09-03)

All three were measured across 14 widths from 320 to 1440, before and after.

**The focus ring on a card was clipped away on both edges.** The cards are the
full height of the scroll container, and `overflow-x-auto` computes
`overflow-y: auto`, which clips at the padding box — so `outline-offset-2`,
which needs 4px above and below, was cut off flush and a keyboard user saw only
the left and right sides of the ring. The track now carries `py-1.5`. Outlines
add nothing to scrollable overflow, so this cannot produce a vertical scrollbar,
and it does not: measured `scrollHeight === clientHeight` at every width.

**At 320px the card ended flush against the right edge.** 300px of card plus the
track's own 20px of padding is exactly 320, so there was no sliver of the next
card — on the one width where the arrows are hidden and that sliver is the only
cue the rail scrolls at all. The card is now
`w-[min(300px,calc(100vw-3rem))]`: 272px with a 28px peek at 320, and unchanged
at 348px and up.

**The heading and the dots drifted off the cards above 1152px.** Both rows are
`max-w-6xl mx-auto`; the rail was full-bleed. Identical up to 1152, then
measurably out of step — the h2 at 96px against a card at 32px at 1280, and
176px against 32px at 1440. The scroller now carries the same `max-w-6xl`, so
the first card starts on the h2's vertical at every width. Below 1152 the class
does nothing and every phone keeps the edge-to-edge rail.

## 11c. Contrast is measured off the painted pixel (RESOLVED 2026-09-03)

`tests/support/contrast.ts` composites over the ancestors' `backgroundColor` and
stops at the first opaque one. Every card here paints its wash as a
`background-image`, and the `background` shorthand resets `background-color` to
`transparent` — so that helper walks straight past the tint and measures the
type against the ground the card would have had with no wash at all. Worked
through by hand, `--muted-foreground` reads 5.89:1 on white and 4.04:1 through
tint 3 at full strength: a real failure the helper would have called a
comfortable pass.

`tests/snowdaes/contrast.spec.ts` therefore does no gradient maths. It paints
the glyphs away with `color: transparent`, screenshots the card, and reads back
what Chromium actually composited where each line sat. Measured: all 21 lines
clear AA, tightest 5.39:1 (the tote card's fine print). Proven to catch a
regression, not merely to pass — lightening `--muted-foreground` to `#a89c93`
fails it on six lines.

`color: transparent` and not `visibility: hidden`, which was the first attempt:
the `In store` badge IS its own dark pill, so hiding the element took its
background with it and the probe sampled the card a layer below, reporting
1.02:1 for type that actually clears 17:1.

## 11d. The arrows nudge, they do not jump (RESOLVED 2026-09-03)

Reported from the live page: at the right-hand end of the rail, **Previous took
the click and moved nothing.**

The arrows called `go(index ± 1)`, which scrolls to `index * step`. At the end
of the rail `index` is pinned to the last card by §11's own rule — correctly,
since the last dot has to be reachable — but the rail runs out of scroll long
before that card's offset. At 1280px the track is 1824px in a 1152px window, so
`scrollLeft` maxes at 672 while index 4 wants 1424. Previous asked for 1068, the
browser clamped it back to the 672 it was already at, and `onScroll` set the
index straight back to 4. Enabled button, real click, no movement.

The arrows now nudge from the live `scrollLeft` — "one card along from here",
which is what an arrow beside a scrolling rail has always meant — and their
disabled state is read off the scroll offsets (`atStart` / `atEnd`) rather than
inferred from `index`, which cannot answer the question once more than one card
is visible. The dots still mean "jump to card N"; that is a different question
and still `go`.

Guarded by two tests in `promo-rail.spec.ts`, and the first one was proven to
fail against the old handlers with the reported symptom before the fix went in.

## 11e. A promo card is a link (RESOLVED 2026-09-03)

Cards with a target render as `<a href>`, not `<button>`.

A card is painted long before the page is interactive — measured at 810ms
against 1654ms to the first working tap on a 6x-throttled CPU — and for that
whole window a button looked completely ready and silently swallowed the tap.
An anchor navigates from the first paint with no JavaScript at all, and gains
middle-click and open-in-new-tab on the way. The hydrated handler then upgrades
a plain left-click into the drawer or the category jump; modifier-clicks are let
through untouched.

The destination is deliberately coarse (`#menu-top`, or `#locations`). Only the
active category's items are in the DOM, so there is no `#item-…` to aim at for a
drink filed under a category the reader is not looking at. The hydrated
behaviour improves on that destination; it never contradicts it.

The tote card still has no target, so it is still a plain `<div>` — not a link
and not a button. The test now asserts both.

## 12. Shape: `featured.ts` (RESOLVED 2026-09-03)

The cards and their destinations live in `featured.ts`, not in the component.

`handlePromo` used to pick a target string apart in `home.tsx`:

```ts
if (target === "locations") { ... }
const item = itemByName(target); if (item) { ... }
const id = categoryIdByName(target); if (id) { ... }
```

That is a page switching on the shape of its data — the knowledge of what a
target MEANS living in the component that reacts to it. Two costs: adding a kind
meant editing the chain, and the chain was ORDERED, so a category sharing a name
with an item would have silently resolved to the item.

Now each kind resolves itself:

| | |
|---|---|
| `PromoStage` | the three verbs the page offers — `openItem`, `showCategory`, `showLocations`. No React state, no refs, no DOM. |
| `PromoTarget` | abstract; one `activate(stage)` |
| `ItemTarget` | resolves by name, falls back to its category |
| `CategoryTarget` | resolves a category by name |
| `LocationsTarget` | scrolls to the footer |

`home.tsx` builds the stage once and the component calls
`target.activate(stage)`. Adding a kind touches neither file.

**Tints are tokens.** The five card washes were hex literals inside the
component; they are now `--promo-tint-1..5` in `theme.css`, scoped to
`.snowdaes` like the rest of the palette (AGENTS.md invariant 3 — both
restaurants load `globals.css`, so anything with personality belongs to a
restaurant). Tint 1 is deliberately `--primary`.

One consequence worth knowing: the gradient used to append hex alpha
(`${tint}3d`), which only worked while tint was a raw hex —
`var(--promo-tint-1)3d` is not a colour and the whole gradient silently drops.
It now uses `color-mix(in srgb, … 24%, transparent)`.

## 13. Open

1. **Full-bleed card, Starbucks-style?** One image-led card for the current
   headline promo, small ones after it. The only shape that would let the
   posters be used. Not designed.
2. **Pandan Mango Sticky Rice has thin modifiers in Clover** — 2 groups against
   a category median of 4. No ice level, no sweetness, so nobody can order it
   half-sugar. Verified live in the drawer. A Clover dashboard fix, not a code
   one, and worth doing before a promo card sends traffic at it.

## Decision log

| Date | Decision |
|---|---|
| 2026-09-03 | Billerica-only; store switching deferred |
| 2026-09-03 | Swipe rail, manual only — never auto-advancing |
| 2026-09-03 | Dots are 28×44 buttons wrapping a 6px pill |
| 2026-09-03 | Promo targets are names; item name wins over category name |
| 2026-09-03 | Card→drawer sets the category but never scrolls the page |
| 2026-09-03 | The tote card is a `div` — no target, no CTA, not a control |
| 2026-09-03 | `basePrice: 0` items print absolute prices, no `+` |
| 2026-09-03 | Product photos stay as pulled from Clover |
| 2026-09-03 | Instagram posters stay off the cards; use catalog shots |
| 2026-09-03 | Tests split by domain folder, not by filename prefix |
| 2026-09-03 | Reduced motion jumps the rail instead of animating it |
| 2026-09-03 | The card step is measured from the DOM, never hardcoded |
| 2026-09-03 | Scrolled to the end means the last dot is current |
| 2026-09-03 | Targets are polymorphic classes, not a string the page parses |
| 2026-09-03 | Card tints are `--promo-tint-*` in `theme.css`, not hex literals |
| 2026-09-03 | The track carries `py-1.5` so a card's focus ring is not clipped |
| 2026-09-03 | The card is `min(300px, 100vw-3rem)` so 320px keeps a peek |
| 2026-09-03 | The scroller shares the header's `max-w-6xl`, so cards line up with the h2 |
| 2026-09-03 | Promo contrast is sampled off the screenshot, never composited from `backgroundColor` |
| 2026-09-03 | Rail arrows nudge from live `scrollLeft`; disabled state comes from the offsets |
| 2026-09-03 | A promo card with a target is an `<a href>`, working before hydration |
| 2026-09-03 | Category cards scroll the grid into view; item cards do not |
| 2026-09-03 | The tote card shows the tote, cropped out of the poster |
