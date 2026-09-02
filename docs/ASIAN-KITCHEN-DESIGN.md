# Asian Kitchen — design & flow direction

**Direction chosen 2026-09-01: A's header on B's body.** See §6. Nothing built yet. Companion to `ASIAN-KITCHEN.md`
(the restaurant) and `../PLATFORM.md` §9 (why this was deferred).

Researched 2026-09-01 by walking the real ordering flows, not from memory.

---

## 1. Benchmarks

`PLAN.md` §1 does this for Snowdaes — Starbucks brightness, Alley typography,
Kung Fu Tea skeleton. This is the same table for a different restaurant, and it
does **not** inherit any of those three.

| Site | Role | What to take |
|---|---|---|
| **[Panda Express](https://www.pandaexpress.com/menu)** | **Naming benchmark**, and a rejected flow | `BOWL · 1 Side & 1 Entree` reads instantly; `Pick Any One Item` does not. Take the naming. Their format-first funnel was tried and rejected — §2 |
| **[Cava](https://cava.com/menu)** | **Menu-architecture benchmark** | "Build Your Own" as one category among many, sitting second after Featured. Sticky category rail. Food photographed on a plain ground |
| **Asian Kitchen's own sign** | **Palette source** | The existing logo is a green roundel with crossed chopsticks. Not red. Not gold |

**Deliberately not a benchmark:** Cava's palette. Cream ground plus rust plus a
yellow accent is both a Cava-ism and one of the three looks generative design
falls into by default. Taking their *architecture* is useful; taking their
colours would produce a page that reads as templated.

### What was actually observed

**Panda Express** opens on `Choose Your Meal Type to Start Your Order` — three
cards, `BOWL · 1 Side & 1 Entree`, `PLATE · 1 Side & 2 Entrees`, and Panda
Bundles. Format is the *first* decision, before any food. Red header, panda
roundel, dark wok hero, then cut-out food photography on white cards.

**Not observed:** the slot-filling screen itself. Clicking `PLATE` redirected to
`/location?…&category=/menu/plate/plate` — Panda gates plate-building behind a
store picker and resumes afterwards. So how they render "now pick your two
entrées" is **unknown and unverified**; do not let anyone quote this document as
though it were.

That gate is worth noticing for its own sake. Panda needs it because they have
2,000 stores. **Asian Kitchen has one**, so the entire location step vanishes and
the funnel is a step shorter than the benchmark's. That is a real advantage and
the design should spend it.

**Cava** takes the other approach: no gate, a sticky rail reading
`Featured · Build Your Own · Bowls · Pitas · Sides · Kids Meal · Drinks ·
Desserts`. Curated bowls lead; the builder is one option among several. Heavy
black caps display, cream ground, yellow pill CTA, and every bowl shot on a plain
field with a soft grey shadow.

---

## 2. The flow decision — SETTLED 2026-09-01

**A categorised menu you browse. Not a plate builder.** An earlier draft of this
document proposed a Panda-style format-first funnel with the builder as the hero.
That was wrong, and reading their real Storefront settled it.

Two things killed it.

**The menu is seven businesses, and only one is combos.** `Most Ordered · House
Special · Entree · Pick a Meal (Asian Food) · Philly Cheesesteaks · Wings
Specials · Sides · Drinks`. Wings run from 6 to 50 pieces with their own flavour
system. Philly cheesesteaks have their own combo upgrade. Neither fits inside a
Chinese-combo frame, and a builder-first landing would bury a third of the menu.

**People are not building varied plates.** Their listing publishes the five most
common `Pick Any Three` orders, and three of the five are the *same entrée three
times* — Sesame ×3, Honey ×3, Honey ×3 (`ASIAN-KITCHEN.md` §8). The mental model
is not "compose a tray." It is "give me a lot of sesame chicken." Any interface
that makes variety the happy path optimises for the minority.

So: **browse categories, discover dishes, configure when needed.** The combo is
an item with a good configurator behind it — not the organising principle of the
site.

The job to design against, from their own reviews (*"I've been getting Asian
Kitchen 2-3 times a week"*, *"My 3rd order this month"*): **a returning regular
completes a pickup order in under ninety seconds.** 4.5 stars from 3k+ ratings.
Discovery is not their problem; speed is.

### What to take from their current configurator

Their modal does one genuinely good thing worth stealing: **"Your recommended
options"** — five pre-built popular combos, one tap each, above the four required
groups. For the customer who wants Sesame ×3, that is the entire order in one
tap instead of four scrolling selections.

What not to take: four separate `Select 1` groups stacked vertically in a modal,
with the side wedged between the 1st and 2nd entrée. It is a form, and it is
below the fold.

---

## 3. Design plan

### The subject, pinned

A Chinese kitchen in Center Point, Birmingham that also sells Philly
cheesesteaks, Cajun ranch fries and lemon-pepper wings. That hybrid is the most
characteristic true thing about it, and no stock "Asian restaurant" template
carries it. The design should look like *this* restaurant in *this* city, not
like a category.

### Signature — "the usual", and one-tap repeats

The most characteristic true thing about this restaurant is not the food format.
It is that **the same people come back two or three times a week and order the
same thing.** The reviews say it outright and the combo data proves it.

So the signature is the opposite of a builder: **the site remembers, and offers
the order back.** A returning customer lands on their last order, priced, one tap
from the cart. Nobody else in their category does this — a rented white-label
site cannot, because the customer belongs to the aggregator.

Inside the combo configurator, the same idea in miniature:

- The popular combinations first, one tap each — the aggregator's best trick, kept.
- A **"same for all three"** control, because that is what half the orders are.
  Choosing Sesame Chicken once should be able to fill all three slots.

This is also the strongest possible answer to §2 of `ASIAN-KITCHEN.md`: the pitch
is that he owns the customer relationship, and "your usual, one tap" is that
argument made visible rather than argued.

**Caveat:** remembering an order needs somewhere to remember it. Per
`PLATFORM.md` §4 that is the database this project has deliberately not built.
A first version can do it in the browser for one device; doing it properly is a
priced decision, not a freebie.

### Colour

Built from their existing green roundel, because they already own it and because
red-and-gold is simultaneously the Chinese-restaurant cliché *and* Panda's
palette. Red is demoted from a brand colour to a **data** colour.

| Token | Hex | Role |
|---|---|---|
| `--ground` | `#F6F8F3` | Warm near-white, faintly green-biased. Not cream |
| `--ink` | `#14180F` | Near-black, green-biased |
| `--jade` | `#1F6B45` | From the sign. Structure, headers, the selected state |
| `--jade-deep` | `#0E3A26` | Hover, footer |
| `--chili` | `#C8452B` | **Prices and counts only** — never a field |
| `--card` | `#FFFFFF` | Menu cards and the configurator; food supplies the colour |

Exact green to be sampled from the real logo, not guessed.

### Type

- **Display** — a wide, heavy grotesque (Archivo at expanded width). Menu-board weight, no nostalgia, no faux-brush "oriental" lettering. That trope is both dated and disrespectful, and their own sign does not use it.
- **Body** — Public Sans. Plain, legible at arm's length on a phone in a car.
- **Utility** — a mono for prices, calorie counts and selection counters ("2 of 4 chosen"), because those are data and should line up. Their menu is full of numbers: 6/10/15/30 wings, calorie ranges, `+$1.50` deltas.

Deliberately **not** Bricolage Grotesque or Newsreader — those are Snowdaes'
faces, and two restaurants out of one repo must not look like siblings.

### Layout

```
┌─────────────────────────────────────────┐
│ AK  Asian Kitchen        Open till 7:45 │  sticky, thin
├─────────────────────────────────────────┤
│  YOUR USUAL                             │  ← signature; only for returning
│  3 Items · Sesame ×3 · Fried Rice $12.89│    customers, absent otherwise
│  [ Reorder ]                            │
├─────────────────────────────────────────┤
│ Meals│Entrées│Wings│Philly│Sides│Drinks │  sticky rail
├─────────────────────────────────────────┤
│ [photo] Pick Any Three   $12.89  #1 ♥   │
│ [photo] Pick Any Two     $11.19  #2 ♥   │
│ [photo] Combination Rice $14.99         │
└─────────────────────────────────────────┘
```

For a first-time visitor the "Your usual" band is simply absent and the rail is
the top of the page — no empty state pretending to be content.

---

## 4. Self-critique

Run against the plan before proposing it.

- **Cream + serif + terracotta?** No — rejected explicitly in §1, and it is Cava's.
- **Near-black with one acid accent?** No.
- **Numbered `01 / 02 / 03` markers?** Not used. Nothing here is a sequence — a menu is a set of choices, not steps.
- **Was the first plan a default?** Yes, and it was cut. A compartment-tray builder was the original signature; the Storefront data killed it (§2). Recorded rather than quietly deleted, because the reasoning is the useful part.
- **Is "your usual" a gimmick?** It is the one thing an aggregator structurally cannot do, and it comes straight from their own review text. The risk is not novelty, it is storage — see the caveat in §3.
- **One accessory removed:** an earlier version also gave the combo configurator a hero slot on the landing page. The rail and "your usual" carry it; a third emphasis would have flattened all three.

---

## 5. Open

1. **Sample the real green** from the logo. Everything in §3 hangs off a colour currently guessed from a screenshot.
2. **Photography.** Their Storefront photography is genuinely good — plated food on a warm wooden table — and it is the *only* thing on that page that belongs to Asian Kitchen. Which makes the provenance question in `ASIAN-KITCHEN.md` §4 sharper, not softer.
3. ~~What is in "Pick Any Three"?~~ **Answered** — 12 entrées, 7 sides, four required selections. `ASIAN-KITCHEN.md` §8.
4. **Do wings and cheesesteaks belong on the same page?** A third of this menu is not Chinese. Pretending otherwise in the design would misrepresent the restaurant; leaning into it is more honest and more distinctive. Worth asking him how he sees his own business.


---

## 6. Chosen — A's header, B's body (2026-09-01)

Three directions were mocked on the same screen and the storefront header won on
one criterion: **the restaurant name is legible and recognisable immediately.**
Everything below the header comes from the quiet, photography-led direction.

**Mocks:** [Three Doors](https://claude.ai/code/artifact/024cb2fe-d6a5-49e5-85ea-37b04bda5a50)
(the options) · [Ordering Screens](https://claude.ai/code/artifact/b5fbd2a7-1233-424d-856f-bd141ff1872b)
(the resolved design, menu + combo builder)

### What that means concretely

- **Header** — kelly green band, white heavy *condensed* caps wordmark, AK roundel, and the `HIBACHI · ASIAN · PHILLY STEAK` bar kept verbatim from the sign. Hours on the right.
- **Body** — near-white ground, underline category tabs rather than boxed pills, food photography carrying the colour, green reserved for the reorder button and the selected state.
- **`Your usual`** — soft green panel directly under the header. One tap to reorder.

### Corrections the storefront photo forced

- The wordmark is **condensed**, not the wide grotesque proposed in §3.
- The green is brighter than the guessed `#1F6B45` — closer to kelly. Still estimated from a photograph; his artwork replaces it.
- `HIBACHI` is on the sign and **absent from the online menu**. It sits in the tagline bar on his authority. If hibachi is gone, the bar changes — and direction C, which made it a front door, is dead.

### The combo builder — where the work is

Their Storefront asks for four separate `Select 1` groups with the side wedged
between the 1st and 2nd entrée. The design replaces that with:

1. **The three real popular combinations first**, one tap each — their listing publishes them and half are the same entrée three times.
2. **A "same for all three" control**, which collapses four required selections into two for the majority case.
3. **The side last**, where a person actually thinks about it.
4. **Price deltas on the chip** (`+$1.50` for beef and shrimp), visible before tapping rather than as a total that silently jumped.

Measured against what they have now: a repeat order goes from roughly six
interactions to **one**, and Sesame ×3 from four dropdowns to **one tap**. That
is the pitch — not the colours.

**The dependency:** "Your usual" needs somewhere to store an order. Per
`PLATFORM.md` §4 that is the deferred database, and it is the first thing on this
project that costs money every month.
