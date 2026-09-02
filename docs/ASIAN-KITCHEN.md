# Asian Kitchen, Birmingham — restaurant brief

Restaurant #2. **Square.** Planning only; nothing built.
Umbrella plan: `../PLATFORM.md`. Owner questions: this file, §6.

---

## 1. What we know

| | |
|---|---|
| Name | Asian Kitchen |
| Location | Birmingham, Alabama — Center Point. **Single location, confirmed by owner** |
| POS | Square (stated by the owner) |
| Timezone | **America/Chicago** — Central, not Eastern |
| Contact | Phone conversation held. Owner expects to see something built |
| Credentials | **None yet.** Owner has said he will provide a Square API key |
| Address | **1652 Center Point Pkwy, Birmingham, AL 35215** |
| Marketplace listing | store id `25136750` on the aggregator's marketplace app |
| Their current "website" | the same aggregator's white-label ordering site — no logo, no brand colours, the platform's typeface |

**One location, confirmed.** So the whole location-gate apparatus in `PLAN.md`
§8.6 — the chooser, `/billerica` vs `/lowell`, cart-per-location — is Snowdaes
machinery that Asian Kitchen does not need. Do not carry it over.

**Hours (from their public listing, 2026-08-31): 10:30 am – 7:45 pm.** Single
range, no split day. Timezone **America/Chicago**.

---

## 2. They are not offline

The framing "no online presence except the delivery apps" undersells the situation in a
way that matters for the pitch. Four ordering surfaces already exist, and one of
them is a website:

**Pickup**

| Surface | Customer pays | Quoted ready |
|---|---|---|
| Aggregator marketplace app | No fee | 3 min |
| **Aggregator white-label site** | No fee | 3 min |
| Uber Eats | No fee | 1–16 min |
| Postmates | No fee | 1–16 min |

**Delivery**

| Surface | Customer pays | Quoted |
|---|---|---|
| Uber Eats | Service fee 5–15% · delivery from $0.50 | 15–30 min |
| Aggregator marketplace app | Delivery from $0.50 · service fee may apply | 28 min |
| **Aggregator white-label site** | **Service fee 10% · delivery $3.99** | 23 min |
| Postmates | Service fee 5–15% · delivery from $0.50 | 15–30 min |

**That second row is the aggregator's white-label product** — the same company
as the marketplace listing, sold to the merchant as "your own online ordering".
That *is* Asian Kitchen's website, rented. So the argument is not "you have
nothing." It is:

> You already have an ordering website. The aggregator owns it, owns the
> customer list behind it, and adds a fee to every delivery order placed
> through it.

That is the same argument `artifacts/snowdaes-vs-owner.html` makes against
Owner.com, and it transfers almost unchanged.

### A precision point, so nobody quotes it wrongly

**Every figure above is what the CUSTOMER pays.** None of them is Asian Kitchen's
commission. The merchant side — what each platform takes from the restaurant, and
what the white-label site costs in processing — is **not visible from the outside
and has not been established.** Do not repeat "they take 10%" to the owner; the
10% is the diner's service fee on the white-label site.

The merchant numbers are on his statements, and asking for them is §6.

---

## 3. Menu — SCRAPED 2026-08-31

Read from the listing's `application/ld+json`, which carries the full
menu as structured data. **68 unique items, $0.50 – $64.49**, in 8 sections:
Most Ordered · House Special · Entree · Pick a Meal (Asian Food) · Asian Food ·
Philly Cheesesteaks · Wings Specials · Sides · Drinks.

Rating **4.5 from 3k+ ratings, 100+ public reviews** — this is a busy,
well-liked restaurant, not a struggling one. That matters for the pitch: the
argument is margin, not rescue.

### The finding that decides the build

The top sellers are **combos assembled from other menu items**:

| Item | Price | Description | Signal |
|---|---|---|---|
| Pick Any Two Items | $11.19 | "2 entrées & 1 side" | **#1 most liked**, 352 ratings |
| Pick Any Three Items | $12.89 | "3 entrées & 1 side" | **#2 most liked**, 300 ratings |
| Pick Any One Item | $9.59 | "1 entrée & 1 side" | 145 ratings |

Roughly **800 rated orders** across those three. The business is a
build-your-plate.

More choice-driven items:

- **Wings** — 8 SKUs from 6 to 50 pieces, all *"Choice of flavors: Buffalo, Asian spice, sweet chili, mild, lemon pepper, Asian BBQ"*
- **Fountain Drink** $2.99 — *"regular or large. Choose from Coca Cola, Diet Coke, Hi-C Fruit Punch, Sprite, Fanta, Pibb Xtra"*
- **Fruit Lemonade / Fruit Tea** $3.49 — *"Strawberry, blueberry, peach"*
- **Philly Cheesesteaks** section note — *"Upgrade to combo with fries and coca cola for an additional charge. Extras for an additional charge."*

