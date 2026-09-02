# Many Restaurants, One Repo — Platform Plan

**Status:** Asian Kitchen's front end is built at `/asian-kitchen`; no POS is wired. Snowdaes unchanged (2026-09-01).

`PLAN.md` is now **Snowdaes' plan**. This file is the umbrella: how one repo, one
developer and a small budget serve several unrelated mom-and-pop restaurants on
several unrelated point-of-sale systems.

---

## 0. TL;DR

- **Restaurant #1** — Snowdaes, Billerica + Lowell, **Clover**. Built, working, paused: the owner has no time for a month.
- **Restaurant #2** — Asian Kitchen, Birmingham AL, **Square**. Phone conversation done, no credentials yet, menu to be scraped. See `docs/ASIAN-KITCHEN.md`.
- **Restaurant #3+** — unknown platform. Possibly Clover, Square, Toast, or no POS at all.
- **One deployment per restaurant.** Not multi-tenant. (§2)
- **Duplicate first. Abstract third.** No `PosAdapter` interface until two real ones work. (§3)
- The goal is a good mom-and-pop ordering site, not a DoorDash competitor.

---

## 1. Why this file exists

The repo was built for one shop on one POS, and every decision in `PLAN.md`
assumed that. Most of them survive the pivot; a few do not, and the ones that do
not are worth naming before they are discovered by accident.

**Measured, 2026-08-31.** 46 files under `src/`. 21 mention Clover, but most of
those are prose in comments. Real coupling is eight files:

| Genuinely Clover-coupled | Already platform-agnostic |
|---|---|
| `lib/clover.ts`, `lib/clover-order.ts`, `lib/clover-hours.ts` | `store/useCart.ts` |
| `app/api/checkout/{route,pay,config}.ts`, `app/api/hours/route.ts` | `config/menu.ts`, `config/promos.ts` |
| `components/checkout-panel.tsx` (the Clover SDK iframes) | `components/{modifier-drawer,item-visual,cart-sheet}.tsx` |
| 5 stray imports in `page.tsx` and `open-badge.tsx` | `lib/modifier-shape.ts`, `lib/idempotency.ts` |

`types/boba.ts` describes a *restaurant*, not a POS — `MenuItem`,
`ModifierGroup`, `CartItem` are all reusable. That was partly luck, and it is the
reason this is a refactor rather than a rewrite.

---

## 2. One deployment per restaurant (RESOLVED 2026-08-31)

One repo. **Separate deploys, separate environments, separate domains.**
Explicitly *not* one deployment serving many restaurants by hostname.

**Credentials decide this.** A multi-tenant deploy would hold Snowdaes' Clover
token and Asian Kitchen's Square token in one environment. The architecture note
(`artifacts/uber-eats-architecture.html`) already records that our token model
has no scoping, no expiry story and manual revocation — one static token per
merchant with full access. Putting two of those behind one process doubles the
blast radius of a single mistake, for no benefit.

The supporting reasons are ordinary: different domains, different branding,
different tax jurisdictions, and **no shared data at all**. There is no query
that joins a boba shop in Massachusetts to a Chinese restaurant in Alabama, so
there is nothing to gain by co-locating them.

**Consequence to accept:** a bug fix ships N times. At N=2, and with a single
developer, that is cheaper than the isolation we would be giving up.

---

## 3. Duplicate first, abstract third (RESOLVED 2026-08-31)

**Do not write `pos/types.ts` until Clover and Square both work.**

A `PosAdapter` designed today would be Clover's shape wearing a hat: three
non-interchangeable hosts, `atomic_order`, tax rates in hundred-thousandths, a
`taxAmount` field that reads `$0.00` on every order, and create-a-real-order-just
-to-price-it. Square does almost none of that (§4). Building the Square
integration against an interface extracted from Clover means spending that build
fighting a guess.

This is the same call `PLAN.md` §8.6 already made for menus:

> Two independent catalogs, one per location — not one menu with per-location
> price overrides. Overrides would apply to ~90% of everything, which is two
> menus with extra indirection.

