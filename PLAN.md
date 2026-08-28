# Boba Shop — Ordering Website: Project Plan

> **Read this first, every time.** This file is the single source of truth for the project — vision, decisions made, current build status, and what's next. Update it whenever a phase completes or a decision changes. If you are an agent picking up work here, read all of §0–§4 before touching code; they explain *why* the code looks the way it does, not just *what* to build next.

## 0. TL;DR (for quick context loading)

Building a mobile-first ordering **website** (not a native app) for **Snowdaes** (Billerica/Lowell MA). Look and feel takes brightness from **Starbucks** and typography from **The Alley**; ordering flow copies **Kung Fu Tea** (fast category nav, bottom-sheet modifiers, sticky cart). Stack is 100% TypeScript: Next.js frontend, AWS serverless backend (Lambda/DynamoDB/API Gateway via CDK), Stripe for payment, Clerk for auth — all off-the-shelf, minimal custom infra code. Business context: this doubles as a pitch asset for a Snowdaes franchise negotiation (see §3), but the repo itself is generic and works for any boba/dessert shop.

**Built so far (local only, no cloud yet):** full menu-browse → customize → cart flow over the shop’s six real categories and four product types, on a bright Snowdaes-skinned UI with real product photography. See §5 for the file list, §5.1 for the design system, §8 for the modifier model.

**Not built yet:** everything cloud (auth, payments, database, kitchen view). See §6 for the phased plan.

**Before starting Phase 2/3, read [`CLOVER-AND-LAUNCH.md`](./CLOVER-AND-LAUNCH.md)** — the Clover / payments / AWS decision brief. It proposes charging through Clover rather than Stripe and pushing orders into the shop’s existing POS, and it flags that the “cheaper processing” claim in §2.2 does not hold at this shop’s ticket size. Nothing there is applied to this file yet; its §15 lists the proposed amendments, all gated on the owner questions in its §14.

## 1. Reference Benchmarks

Two real sites define the target experience — one for look, one for flow. Don't blend them into a third thing; keep the split explicit when making UI decisions.