**So: modifiers are not optional here, they are the product.** Question closed.

### But the modifier SHAPE is different from Snowdaes

This is the part worth thinking about before writing code.

| | Snowdaes | Asian Kitchen |
|---|---|---|
| What a modifier is | An *adjustment* — ice level, sugar %, a topping | A *choice of dish* — which three entrées |
| Option count | 4,962 across the menu | ~15 entrées, ~6 wing flavours, ~6 sodas |
| Priced? | Mostly `priceDelta` | Mostly included in the combo price |
| Is the option also a product? | No — "Extra Boba" is not a menu item | **Yes** — "General Tso Entree" is a $7.99 item *and* an option inside three combos |

That last row is a genuine modelling problem. `ModifierOption` is
`{ id, name, priceDelta }`, which can *express* it, but the content is then
duplicated: fifteen entrées exist once as items and again as options in each of
three combos. Whatever we do, decide it deliberately rather than discovering the
duplication at menu-import time.

**And the drawer UX does not transfer.** `modifier-drawer.tsx` was built for pill
rows — "Ice: Regular / Less / None". Choosing three entrées out of fifteen, with
photographs, is closer to a small menu than a pill row. See `PLATFORM.md` §9;
this is a concrete reason the Kung Fu Tea skeleton may be the wrong skeleton.

### Provisional, still

Everything above is a third party's copy of the menu, not the menu. Prices on
delivery platforms are often marked up — though Snowdaes turned out to have zero
markup on Uber Eats across all 119 items, so measure rather than assume.

Nothing built on this survives contact with a real Square catalog unchecked.

**When the Square key arrives**, run the same diff done for Snowdaes: pull the
real catalog, compare item-by-item against the transcribed menu, and report the
differences. That diff was the single most useful artifact of the Snowdaes work
and it costs an hour.

---

## 4. Photographs — copyright not cleared

The menu photography was taken from a third-party ordering listing. **It may be
subject to third-party copyright and has not been cleared.**

Fine as placeholder while building. **Check with the owner, or replace the
images, before any complete deployment.** If they turn out not to be his,
photography becomes a real line item rather than a detail — worth knowing before
it is discovered.

---

## 5. Build plan

Per `PLATFORM.md` §6, Asian Kitchen is Phase 2 and does not begin until Phase 1
(relocating the Clover code) is done.

1. Square **sandbox** merchant; catalog hand-built from the transcribed menu.
2. `pos/square/` written concretely. **No shared interface** — see `PLATFORM.md` §3.
3. `CalculateOrder` for pricing, so no order exists until payment. This is the
   Square feature that removes the orphan-order problem Clover forced on us.
4. Web Payments SDK for card entry, replacing the Clover iframe mount.
5. Timezone **America/Chicago**, per-restaurant, not the hard-coded Eastern
   constant in `lib/clover-hours.ts`.

Visual identity is deliberately not in this list — `PLATFORM.md` §9.

---

## 6. Ask the owner

Ordered by how much each answer changes the build.

1. **Square API access** — a key for a real merchant, read-only to begin with. Everything is provisional until this lands.
2. ~~How many locations?~~ **Answered: one.**
3. **The photographs — who took them?** If they are the platform's, we need our own before anything goes public.
3a. **Item descriptions for 19 dishes.** Down from 29: the board photographs
    supplied the six Philly ingredient lists outright, and re-reading the
    delivery listing recovered descriptions our first transcription had dropped
    (side fried rice, side lo mein, Cajun ranch fries, combination fried rice).
    The site will not invent ingredients for food nobody here has cooked —
    allergens alone make that unacceptable. One sentence each from the kitchen
    fills the rest:

    *house rice and lo mein* (6) · *fries and Yum Yum sauce* (7) · *entrées the
    board does not list* (3: Broccoli Chicken, Spicy Grill Chicken, Beef and
    Broccoli) · *bottled drinks, bottled water, Arnold Palmer* (3).