Two independent integrations, not one integration with per-platform overrides.

**The trigger for extracting the interface**, written down so it is not a matter
of mood: when the second POS is *working end to end in the browser*, and only for
the verbs both implementations actually use. Anything used by one is not shared
and stays where it is. We already know the five verbs from the Uber Eats
architecture note — read catalog, price/create order, take payment, fire to
kitchen, read hours — so the seam is **named**. It does not need to be **coded**
until there is something real to average.

**Copy-paste is allowed and expected during Phase 2.** Duplication that is
deleted in Phase 3 costs less than an abstraction that is wrong in Phase 2.

---

## 4. Not every "platform" is a POS

Worth settling now, because #3 is unknown and the word "platform" hides a real
fork. There are three shapes, and they need different amounts of us:

| Shape | Examples | Menu lives | Orders live | Needs a database? |
|---|---|---|---|---|
| **A — POS is the system of record** | Clover, Square, Toast | Their catalog | Their orders API | No |
| **B — Payments only** | Stripe, or a POS with no usable API | **We own it** | **We own it** | **Yes** |
| **C — Nothing at all** | Cash-and-paper shop | We own it | We own it | Yes |

Shape A is what we have built twice. The shop's own till stays the source of
truth, we never own inventory, and no database is required — which is exactly why
this proof of concept got as far as it did without AWS.

**Stripe is not a POS.** It moves money and nothing else. A Stripe restaurant has
no catalog to read and no order to write, so we become the system of record for
the menu, the order and the kitchen ticket. That is a materially bigger product:
it is the DynamoDB moment, plus an admin UI so the owner can change a price
without calling us.

**Therefore:** prefer restaurants on shape A while there is one developer.
Shape B is not forbidden, but it should be a priced decision rather than a
surprise discovered in week two.

---

## 5. Shape (as built, 2026-09-01)

```
src/
  app/            ROUTES ONLY — a Next requirement, see src/app/README.md
    layout.tsx      the one root layout Next permits; no fonts, no palette, no shop
    globals.css     Tailwind imports + @theme mappings + element resets
    (snowdaes)/     route group: /  and  /api/*
    asian-kitchen/  /asian-kitchen
  restaurants/
    snowdaes/       home, components (incl. its own shadcn ui), lib, menu, theme
    asian-kitchen/  components, menu, config, theme
  pos/
    clover/         client, catalog, order, hours, idempotency
```

Three directories. Every file has an owner, and `src/` has nothing loose in it.

**Route groups.** `(snowdaes)` is parenthesised, which in Next means the folder
organises files without contributing a URL segment. `/` and `/api/*` have nothing
in the URL saying who owns them — `app/api/` read as "the app's API" when it is
Snowdaes' Clover integration. `asian-kitchen/` is deliberately NOT grouped: the
URL segment already names the owner, and `(asian-kitchen)/asian-kitchen/` said
the same word twice.

**Nothing is shared between restaurants.** Audited mechanically: zero imports
cross between them, and the shadcn primitives plus `cn()` moved into Snowdaes,
which is the only thing using them. The only files both sites touch are the root
layout and `globals.css`, both of which Next requires and neither of which
carries a palette.

## 5b. Original target shape (for reference)

```
src/
  domain/           types, cart, modifier shaping — no POS, no restaurant
  pos/
    clover/         what lib/clover*.ts is today
    square/         new; written concretely, duplicating freely
    types.ts        ← added in Phase 3, extracted from the two above
  restaurants/
    snowdaes/       menu.*.generated.ts, branding, product types, art
    asian-kitchen/
  app/              routes resolve a restaurant, then call its POS
  components/       mostly unchanged
```

Which restaurant a deployment serves comes from **one environment variable**, not
from the hostname. A deploy serves exactly one restaurant (§2), so the value is
constant per environment and can be read once at boot and validated loudly.

---

## 6. Phasing