| Site | Role | What to copy |
|---|---|---|
| **[Starbucks](https://www.starbucks.com/)** | Visual & aesthetic benchmark *(current)* | Bright warm-white ground, generous white space, big product photography, one confident accent colour, friendly and mass-market |
| **[The Alley](https://www.the-alley.us/)** | ~~Visual benchmark~~ — superseded 2026-08-26 | Kept for the *typographic* half only: editorial serif display, elegant type hierarchy, premium product presentation. The dark/moody palette was tried, built, and rejected — see the decision log below |
| **[Kung Fu Tea ordering flow](https://kft.orderexperience.net/)** | UX & ordering-flow benchmark | Fast location/pickup header; sticky category navigation; bottom-sheet modifier customization (Size, Sugar, Ice, Toppings); instant sticky checkout cart |

In short: **Starbucks brightness, Alley typography, Kung Fu Tea skeleton.**

> **Decision log — visual direction (2026-08-26).** The dark editorial skin was built in full first, then rejected. Reasoning: Snowdaes is a *joyful* dessert brand (Fruity Pebbles, rainbow mochi, Tajin, a cartoon penguin mascot) and a moody near-black palette fought the product; bright also lets the real cut-out product photography carry the colour, and makes the penguin mark usable as-is. What survived from the Alley pass is the three-role type system and the editorial serif. Do not re-darken the palette without revisiting this.
>
> Separately: the **legacy Wix site is not a design reference** — it was mined for *content only* (categories, product copy, photography, the penguin mark, locations). Nothing about its look carries over.

## 2. Product Brief

**Project title:** Next-Generation Direct-to-Consumer (D2C) Ordering Platform (working name; Snowdaes-specific framing below)
**Platform:** Mobile-first Progressive Web App (PWA) — no app store, works from any phone browser, "Add to Home Screen" support
**Stack:** TypeScript, Next.js, AWS Serverless (CDK, Lambda, DynamoDB, CloudFront), Stripe, Clerk

### 2.1 Executive Summary

The shop this is aimed at (Snowdaes, currently) relies on third-party aggregators (DoorDash Storefront / Uber Eats) and a template-based website, resulting in commission fee bleed, lost customer data, and clunky modifier flows for complex dessert items (shaved snow, egg waffles, boba). This project delivers a white-label, high-performance ordering system on enterprise-grade AWS serverless infra: it eliminates marketplace commissions, captures 100% of customer data, and — built ahead of any formal deal — becomes a concrete asset in franchise negotiations rather than a hypothetical pitch.

### 2.2 Problem vs. Solution

| Challenge (current state) | Solution (this platform) |
|---|---|
| High third-party fees: DoorDash/Uber Eats take 15–30% per order | Direct ordering on the shop's own Clover merchant account: no aggregator commission at all (card-not-present ~3.5% + $0.10, which they already pay today) |
| Lost customer data: aggregators own emails/phone numbers | 100% data ownership: SMS/phone login populates an owned customer database |
| Generic ordering UI: clunky modifier lists for shaved snow/drinks | Purpose-built modifier drawer: bottom sheets for size, ice, sweetness, multi-topping selection |
| Outdated brand identity: basic Wix/template presence | Modern editorial look: dark-mode aesthetic, high-contrast imagery (The Alley-inspired) |

### 2.3 Key Functional Capabilities

- **Mobile-first PWA** — no app-store barrier; QR code or direct browser visit, optional home-screen install
- **Customization engine** — built for shaved snow, egg waffles, and boba specifically: dynamic multi-tier pricing for bases, ice levels, sweetness, and multi-select add-ons
- **Frictionless checkout** — one-tap SMS auth (Clerk), direct Apple Pay / Google Pay (Stripe Checkout)
- **Live Kitchen Display System (KDS)** — lightweight browser-based `/kitchen` board, auto-refreshing, no POS hardware rental needed
- **Real-time order tracking** — `/orders/[id]` status tracker: Received → Preparing → Ready for Pickup

### 2.4 High-Level Architecture

```
[ Customer Phone / Browser ]
         │
         ├── S3 + CloudFront (CDN delivery)
         ├── Next.js Frontend (Tailwind + shadcn/ui)
         │
         ▼
[ AWS Amplify Gen 2 ]
         │
         ├── AppSync GraphQL API + typed client (generated from schema)
         ├── DynamoDB (one table per model: MenuItem, Order)
         ├── Amplify Functions (Lambda)
         │     ├── catalog-sync ──> Clover Inventory API (nightly)
         │     ├── checkout-session ──> Clover Hosted Checkout
         │     ├── clover-webhook ── signature verify, payment captured
         │     └── order-push ──> Clover Atomic Orders + print_event
         └── Customer status page reads our Order mirror
```
                                 │
                                 ▼
                   [ The shop's existing Clover account ]
                     money · order state · kitchen ticket

Pure serverless: near-$0/month idle cost, scales automatically with order volume. No servers to patch or size. **Clover remains the system of record for money, order state and fulfilment** (§8.7); our DynamoDB `Order` is a mirror kept for customer history, promo attribution and the confirmation page — not the authority.

### 2.5 Franchise Negotiation Leverage

Presenting a production-ready platform to a franchisor changes the conversation from "standard franchisee" to "strategic technology partner":

- **Development value:** $30,000–$50,000 of custom software delivered at zero upfront capital cost to the brand
- **Network-wide scalability:** multi-tenant capable, deployable across all existing and future locations
- **Proposed concessions to request:**
  - Waived or heavily discounted initial franchise fee
  - Reduced ongoing royalty (e.g., 2–3% vs. standard 5–6%)
  - Master SaaS licensing rights / revenue share if rolled out network-wide

This is a negotiating lever, not a build blocker — development proceeds as a generic boba/dessert ordering site regardless, and gets re-skinned/re-pointed at real menu data once the franchise conversation resolves.

## 3. Scope: MVP vs. Later

| Component | MVP | Later |
|---|---|---|
| Platform | Responsive mobile web / PWA | Native app |
| Auth | Clerk (phone/SMS) or guest checkout | Loyalty points, saved favorites |
| Payment | Stripe Checkout (card, Apple/Google Pay) | In-store POS hardware sync |
| Fulfillment | Single-location pickup | Multi-store, scheduled future orders |
| Staff view | Password-protected `/kitchen` board | Thermal ticket printer integration |

Off-the-shelf over custom everywhere possible: Clerk for auth, Stripe for payments/PCI, shadcn/ui for component primitives. Custom code is glue, not infrastructure.

## 4. Tech Stack

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Zustand (cart state)
- **Hosting:** **AWS Amplify Hosting** — CloudFront underneath, so the CDN, TLS and edge caching come with the deploy rather than being wired by hand. Resolved 2026-08-27; Vercel dropped (see §9)
- **Backend:** **AWS Amplify Gen 2** — schema-driven Data layer (`amplify/data/resource.ts`), auto-provisions DynamoDB + AppSync GraphQL API + typed client + real-time subscriptions. A custom Amplify Function (Lambda under the hood) handles the one piece Data can't: the Stripe webhook, which needs signature verification logic, not simple model CRUD.
- **Database:** Amazon DynamoDB — one table per model (`MenuItem`, `Order`), provisioned by Amplify, not a hand-crafted single table. See §6 Phase 3 for the schema.
- **Auth:** Clerk (phone/SMS sign-in) — decoupled from the backend choice; only needs to hand a `userId` to Amplify Data. (Cognito, bundled with Amplify, remains the single-vendor alternative if Clerk ever feels like an extra moving part — not needed today.)
- **Payments:** **Clover Hosted Checkout + Clover Orders API** on the shop's existing merchant account (§8.7). Stripe is no longer in the critical path; it stays on the shelf for recurring billing if a paid drink club ever happens
- **IaC:** Amplify Gen 2's own CDK-based deploy (`ampx sandbox` / `ampx pipeline-deploy`) — still fully AWS, still versioned as code, just generated from the schema instead of hand-written CDK constructs
- **Testing:** Playwright (E2E — cart math, modifier combinations, mocked Stripe flow) — natural fit given SDET background

> **Decision log:** Backend approach (Amplify Gen 2 vs. raw CDK+Lambda+DynamoDB) was an open question through early planning — resolved in favor of Amplify Gen 2. Reasoning: leverages an existing AWS system rather than hand-rolling wiring, declarative authorization rules mean AWS enforces access control instead of hand-written IAM policies (addresses not being confident hand-securing things yet), and the model-per-table shape is a closer mental match to prior Postgres/Mongo experience than manual DynamoDB single-table design would have been. Still real AWS underneath — Amplify Gen 2 has a CDK escape hatch if a custom resource is ever needed.

## 5. Current Status (what's actually built)

✅ **Phase 1 — Local UI shell (done):**

| File | Purpose |
|---|---|
| `src/types/boba.ts` | `ProductType`, `ModifierGroup`/`ModifierOption`, `MenuItem`, `CartItem`, `Order` |
| `src/config/menu.ts` | Real Snowdaes menu (6 categories, 24 items) + modifier groups, pricing, validation, summaries |
| `src/store/useCart.ts` | Zustand cart store (add/remove/updateQuantity, subtotal/tax/total) |
| `src/components/modifier-drawer.tsx` | Size/sugar/ice/toppings bottom sheet, qty stepper, live price |
| `src/components/cart-sheet.tsx` | Line items, qty controls, receipt-style totals |
| `src/components/cart-bar-button.tsx` | The persistent order control (fixed bottom on phones, brand rail on desktop) |
| `src/components/item-art.tsx` | Hand-built SVG stand-ins: cup, snow/ice mound, egg-puff bubble sheet |
| `src/components/item-visual.tsx` | Picks photo vs. illustration; one tinted tile for both |
| `src/config/item-art.ts` | Per-item colorways for the illustrations (presentational, deliberately not in `MenuItem`) |
| `src/config/shop.ts` | Shop facts: real addresses/phones, socials, about copy, **placeholder testimonials** |
| `src/components/promo-strip.tsx` | Seasonal/featured cards; each jumps to a category or the locations block |
| `src/components/testimonials.tsx` | Review cards — all quotes are fabricated placeholders |
| `src/components/site-footer.tsx` | Locations, phones, socials, about, legal |
| `src/components/social-icons.tsx` | Instagram/Facebook/TikTok marks (lucide v1 dropped brand icons) |
| `src/components/wordmark.tsx` | Penguin-as-the-"o" logo lockup, used in the hero and the footer |
| `src/hooks/use-media-query.ts` | Breakpoint hook behind the responsive item customiser |
| `src/app/page.tsx` | Brand masthead/rail, sticky category rail, menu list, sticky cart bar |
| `src/app/globals.css`, `src/app/layout.tsx` | Design tokens, three-role type system, light theme only (see §5.1) |

Verified: `tsc --noEmit` clean, `eslint` clean, `next build` clean, manual click-through in the browser across all six categories. Cart maths checked on a mixed three-product order: Hawaiian ice $5.50 + brown sugar milk tea (large, boba) $7.75 + Thai Dye $9.50 = $22.75 subtotal, $1.99 tax, $24.74 total. Max-selection enforcement confirmed (3-of-3 syrups disables the rest; add button stays disabled and names the group still needed).

### 5.1 Design system (settled — do not re-derive)

Skinned to the real shop: Snowdaes, Billerica MA, est. 2013, "Make every day a Snowdae".

- **Color** — warm white ground `#faf8f5`, white cards, warm near-black text `#1a1512`. Accent is **Snowdaes orange `#f5901e`**, sampled from the penguin mark, always with dark text on it (clears AA at ~8:1). A second token `--brand-ink: #b4530a` exists because the bright orange is illegible as small text on white — use `text-brand-ink` for accent *text*, `bg-primary` for accent *fills*. Never put white text on the bright orange.
- **Type — three roles, strictly enforced.** Fraunces (display) for the wordmark and item names; DM Sans for UI and body; Geist Mono for **every number** — prices, quantities, percentages, eyebrow labels — always with `tabular-nums`. This is what keeps a bright layout from reading like every other food-ordering site.
- **Imagery** — real cut-out photography from the legacy site for the six flagship items, hand-drawn SVG for everything else, both on the same tinted tile so a mixed list reads as one set. `MenuItem.imageFit` distinguishes cut-outs (`contain`) from full-frame shots (`cover`).
- **Layout — Starbucks menu formatting.** A centred product **grid** (2 columns on phones → 3 at `md` → 4 at `lg`, `max-w-6xl`) of white cards. Each card is a **circular** product tile with the POPULAR badge and the `+` control riding the circle rather than sitting in the text flow — that keeps every card on the same text rhythm regardless of badge or name length. Everything centre-aligned, hero included. A slim pickup/cart utility bar sits above a tall centred masthead that scrolls away; only the category rail is sticky. No desktop side rail (that was a dark-theme fix for dead space; on a white ground the space reads as breathing room).
- **Page composition** — the reference sites are *full*, so the page is built as five bands, not one: (1) slim pickup/cart utility bar, (2) full-bleed tinted hero with the wordmark centred and real cut-out product shots flanking it on `lg`+, plus two CTAs, (3) a three-card **seasonal/featured promo strip** whose cards deep-link into a category or the locations block, (4) the sticky category rail + product grid, (5) testimonials, then the footer. Categories were padded to 24 items so grid rows actually complete — half-empty rows were most of the perceived dead space.
- **Item customiser is responsive, and deliberately so.** Phones get a **bottom sheet** (vaul `Drawer`): it is the native iOS/Android pattern, it lands in the thumb zone, and PLAN §1 names Kung Fu Tea's bottom-sheet modifier flow as the benchmark. Desktop (`min-width: 768px`) gets a **centred modal** (`Dialog`) — *not* a right-side sheet, because the cart already owns the right edge and two different things sliding in from the same place with the same motion read as the same thing. One `useMediaQuery` hook picks the shell; the header, options and action row are shared JSX so the two variants cannot drift.
- **Wordmark lockup** (`src/components/wordmark.tsx`) — the penguin stands in for the **"o" in Snowdaes**, rising above the x-height so it reads as climbing out of the word. The "o" underneath is a real Fraunces glyph, not a drawn ring: a CSS circle cannot match a serif's modulated stroke, and a wrong "o" is more obvious than no trick at all. The mark is sized in `em` (`w-[1.05em]`) so the whole lockup scales from the 4rem phone hero to the 6.5rem desktop hero to the 2rem footer from one component. It needs `max-w-none` — Tailwind preflight's `img { max-width: 100% }` otherwise caps it to the width of the "o" — and the hero needs top padding, because the mark is absolutely positioned and escapes the line box into the section's `overflow-hidden`.
- **Type scale — deliberately large.** Wordmark 4rem → 6.5rem, tagline 1.5rem → 2rem, body 15–16px, item names 19–20px, option pills 15px, every interactive control ≥40px for tap targets. The first pass used a 13px-heavy scale and read cramped; do not shrink back to it.
- **Quality floor** — visible keyboard focus rings, `prefers-reduced-motion` respected, `env(safe-area-inset-bottom)` on the fixed cart bar, `aria-pressed` on every option pill, disabled options carry a real `disabled` attribute.
- **Theme — light only, and that is settled.** One `:root` block, `color-scheme: light`, warm white `#faf8f5`. There is no `.dark` block and no toggle. The `dark:` utilities inside `src/components/ui/` are unreachable shadcn defaults; they stay because `ui/` is **vendored**, not owned (see below).
- **`src/components/ui/` is vendored, not owned.** It is shadcn output, pulled and re-pulled through the shadcn MCP server, so any hand-edit there is lost on the next pull. Behaviour that must survive belongs at the call site or in `globals.css` keyed off the `data-slot` attributes shadcn emits — which is why overlay `overscroll-behavior` lives in `globals.css` rather than in `ui/drawer.tsx`. Don't "clean up" this directory.
- **Focus rings use `--brand-ink`, not `--primary`.** The bright orange measures 2.23:1 on the warm ground, under the 3:1 WCAG 1.4.11 floor for non-text contrast; `--brand-ink` clears it at 4.74:1. `--ring` is set to brand-ink for the same reason. Orange remains the *fill* colour — never the ring.

**Brand assets** in `public/` were pulled from snowdaes.com on 2026-08-26 and are placeholders standing in for licensed originals: `brand/snowdaes-mark.png` (penguin, 512px) and five product photos in `menu/`. Replace with shop-supplied assets before anything ships publicly.

## 6. Roadmap

### Phase 2 — Clover sandbox spike (**do this first — it de-risks everything else**)

Nothing downstream is worth building until an order created by code has been seen to print. Target: two days, throwaway script, no UI.

Harness is built and runnable: **[`scripts/spike/README.md`](./scripts/spike/README.md)** has the runbook, six numbered scripts each print what they proved, and `scripts/spike/findings.md` is where the answers go. All four endpoint paths verified reachable (they return 401, not 404, unauthenticated). Only the account setup needs a human.

- [x] Free global developer account; test merchant `4XKCZA8Z277R1` created
- [x] Merchant API token generated. Note: **a missing permission returns 401, not 403** — `01-connect.mjs` prints the full matrix rather than guessing
- [x] Ecommerce API token generated, integration type **Hosted Checkout**
- [x] Inventory readable through the API — the RSC scrape in `scripts/fetch-clover.mjs` has a supported replacement
- [x] `GET /v3/merchants/{mId}/tax_rates` works. **Rate unit is hundred-thousandths of a percent** — 6.25% is `625000`; `6250000` silently charges 62.5%
- [x] Atomic order created with real inventory + modifier IDs and an order-level discount — **then superseded**: Hosted Checkout makes the order for us, so we rewrite rather than create
- [~] `POST /v3/merchants/{mId}/print_event` — route and permission proven, but returns `400 "The default printing device is missing"`: **sandbox test merchants have no devices, so the ticket itself is unproven.** Closes only on the shop's own merchant
- [x] **Answered: yes, Hosted Checkout creates its own order** and attaches the payment. Not a hazard — it removes the push step entirely. A locked, PAID order still accepts line-item adds and deletes, and `total` stays pinned to the payment, so we rewrite its free-form lines into inventory-linked ones
- [x] Discount recorded as a real discount (`{"name":"SPIKE10","amount":-100}`), not a rewritten price. **Discounts apply before tax.** Still to confirm on a real merchant: that reporting shows the *rewritten* line items rather than Hosted Checkout's originals

### Phase 2b — Auth + checkout wiring
- [ ] Add Clerk: `<ClerkProvider>`, phone/SMS sign-in, guest-checkout fallback
- [ ] `POST /api/checkout` — recomputes the cart server-side from the synced catalog, then opens a Clover Hosted Checkout session
- [ ] `POST /api/webhooks/clover` — verify signature, then create the atomic order and fire `print_event`
- [ ] Order confirmation page (`/orders/[id]`) reading our mirror record
- [ ] Secrets per location (two merchant accounts, probably): `CLOVER_MERCHANT_ID_*`, `CLOVER_API_TOKEN_*`, `CLOVER_ECOMM_PRIVATE_KEY_*`. Only the Ecommerce **public** key may be `NEXT_PUBLIC_`

### Phase 3 — AWS Backend (move persistence off local/mock)
- [ ] `npm create amplify@latest` — scaffolds `amplify/` directory in this repo
- [ ] Define `amplify/data/resource.ts` schema (sketch below) — mirrors `src/types/boba.ts` closely, so the existing types aren't wasted work
- [ ] `npx ampx sandbox` for a live per-developer cloud backend while iterating locally (no manual deploy step needed during development)
- [ ] Add an Amplify Function for the Stripe webhook: verify signature, update `Order.status` via the generated data client
- [ ] Migrate `/api/checkout` (Stripe session creation) — this can stay a Next.js route handler; it only needs Stripe's SDK, not Amplify Data
- [ ] Order status lifecycle: `PENDING → PAID → PREPARING → READY → COMPLETED` (`CANCELLED` as an exception path)
- [ ] Deploy frontend to S3 + CloudFront (or confirm Vercel is fine for v1 and defer this — see §9)

**Amplify Data schema sketch** (`amplify/data/resource.ts`):

```ts
const schema = a.schema({
  // Mirror of Clover inventory, refreshed nightly by catalog-sync. Clover is the
  // source of truth; nothing here is edited by us. Keyed by the Clover item ID so
  // an order push can reference it directly.
  MenuItem: a.model({
    cloverItemId: a.string(),        // e.g. "28XHGQDK3TNHM" — the join key
    locationId: a.string(),          // 'billerica' | 'lowell' — two catalogs, §8.6
    categoryId: a.string(),
    productType: a.enum(['DRINK','SHAVED_SNOW','EGG_PUFF','SHAVED_ICE']),
    name: a.string(),
    description: a.string(),
    basePrice: a.float(),
    imageUrl: a.string(),
    imageFit: a.string(),            // "contain" | "cover"
    modifierGroups: a.json(),        // ModifierGroup[] — see §8
    isPopular: a.boolean(),
    isAvailable: a.boolean(),
  })
    .secondaryIndexes((index) => [index('categoryId')])
    .authorization((allow) => [allow.publicApiKey().to(['read']), allow.owner()]), // owner = staff/admin write access

  Order: a.model({
    customerUserId: a.string(),      // Clerk userId
    customerPhone: a.string(),
    customerName: a.string(),
    items: a.json(),                 // CartItem[] — modifiers are Record<groupId, optionId[]>
    subtotal: a.float(),
    tax: a.float(),
    tip: a.float(),
    total: a.float(),
    discountCode: a.string(),        // applied PromoCode.code, if any
    discount: a.float(),
    locationId: a.string(),
    // Clover owns order state and money. These are references, not authority.
    cloverOrderId: a.string(),
    cloverPaymentId: a.string(),
    printEventId: a.string(),        // proof the ticket fired
    status: a.enum(['PENDING','PAID','PUSHED','PUSH_FAILED']),  // OUR push pipeline only —
                                     // PREPARING/READY live in Clover, not here
  })
    .secondaryIndexes((index) => [
      index('status'),           // kitchen active queue: filter by status
      index('customerUserId'),   // user order history
    ])
    .authorization((allow) => [allow.owner()]),
    // NOTE: the browser can no longer create orders. A public API key that can
    // create orders can create garbage orders — and worse, unpaid ones that
    // print. Orders are created only by the clover-webhook Lambda, after a
    // payment is verified.

  Customer: a.model({
    phone: a.string(),
    email: a.string(),
    marketingConsent: a.boolean(),
    consentAt: a.datetime(),
    sourceCampaign: a.string(),
  }).authorization((allow) => [allow.owner()]),

  Campaign: a.model({
    name: a.string(),
    channel: a.string(),             // email | sms | qr | instagram
    startsAt: a.datetime(),
    endsAt: a.datetime(),
  }).authorization((allow) => [allow.owner()]),

  PromoCode: a.model({
    code: a.string(),
    campaignId: a.string(),
    kind: a.enum(['PERCENT','FIXED','FREE_ITEM']),
    value: a.float(),
    minSpend: a.float(),
    maxRedemptions: a.integer(),
    redemptionCount: a.integer(),    // guarded by a conditional write, not a read-then-write
    singleUsePerCustomer: a.boolean(),
    locationId: a.string(),          // a 10% code at Lowell is not a 10% code at Billerica
    expiresAt: a.datetime(),
  }).authorization((allow) => [allow.owner()]),

  Redemption: a.model({
    promoCodeId: a.string(),
    customerId: a.string(),
    orderId: a.string(),
    discountApplied: a.float(),
  }).authorization((allow) => [allow.owner()]),
});
```

This directly replaces the earlier hand-crafted single-table `PK`/`SK` design — Amplify provisions one table per model plus the secondary indexes declared above, and the generated client (`client.models.Order.observeQuery(...)`) is what the kitchen board subscribes to for real-time updates.

### Phase 4 — ~~Kitchen / Staff View~~ — **dropped 2026-08-27**

Clover's Orders app and the shop's existing printer *are* the kitchen display. Building a second screen for staff to watch during a rush is how orders get missed (§8.7). The shared-passcode idea is dropped with it — it would have been the weakest surface in the system.

Replaced by: nothing to build. The only staff-facing work left is confirming with the owner that auto-print is on and that the ticket lands where they expect (§14-B of `CLOVER-AND-LAUNCH.md`).

Reopen this only if the shop leaves Clover.

### Phase 5 — Testing & Hardening

✅ **UI hardening pass (done 2026-08-27)** — 13 findings from a Web Interface Guidelines audit against the live 393px render. Fixed: overlay scroll chaining (`overscroll-contain` on both sheets and their inner scrollers); focus rings moved off `--primary` (2.23:1) onto `--brand-ink` (5.02:1 measured, WCAG 1.4.11); footer `tel:` links raised from 19.5px to 44px; `touch-action: manipulation` on all controls; a close button on the mobile drawer to match Dialog/Sheet; cart and drawer steppers and social targets to 44px; `scroll-mt`/`scroll-mb` on menu cards so sticky chrome can't obscure focus (WCAG 2.4.11); `transition-all` → explicit properties; skip link to `#menu` (WCAG 2.4.1); `aria-describedby` on the disabled Checkout button; `Intl.NumberFormat` in `formatPrice`. Docs corrected — §5 and `frontend-dev.md` both claimed dark mode that does not exist.

Still open:
- [ ] Playwright E2E: add-to-cart → modifier combinations → cart math → mocked Stripe redirect
- [ ] Edge cases: $0 orders, out-of-stock items, price rounding, concurrent quantity updates
- [ ] Mobile viewport suite (iPhone/Pixel breakpoints) — this is the primary traffic shape
- [ ] Basic Lighthouse/perf pass before calling anything "launch-ready"

### Phase 6 — Real Content
- [ ] Real menu data (replace mock `src/config/menu.ts`) — pricing TBD depending on which shop this ends up serving
- [ ] Real drink/dessert photography (replace emoji placeholder tiles) — will need shaved snow and egg waffle item types added to the data model if Snowdaes is the eventual target (currently modeled for boba/milk tea only)
- [ ] Copy pass on brand voice/description text

## 7. Suggested Agent/Subagent Split

Once the phases above have enough shape to parallelize, split by concern rather than by phase — each area has a distinct context (infra vs. UI vs. payments) that doesn't benefit from sharing a single agent's attention:

| Agent focus | Owns | Key files |
|---|---|---|
| **Frontend** | UI components, cart UX, responsive/mobile polish | `src/app/`, `src/components/`, `src/store/` |
| **DB / Data** | Amplify Data schema, secondary indexes, authorization rules | `amplify/data/resource.ts`, `src/types/boba.ts` |
| **AWS Ops / Infra** | Amplify deploy pipeline, S3/CloudFront hosting, custom Amplify Functions | `amplify/` |
| **Payments/Auth** | Stripe + Clerk integration, webhook correctness | `src/app/api/checkout/`, `amplify/functions/stripe-webhook/` |
| **QA/Testing (SDET)** | Playwright suites, edge-case coverage | `tests/`, `playwright.config.ts` |

This file is the shared reference all of them should read first and update on completion, so state doesn't drift between agent contexts.

## 8. Data Model — Multi-Product Support (RESOLVED 2026-08-26)

Snowdaes sells four structurally different things, and they do **not** share a modifier shape:

| Product type | Categories | Modifier shape |
|---|---|---|
| `DRINK` | Milk Teas, Specialty Drinks | size, sugar %, ice level, toppings |
| `SHAVED_SNOW` | Shaved Snow | size, up to 4 toppings, one drizzle — no ice, no sugar % |
| `EGG_PUFF` | Egg Puffs | add-ons only |
| `SHAVED_ICE` | Asian Ice, Hawaiian Ice | Asian = pick 6 toppings; Hawaiian = pick up to 3 syrups |

**Implemented as data, not as a union.** The earlier recommendation here was a discriminated union with one modifier schema per product type. That was rejected on contact with the real menu: six categories with four shapes would mean four branches in the drawer, the cart, the pricing function and the summary formatter, and a fifth product would mean touching all of them again.

Instead, `MenuItem.modifierGroups: ModifierGroup[]` carries `kind` (single/multi), `min`, `max`, `defaults` and priced options, and `SelectedModifiers` is `Record<groupId, optionId[]>`. `productType` survives as a discriminant, but only for *presentation* — which illustration to draw. One drawer renders every product; adding a product is a row of menu data.

This is what real ordering systems (Toast, Square) do, and it maps straight onto the `a.json()` field in the §6 schema with no shape change. It also buys real behaviour the old fixed struct could not express: "pick up to 3 syrups" genuinely disables the other five at 3, and the add button stays disabled and names the group still needed.

Helpers live in `src/config/menu.ts`: `defaultSelection`, `calculateCartItemPrice`, `unmetGroups` (validation), `describeModifiers` (cart summary line).

**Still open:** every price in `src/config/menu.ts` is a placeholder — the legacy site publishes no pricing. Item *names and descriptions* for the six flagship items are the shop’s real copy; the rest are written stand-ins. Both get replaced in Phase 6.

## 8.6 Multi-Location — two menus, not one (RESOLVED 2026-08-27)

Lowell and Billerica each run their own Clover catalog, and they are **not the same menu**. Measured by extracting both catalogs:

| | Billerica | Lowell |
|---|---|---|
| Categories | 12 | 14 (extra: Drizzles, MISC ITEMS) |
| Items | 119 | 124 |
| Modifier groups / options | 85 / 1,064 | 82 / 946 |
| Hours | 12:00–7:30 PM | 12:00–9/10 PM |

- **93 of the 104 shared items are priced differently.** Lowell averages **20.7% cheaper** and is never dearer. Brown Sugar Milk Tea $7.25 → $5.75; toppings diverge up to 75% (Jackfruit $2.00 → $0.50).
- 14 items are Billerica-only, 20 are Lowell-only.
- Only **43 of 104** shared items have matching modifier group names.

**Therefore location is a prerequisite, not a checkout field.** There is no correct menu to render before it is known, which rules out browse-then-pick-at-checkout.

**Decided:**

- **Two independent catalogs**, one per location — not one menu with per-location price overrides. Overrides would apply to ~90% of everything, which is two menus with extra indirection.
- **Location in the URL** (`/billerica`, `/lowell`) so it is shareable, linkable and separately indexable. `/` resolves to the chooser or the remembered store.
- **Follow the Kung Fu Tea skeleton** (PLAN §1): the ordering flow is gated on location — their root redirects to `/locations` and no menu is reachable before a store is picked. Take the gate, remembering the choice, and open/closed status on the chooser. **Drop the map and the city/ZIP search** — those solve a 316-store search problem; this is a two-card decision, and it is where the storefront photos in `public/menu/items/` belong.
- **Geolocation is offered, not fired.** No permission prompt on first paint; a "Use my location" affordance inside the chooser. The two shops are ~6 miles apart, so "nearest" is often the wrong guess anyway — people order near work, or on a route.
- **The cart belongs to a location, and each location keeps its own.** Switching stores is not a re-price; it is a different order. This deliberately removes all cart-migration logic.

**Why cart-per-location rather than migrating a cart:** a switch is not a re-price. Of 4,387 option selections on shared items, only 75% exist at the other store under the same group name (91% if matched by option name across groups — 16% rescued, with only 10 of 3,977 loose matches ambiguous). Some losses are real rather than naming artifacts: Lowell's Thai Dye genuinely has no Rainbow Mochi. A worked basket — Brown Sugar Milk Tea + boba, Thai Dye + mochi, Ube Bae — moves $18.75 → $16.00 while silently dropping one line and one topping. Three kinds of surprise in one tap, made worse because the total *falls*, so nobody inspects it. Keeping a cart per location makes the whole problem disappear. If copying a basket across ever proves worth it, add it as an explicit action — the loose-matching numbers above are what it would be built on.

## 8.5 AWS Access

- **IAM user:** `boba-shop-deploy` (account `003655672994`), policy `AdministratorAccess-Amplify` (AWS-managed, scoped to Amplify-related services — not full account admin). Deliberately separate from the pre-existing `docker-user`/`Admin` (full `AdministratorAccess`) credential on this machine, which belongs to an unrelated project and should not be used here.
- **CLI profile name:** `boba-shop` (in `~/.aws/credentials`, not project-local). Use `--profile boba-shop` or `export AWS_PROFILE=boba-shop` for any AWS/Amplify command in this repo.
- **Never redirect credential-generating AWS CLI output to a file inside this repo** (e.g. `aws iam create-access-key ... > .aws`) — this happened once already, caught before it was committed. `.gitignore` now has a belt-and-suspenders pattern for it, but the real fix is: don't do it in the first place. Access keys go straight into `~/.aws/credentials` via `aws configure --profile <name>` or `aws configure set`, never through a file that lives under the repo root.

## 8.7 Clover Integration — Option B (RESOLVED 2026-08-27)

**Decided: we own the storefront, Clover owns the money and the kitchen.** Full analysis in [`CLOVER-AND-LAUNCH.md`](./CLOVER-AND-LAUNCH.md); this is the record of what was chosen and what it costs us.

The site does browse, cart, modifiers, accounts, promo codes and campaigns. At checkout, the card is charged on **the shop's existing Clover merchant account** via Clover Hosted Checkout, and the order is then written into Clover with the **real inventory IDs we already hold**, so the ticket prints on the same printer as today.

**Why, in one line each:**

- **The staff workflow does not change.** Orders arrive where they already arrive. A second screen during a rush is how orders get missed — that is why Phase 4 is dropped.
- **One money rail.** One settlement batch, one deposit, one sales-tax number, refunds where staff already do them. Stripe would have meant two of each, permanently.
- **Stripe was not actually cheaper.** Clover card-not-present is 3.5% + $0.10 against Stripe's 2.9% + $0.30; the lower percentage does not repay the higher fixed fee until a **$33.33** ticket. Average item is $5.83 (Billerica) and $4.87 (Lowell). §2.2 previously claimed the opposite and has been corrected.
- **We keep the whole prize anyway.** Owning the cart, the customer list and the promo engine never depended on owning the processing. Reaffirmed 2026-08-28 after the spike: **the marketing engine and the storefront customisation are the point of the project.** The shop already has working online ordering, so nothing here makes order delivery better — what it buys is the cart, the customer list and discount codes, which Clover Online Ordering does not have at all. If that engine were ever judged not worth building, Option A (a menu site linking to `cloveronline.com`) becomes the correct answer instead. Clover Online Ordering has **no discount codes at all** — that gap is the differentiator, and it survives regardless of who charges the card.

**What it costs us:** a dependency on Clover credentials we do not control, and a menu we mirror rather than own.

### Access path — no App Market listing required

The earlier worry that this needed a published, Clover-approved app was **wrong, and the correction is load-bearing**: it turns the biggest schedule risk into a form the owner fills in.

| Credential | Where the owner gets it | Used for |
|---|---|---|
| **Merchant API token** | Merchant Dashboard → Settings → Business Operations → API tokens, permissions scoped per endpoint | Inventory read, atomic order create, `print_event` |
| **Ecommerce API token** | Merchant Dashboard → Settings → Ecommerce → Ecommerce API Tokens, integration type *Hosted Checkout* | Charging the card |

Clover's own OAuth FAQ: *"For single merchant integrations… you can use a merchant-generated token which allows you to access Clover APIs for that specific merchant without initiating the full OAuth flow."* Both tokens are self-serve from the owner's dashboard, behind 2FA. No developer app, no OAuth, no approval queue.

Two caveats, neither blocking:
- One Clover docs page frames merchant tokens as a **sandbox** convenience while the OAuth FAQ describes them as fine in production for exactly this case. **Confirm in writing with Clover developer relations before Phase 2b** — one email, not a six-week unknown.
- **Only one Ecommerce API token exists per merchant account.** If the shop already uses it for something, we share or replace it. Ask before generating.
- A *private app* was the assumed fallback and is not free either: Clover's docs are explicit that private apps still require approval before distribution. Merchant tokens avoid that entirely; keep private apps as the multi-location fallback only.

### Consequences already applied to this file

| Change | Where |
|---|---|
| Fee claim corrected — Clover is cheaper than Stripe at this ticket size | §2.2 |
| Clover added as the system of record; our `Order` demoted to a mirror | §2.4 |
| Payments → Clover; hosting resolved to Amplify Hosting | §4, §9 |
| Phase 2 replaced by a **sandbox spike**: prove a coded order prints, before building anything | §6 |
| Phase 4 `/kitchen` board **dropped**, shared passcode with it | §6 |
| `MenuItem` keyed by `cloverItemId`; `Order` gains Clover references; `Customer`/`Campaign`/`PromoCode`/`Redemption` added; `publicApiKey().to(['create'])` removed from `Order` | §6 schema |
| Tax becomes an API call (`/v3/merchants/{mId}/tax_rates`) rather than a question | §9 |

### Design rules this locks in

1. **The server is the pricing authority; Clover is the fulfilment authority.** The browser's total is display only — the server recomputes from the synced catalog before charging. Otherwise `curl` buys a Thai Dye for a penny.
2. **Push the discount into the Clover order, not just into our arithmetic.** If a promo is applied and Clover records full price, the shop's books disagree with the deposit every time a code is used.
3. **Never lose a paid order.** Persist before pushing; retry with backoff; alert on `PUSH_FAILED`. A payment with no ticket is the worst state this system can reach, which is why `printEventId` is stored as proof.
4. **Two locations, two merchant accounts, two sets of credentials.** Config is per-location, exactly like the catalogs in §8.6.

### Measured, not assumed — Phase 2 spike results (2026-08-27/28)

Run against sandbox merchant `4XKCZA8Z277R1`, seeded from the real Billerica catalog. Full detail in [`scripts/spike/findings.md`](./scripts/spike/findings.md).

**The design got simpler than what is written above.** Hosted Checkout creates the order *and* attaches the payment itself. We do not push an atomic order and never needed to:

1. Server prices the cart (authority) and opens a Hosted Checkout session for the tax-inclusive total.
2. Customer pays. **Clover creates the order and the payment**, already linked, already in the merchant's order list.
3. On the webhook, **rewrite that order's line items** into inventory-linked ones with real modifiers — a locked, PAID order accepts adds and deletes, and its `total` stays pinned to the payment throughout.
4. Fire `print_event`.

One order, one payment, one ticket, entirely inside the shop's existing account. Nothing about the staff's day changes.

This also dissolves a mismatch found earlier the same day: Hosted Checkout does **not** apply the merchant tax rates (it charges exactly what it is handed) while atomic orders **do**. Creating a second order meant two totals that had to agree on every order. Rewriting one order means there is only ever one total, and it is the one that was charged.

**Four measurements that change the code:**

| Finding | Consequence |
|---|---|
| Tax rate unit is **hundred-thousandths of a percent** — 6.25% is `625000` | Setting `6250000` silently charges **62.5%**. Nothing errors. A $5.83 order became $9.27 and only a total-vs-expected check caught it |
| **Discounts apply before tax** — `(6.45−1.00)×1.07` | The promo engine must match this ordering or every discounted order reconciles cents out |
| `order.taxAmount` reads **0 even when tax was charged** | Reconcile against `total`, never `taxAmount` |
| A missing permission returns **401, not 403** | 401 is not "bad token". `403` means something else entirely: `expand=` values are permission-checked individually, and one unpermitted name fails the whole call — so `catalog-sync` should prefer separate calls to a wide expand |

**Credentials, confirmed self-serve.** Both come from the merchant's own dashboard behind 2FA, with no developer app and no approval: the platform API token (Settings → Business Operations → API tokens) does inventory, orders and printing; the Ecommerce API token (Settings → Ecommerce → Ecommerce API Tokens, type *Hosted Checkout*) does charging. Neither can do the other's job. Scope the production token to Inventory read, Orders read+write, Payments read, Merchant read and print write — a token that can create orders *and* print is the one credential capable of putting fake tickets in a live kitchen.

**Hosted Checkout defaults, observed:** tips off unless requested, reCAPTCHA present without asking, branding limited to the merchant name on a coloured bar, postal code required on the card form, sessions expire in ~30 minutes. If owning the funnel visually matters more than it does today, that is the argument for the tokenising iframe rather than Hosted Checkout.

### The one thing the sandbox cannot answer

**Does the rewritten order actually print?** `POST /print_event` returns `400 "The default printing device is missing"` on a sandbox test merchant, because test merchants have no devices. The route and the permission are proven — it is a business-logic error, not an auth error — but the ticket itself is not.

That, plus whether the shop's reporting shows the rewritten line items rather than Hosted Checkout's originals, closes only against the shop's own merchant with the owner present. It is question B in [`CLOVER-AND-LAUNCH.md`](./CLOVER-AND-LAUNCH.md) §14, and it is the last real risk in Option B.

## 9. Open Decisions (resolve before Phase 2/3)

- [x] ~~Backend approach: raw CDK+Lambda+DynamoDB vs. Amplify Gen 2~~ — **resolved: Amplify Gen 2**. See decision log in §4.
- [x] ~~Frontend hosting: S3+CloudFront vs. Vercel~~ — **resolved 2026-08-27: AWS Amplify Hosting.** It *is* CloudFront, so the CDN question answers itself; it matches the Amplify Gen 2 backend already chosen, and keeps one AWS account for the franchise-handover story.
- [x] ~~Stripe account~~ — **moot 2026-08-27.** Payments run on the shop's existing Clover merchant account (§8.7); we never hold a merchant account of our own. Revisit only for a recurring drink club.
- [ ] Clerk vs. rolling a lighter phone-OTP flow ourselves — Clerk is faster to ship, adds a vendor dependency
- [ ] Tax handling: the invented 8.75% flat rate stands until Phase 2 reads the real rates from `GET /v3/merchants/{mId}/tax_rates`. Every item at both stores carries exactly two `taxIds` (119/119 and 124/124), so this is an API call, not a question for the owner — but still worth confirming with them that both rates apply to every item.
- [ ] Domain name / branding — placeholder "Boba Shop" name throughout `src/` until this is settled
- [x] ~~Confirm target shop~~ — **Snowdaes.** UI, brand, copy, categories and assets are all Snowdaes now; the §8 model expansion is done. Gathered from snowdaes.com 2026-08-26: six categories (Milk Teas, Shaved Snow, Egg Puffs, Specialty Drinks, Asian Ice, Hawaiian Ice), two locations (Lowell original, Billerica new), est. 2013, tagline "Make every day a Snowdae". Their current site has **no menu and no online ordering at all** — a homepage, an about page, socials, and a Google Form. That absence is the concrete gap this project closes and the sharpest line in the §2.5 pitch.
- [x] ~~**Real menu pricing** — the shop publishes none~~ — **source found 2026-08-27.** Both shops run Clover online ordering (`snowdaes-north-billerica.cloveronline.com`, `snowdaes-lowell.cloveronline.com`) and publish the full priced catalog, embedded in the page as an RSC payload. Extraction is prototyped. The prices in `src/config/menu.ts` are **still invented** — importing them is the Phase 6 menu rebuild, and it is much larger than a price list: 119/124 items against 24 coded, 85/82 modifier groups against 11. See the rebuild plan for the modelling decision it hinges on.
- [ ] **Asset licensing** — product photos and the penguin mark in `public/` were pulled from the shop’s own site as placeholders. Get shop-supplied originals (or written sign-off) before public launch.
- [ ] **Testimonials are fabricated** — the three reviews in `src/config/shop.ts` are invented placeholders written for layout, attributed to people who do not exist. Replace with genuine, permissioned reviews or delete the section before this is shown to the franchisor or the public. They are flagged in the file with a block comment.
- [x] ~~**Opening hours** — the shop publishes none~~ — **published on Clover, found 2026-08-27.** Billerica 12:00–7:30 PM; Lowell 12:00–9:00 PM Mon–Thu and Sun, 12:00–10:00 PM Fri–Sat. Still omitted from the UI until someone confirms they are current — but they no longer have to be invented, and the §8.6 chooser needs them to show open/closed. Note the two differ, so hours are per-location.
- [ ] **Photography licensing** — `public/menu/items/` and `assets/menu-source/` hold 44 product photos captured from the shop's own Clover CDN (commit `111679c`), plus storefront banners. Downloaded rather than hot-linked deliberately. Still needs shop confirmation that they own them and are happy for them to be used here.