3b. **Which entrée list is current?** Three sources read on 1 Sep 2026, and
    the third one settles most of it.

    | | In-store board | Uber Eats | DoorDash |
    |---|---|---|---|
    | Pick Any One / Two / Three | $7.99 / $9.49 / $10.99 | **same** | $9.59 / $11.19 / $12.89 |
    | Family Feast | $32.99 | $32.49 | $34.99 |
    | Original Cheesesteak (small) | $6.99 | $6.99 | $7.49 |
    | Beef surcharge | +$1.00 | **+$1.00** | +$1.50 |
    | Shrimp surcharge | +$1.50 | +$1.50 | +$1.50 |
    | Combo entrée choices | 15 | 11 | 12 |
    | Builder shape | — | one "Choose 3" group, then the side | four Select-1 groups, side wedged between the 1st and 2nd entrée |

    **The board is not stale.** That was the working assumption and it was
    wrong: Uber Eats charges the board's prices today, surcharge included.
    DoorDash is the outlier on every row — roughly a 20% markup on the mains
    and a flat $1.50 surcharge nobody else charges.

    **The surcharge is settled: +$1.00 beef, +$1.50 shrimp.** Two sources
    against one.

    **Base prices are NOT settled, and the decision is the owner's.** This
    repo's prices are DoorDash's throughout, which means the direct-ordering
    site currently quotes about 20% more than the shop's own counter — the
    exact opposite of what the project is for. Switching them is a pricing
    decision, not a data fix: see §6.

    **The entrée list is still open.** Uber Eats' eleven are a strict subset of
    the board's fifteen, so the board remains the superset and this repo keeps
    it. Board-only, unconfirmed by either platform: Kung Pao Chicken, Mushroom
    Chicken, Pepper Steak, Jalapeño Shrimp. DoorDash-only, on neither the board
    nor Uber Eats: Chicken and Broccoli, Spicy Grill Chicken.

    One thing worth stealing: Uber Eats asks for the entrées as a single
    "Choose your proteins · Choose 3" group and then the side — the same shape
    this repo already uses, and better than DoorDash's four separate lists.

---|---|---|
    | Combo entrée choices | 15 | **12** |
    | Beef surcharge | +$1.00 | **+$1.50** |
    | Shrimp surcharge | +$1.50 | +$1.50 |
    | Only on the board | Kung Pao, Mushroom Chicken, Spicy Beef, Pepper Steak, Jalapeño Shrimp | — |
    | Only on the listing | — | Chicken and Broccoli, Spicy Grill Chicken |

    **The surcharge follows the listing**, because every base price in
    `menu.ts` does: a total assembled from two price lists is right in neither.
    Verified against the listing's own arithmetic — two Black Pepper Shrimp on
    a Pick Any Three prices at $15.89 there, and at $15.89 here.

    The entrée *list* is currently the board's fifteen, which is the one place
    the two sources are still mixed. Ask the owner which is real before
    resolving it — the board is newer in at least one respect (it carries a
    Mango Habanero wing flavour the listing has never had), so "the photograph
    is old" does not settle it.
4. **What do the delivery apps actually cost you?** Not the diner-facing fees — the commission on his statements, per platform. This is the number the whole pitch rests on, and only he can see it.
5. **Is Storefront under contract, and can it be turned off?** Some white-label deals carry terms; worth knowing before proposing a replacement.
6. **Pickup only, or delivery too?** Delivery means a courier relationship, which is a much larger commitment than an ordering page.
7. **Who updates the menu today**, and how often do prices move?
8. **Hours** — published on Square, or kept somewhere else?

---

## 7. Open questions for us

- Does Square expose business hours per location in a shape `open-badge.tsx` can consume, the way Clover's `opening_hours` did?
- ~~Does the menu need modifiers?~~ **Answered: yes, they are the product.** §3. The open part is the *shape* — an option that is also a menu item — and the drawer UX.
- ~~What are the actual combo option lists?~~ **Answered — read in full from their white-label ordering site, 2026-09-01. See §8.**
- Is the Kung Fu Tea ordering skeleton (`PLAN.md` §1) right for this restaurant, or is it a boba-shop pattern being carried somewhere it does not belong?
- ~~Does choosing Square get us DoorDash delivery cheaply?~~ **Answered 2026-09-02, and the answer is no.** Square's On-Demand Delivery is Square Online only and does not dispatch a courier through the Orders API, so delivery on our own checkout is a direct DoorDash Drive integration. See `docs/SQUARE-PAYMENTS.md` §1.
- **Does an order created through the Orders API reach the kitchen and print?** Unanswered, unanswerable in a sandbox, and blocking — the same question that dropped Phase 4 on the Clover side (`PLAN.md` §8.7). `docs/SQUARE-PAYMENTS.md` §8.


---

## 8. The combo structure — READ IN FULL 2026-09-01

Their **white-label ordering site** is not gated the way the aggregator's own
marketplace app is, so the whole configurator is readable. This is the real
modifier shape.

### `Pick Any Three Items` — $12.89, *"3 entrées & 1 side"*

Six modifier groups. The CTA reads **"Make 4 required selections – $12.89"**.

| Group | Rule | Options |
|---|---|---|
| 1st Item Choice | Required · Select 1 | 12 |
| Side Choice | Required · Select 1 | 7 |
| 2nd Item Choice | Required · Select 1 | 12 |
| 3rd Item Choice | Required · Select 1 | 12 |
| Recommended Beverages | Optional · up to 5 | 5, all priced |
| Recommended Sides and Apps | Optional · up to 5 | 5, all priced |