**Phase 1 — Move, do not abstract. DONE 2026-09-01.** Two passes. The first moved
data and the POS client; the second, after review, moved everything else — the
first pass left Asian Kitchen tidy in one folder while Snowdaes was still smeared
across `app/`, `components/`, `store/`, `lib/` and `hooks/`, which is not a
separation at all.

**The two restaurants now share nothing.** Verified mechanically: zero imports
cross between them, and Asian Kitchen imports nothing from any shared directory.
Snowdaes uses `lib/utils` (`cn`) and three `components/ui/` primitives, which are
vendored shadcn code rather than a shared theme.

Three things that had looked global turned out to be Snowdaes wearing a global name:

| Was | Now | Why it mattered |
|---|---|---|
| Fonts + metadata + theme colour in `app/layout.tsx` | Each restaurant's own route | A root layout shared by two shops must not describe either |
| `:root { --background: #faf8f5; --primary: #f5901e; … }` in `globals.css` | `restaurants/snowdaes/theme.css`, scoped `.snowdaes` | One shop's penguin-orange was a property of the whole app; Asian Kitchen inherited a palette it has no use for |
| `body { @apply bg-background }` | Each route paints its own ground | Snowdaes' cream showed behind Asian Kitchen on overscroll |

`globals.css` now holds only what is genuinely shared: Tailwind's imports, the
`@theme inline` mappings (build configuration, not values), and element resets.

| From | To |
|---|---|
| `src/config/menu*.ts`, `promos.ts`, `item-art.ts`, `shop.ts` | `src/restaurants/snowdaes/` |
| `src/types/boba.ts` | `src/restaurants/snowdaes/types.ts` |
| `src/lib/clover.ts` | `src/pos/clover/client.ts` |
| `src/lib/clover-catalog.ts` | `src/pos/clover/catalog.ts` |
| `src/lib/clover-order.ts` | `src/pos/clover/order.ts` |
| `src/lib/clover-hours.ts` | `src/pos/clover/hours.ts` |

`src/config/` and `src/types/` no longer exist. `scripts/import-menu.mjs` now
writes into `src/restaurants/snowdaes/`. Verified: `tsc` and `eslint` clean,
production build passes, and both `/` and `/asian-kitchen` serve their own menus.

**One thing the move exposed.** `pos/clover/order.ts` imports
`restaurants/snowdaes/menu` — a POS integration that knows which restaurant it
serves. The dependency points the wrong way and a second Clover restaurant would
have nowhere to go. Left in place and commented at the import, because inverting
it is the Phase 3 redesign done early against one example (§3).

**Phase 2 — Build Square concretely.** Asian Kitchen against a Square sandbox
with a hand-built catalog transcribed from their public listing. Duplicate
whatever is easier to duplicate. Do not touch `pos/clover/`.

> **Partly done, 2026-09-01 — the front end exists, the POS does not.**
> `src/restaurants/asian-kitchen/` holds the menu (68 items, 7 categories, 6
> modifier groups), the brand config, a scoped stylesheet and the ordering
> screen; `/asian-kitchen` renders it. Phase 1 was skipped for now — the Clover
> code has NOT moved, and Snowdaes still owns `/` and builds unchanged. Square
> itself is untouched: the cart is local state, nothing is priced by a POS and no
> money can move. See `docs/ASIAN-KITCHEN.md` §9.

**Phase 3 — Extract.** Write `pos/types.ts` from the two working
implementations, per the trigger in §3.

**Phase 4 — Real credentials.** Swap the sandbox for Asian Kitchen's real Square
merchant when the owner provides a key, and reconcile the transcribed menu
against their actual catalog.

---

## 7. Snowdaes vocabulary sitting in shared code

Things that read as generic today and are not. All of these move to
`restaurants/snowdaes/` in Phase 1:

- **`ProductType = "DRINK" | "SHAVED_SNOW" | "EGG_PUFF" | "SHAVED_ICE"`** — the
  most obviously Snowdaes-shaped thing in `types/boba.ts`. It drives
  `config/item-art.ts`, which draws an SVG per product type. Asian Kitchen needs
  none of these four. This has to become per-restaurant config, not a shared
  union.
- **`config/item-art.ts`** — hand-drawn illustrations of boba and shaved snow.
- **`config/promos.ts`** — `NEWCUSTOMER` is Snowdaes' campaign, not a platform feature.
- **`SHOP_TIMEZONE = "America/New_York"`** in `lib/clover-hours.ts`. Birmingham is
  Central. This is a live bug the moment a second restaurant exists.
- **`Hours · Billerica`**, hard-coded in `components/open-badge.tsx`.
- The whole visual identity — see §9.

---

## 8. What Square changes (RESEARCHED, NOT YET BUILT)

From Square's published API documentation. None of it verified against a live
merchant by us.

| | Clover | Square |
|---|---|---|
| Pricing a cart | Create a real order, read the total back | **`CalculateOrder`** — totals without creating an order |
| Sizes | Separate items (`Snow - Kiddie/Small/Large`) | **`ITEM_VARIATION`** under one `ITEM` |
| Idempotency | Optional; unverified on `/v3` | **`idempotency_key` is required** on writes |
| Hosts | Three, non-interchangeable | One |
| Card entry | Clover iframe SDK | Web Payments SDK — also Cash App Pay, Afterpay |
| Catalog model | Items + modifier groups | `CatalogObject`: `ITEM`, `ITEM_VARIATION`, `MODIFIER_LIST`, `MODIFIER`, `CATEGORY`, `TAX`, `DISCOUNT` |

Two of these land on us directly:

**`CalculateOrder` removes a whole bug class.** Every orphaned OPEN order this
project has fought — the 11 duplicates, the 9 swept on 2026-08-31, the entire
`lib/idempotency.ts` exercise — exists because Clover cannot price a cart without
creating one. On Square, `/api/checkout` becomes a pure pricing call and an order
is created only at payment. The idempotency work still matters; it moves to one
place instead of two.

**Item variations break `MenuItem`.** `basePrice` is a flat number today and three
sizes are three rows. Square models one item with variations, which is the better
model — Clover's version loses the fact that they are the same product. This is
the one shared domain type that genuinely has to change, and Phase 3 is where it
happens, informed by both.

---

## 9. Open — visual identity

Deferred by agreement, to be worked properly rather than guessed at. The current
design system is Snowdaes down to the illustrations: bright warm-white,
joyful, built around cut-out product photography and a penguin mascot
(`PLAN.md` §1). A Chinese restaurant in Birmingham needs a different answer.

Approach when we get to it: research comparable independent-restaurant sites the
way the Clover integrations were surveyed, using the skills and MCP tooling
available, and record the benchmark table per restaurant the way `PLAN.md` §1
does — rather than restyling by taste.

**`PLAN.md` §1 becomes Snowdaes' benchmark table, not the repo's.**

---

## 10. Risks

| Risk | Standing | Note |
|---|---|---|
| The transcribed menu is wrong or stale | **Live** | It is a third party's copy of a menu, not the menu. Everything built on it is provisional until a real Square catalog arrives |
| Photo provenance | **Live** | See `docs/ASIAN-KITCHEN.md` §4. Scraping for the MVP demo is agreed; shipping publicly is a different question |
| Square credentials may not arrive | Low | Owner said yes on the phone. Sandbox work is not wasted either way |
| Phase 1 breaks Snowdaes silently | Low | Nothing is being demoed for a month, and the branch is not deployed |
| Extracting the interface too early | Medium | The whole point of §3. The trigger is written down; hold to it |
| Timezone bug the day #2 exists | **Certain** | §7. Central vs Eastern, hard-coded |

---

## Decision log

- **2026-08-31 — one deploy per restaurant, not multi-tenant.** Credential blast radius. §2.
- **2026-08-31 — duplicate first, abstract third.** No POS interface until two work; trigger recorded. §3.
- **2026-08-31 — `PLAN.md` is demoted to Snowdaes' plan.** This file is the umbrella.
- **2026-08-31 — visual identity deferred**, to be researched rather than guessed. §9.