**Entrées (12)** — Honey Chicken · Sesame Chicken · General Tso (Mild) · Orange
Chicken · Black Pepper Chicken (Mild) · Grilled Teriyaki Chicken · Mixed
Vegetables · Chicken and Broccoli · Spicy Grill Chicken · **Broccoli Beef +$1.50**
· **Mongolian Beef +$1.50** · **Black Pepper Shrimp +$1.50**

**Sides (7)** — Lo Mein · Fried Rice · Mixed Vegetables · Steamed Rice · Chicken
Egg Roll · Veg Spring Roll · Cream Cheese Rangoon

Every option carries a calorie count, and beef/shrimp carry a **+$1.50 delta** —
so `ModifierOption.priceDelta` maps cleanly and no model change is needed for
this. Note the group order is 1st Item → **Side** → 2nd Item → 3rd Item; the side
sits second, which is odd and worth not copying.

### The finding that changes the design

The listing shows **"Your recommended options"** — five pre-built combos labelled
*"Ordered recently by 10+ others"*:

| # | Combination | Price |
|---|---|---|
| 1 | Sesame Chicken · Fried Rice · **Sesame Chicken · Sesame Chicken** | $12.89 |
| 2 | Honey Chicken · Lo Mein · **Honey Chicken · Honey Chicken** | $12.89 |
| 3 | Honey Chicken · Lo Mein · Sesame Chicken · Orange Chicken | $12.89 |
| 4 | Honey Chicken · Fried Rice · **Honey Chicken · Honey Chicken** | $12.89 |
| 5 | Honey Chicken · Fried Rice · Black Pepper Shrimp · Black Pepper Shrimp | $15.89 |

**Three of the five most popular orders are the same entrée three times.**

People are not assembling a varied plate. They want a lot of sesame chicken. Any
interface built around "compose a balanced tray from three different dishes"
optimises for the minority case — see `ASIAN-KITCHEN-DESIGN.md` §3, which was
rewritten because of this.

### Their current site, as a baseline

That rented site carries **no logo, no brand colour and the platform's typeface**. The
only thing on it that belongs to Asian Kitchen is the photography. Beating it on
identity is a low bar; beating it on ordering speed is the real work.


---

## 9. What is built (2026-09-01)

`/asian-kitchen` runs. Production build passes and the route prerenders static;
Snowdaes' `/` is unchanged and still builds.

| File | What it is |
|---|---|
| `src/restaurants/asian-kitchen/menu.ts` | 68 items, 7 categories, 6 modifier groups. **Local types** — `types/boba.ts` describes Snowdaes and `ProductType` means nothing here (PLATFORM.md §3) |
| `src/restaurants/asian-kitchen/config.ts` | Name, tagline, address, hours, `America/Chicago`, and the estimated brand green in one place |
| `src/restaurants/asian-kitchen/theme.css` | The look, scoped to `.ak` so it cannot fight Snowdaes' globals |
| `src/restaurants/asian-kitchen/menu-screen.tsx` | Header, your usual, sticky rail, tiles, combo sheet, cart |
| `src/app/asian-kitchen/page.tsx` | Route + fonts. **Scaffolding** — per §2 this becomes a root, not a path |
| `scripts/asian-kitchen/fetch-photos.mjs` | Downloads the photography. Manifest is tracked, images are not |

### Verified in the browser, not assumed

- Tapping the popular combo **Sesame ×3 · Fried Rice** fills all four required selections in one tap and enables checkout at `$12.89`.
- **Same for all** on: one tap on Broccoli Beef fills three slots → `$17.39` (3 × `+$1.50`). Toggled off, a second entrée replaces one slot → `$15.89`. The arithmetic is right.
- Your usual survives a reload and reorders in one tap.
- A sticky footer was painting over the combo list; the sheet is now a flex column with a scrolling body, not a scroll box with a sticky child.

### Photography

64 images, downloaded and then resized from **86 MB to 9.6 MB** (largest 256 KB).
Several arrived as PNGs wearing a `.jpg` extension and were re-encoded.
`public/asian-kitchen/menu/` is **gitignored** — the copyright on these is not
cleared (§4). Five items have no photo and fall back to a mark rather than a
broken tile.

### Not built, deliberately

- **No Square.** No catalog read, no order write, no payment. The cart is local state.
- ~~No Phase 1.~~ **Done 2026-09-01** — see `PLATFORM.md` §6.
- **"Your usual" is browser-local**, single device. Doing it properly is the deferred database (PLATFORM.md §4) and is the first thing here that costs money monthly.
- **Checkout is a button that does nothing.** It says Checkout because that is what it will do; it is not wired.
