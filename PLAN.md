# Boba Shop — Ordering Website: Project Plan

> **Read this first, every time.** This file is the single source of truth for the project — vision, decisions made, current build status, and what's next. Update it whenever a phase completes or a decision changes. If you are an agent picking up work here, read all of §0–§4 before touching code; they explain *why* the code looks the way it does, not just *what* to build next.

## 0. TL;DR (for quick context loading)

Building a mobile-first ordering **website** (not a native app) for **Snowdaes** (Billerica/Lowell MA). Look and feel takes brightness from **Starbucks** and typography from **The Alley**; ordering flow copies **Kung Fu Tea** (fast category nav, bottom-sheet modifiers, sticky cart). Stack is 100% TypeScript: Next.js frontend, AWS serverless backend (Lambda/DynamoDB/API Gateway via CDK), Stripe for payment, Clerk for auth — all off-the-shelf, minimal custom infra code. Business context: this doubles as a pitch asset for a Snowdaes franchise negotiation (see §3), but the repo itself is generic and works for any boba/dessert shop.

**Built so far (local only, no cloud yet):** full menu-browse → customize → cart flow over the shop’s six real categories and four product types, on a bright Snowdaes-skinned UI with real product photography. See §5 for the file list, §5.1 for the design system, §8 for the modifier model.

**Not built yet:** everything cloud (auth, payments, database, kitchen view). See §6 for the phased plan.

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
| High third-party fees: DoorDash/Uber Eats take 15–30% per order | Direct Stripe processing: standard card fees ($0.30 + 2.9%) |
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
         ├── Amplify Function (Lambda) ── Stripe webhook verification + order status update
         ├── Stripe API (PCI-compliant payment processing)
         └── Real-time subscription ──> Kitchen Display Board (/kitchen) — no polling loop
```

Pure serverless: near-$0/month idle cost, scales automatically with order volume. No servers to patch or size. The only hand-written backend logic is the Stripe webhook function — everything else (menu CRUD, order CRUD, kitchen queue queries) comes from the schema.

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
- **Hosting:** AWS S3 + CloudFront (static/edge) — or Vercel if we want zero-ops for the frontend specifically (open decision, §9)
- **Backend:** **AWS Amplify Gen 2** — schema-driven Data layer (`amplify/data/resource.ts`), auto-provisions DynamoDB + AppSync GraphQL API + typed client + real-time subscriptions. A custom Amplify Function (Lambda under the hood) handles the one piece Data can't: the Stripe webhook, which needs signature verification logic, not simple model CRUD.
- **Database:** Amazon DynamoDB — one table per model (`MenuItem`, `Order`), provisioned by Amplify, not a hand-crafted single table. See §6 Phase 3 for the schema.
- **Auth:** Clerk (phone/SMS sign-in) — decoupled from the backend choice; only needs to hand a `userId` to Amplify Data. (Cognito, bundled with Amplify, remains the single-vendor alternative if Clerk ever feels like an extra moving part — not needed today.)
- **Payments:** Stripe Checkout + webhooks
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
| `src/app/globals.css`, `src/app/layout.tsx` | Design tokens, three-role type system, default dark mode |

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

**Brand assets** in `public/` were pulled from snowdaes.com on 2026-08-26 and are placeholders standing in for licensed originals: `brand/snowdaes-mark.png` (penguin, 512px) and five product photos in `menu/`. Replace with shop-supplied assets before anything ships publicly.

## 6. Roadmap

### Phase 2 — Auth + Payments (off-the-shelf integration)
- [ ] Add Clerk: `<ClerkProvider>`, phone/SMS sign-in, guest-checkout fallback
- [ ] `POST /api/checkout` (Next.js route handler, local-only for now) that builds a Stripe Checkout Session from cart line items
- [ ] Redirect to Stripe Checkout (test mode keys)
- [ ] `POST /api/webhooks/stripe` handler for `checkout.session.completed`
- [ ] Order confirmation page (`/orders/[id]`) showing a receipt from session data
- [ ] `.env.local` for `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CLERK_*` — never commit real keys (already gitignored)

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
  MenuItem: a.model({
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
    status: a.enum(['PENDING','PAID','PREPARING','READY','COMPLETED','CANCELLED']),
    stripePaymentIntentId: a.string(),
  })
    .secondaryIndexes((index) => [
      index('status'),           // kitchen active queue: filter by status
      index('customerUserId'),   // user order history
    ])
    .authorization((allow) => [allow.owner(), allow.publicApiKey().to(['create'])]),
});
```

This directly replaces the earlier hand-crafted single-table `PK`/`SK` design — Amplify provisions one table per model plus the secondary indexes declared above, and the generated client (`client.models.Order.observeQuery(...)`) is what the kitchen board subscribes to for real-time updates.

### Phase 4 — Kitchen / Staff View
- [ ] Password-protected `/kitchen` route (Clerk role check or a simple shared passcode for MVP)
- [ ] Poll or subscribe to `STORE#MAIN` active-queue items
- [ ] Tap-to-advance status: `PAID → PREPARING → READY → COMPLETED`

### Phase 5 — Testing & Hardening
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

## 8.5 AWS Access

- **IAM user:** `boba-shop-deploy` (account `003655672994`), policy `AdministratorAccess-Amplify` (AWS-managed, scoped to Amplify-related services — not full account admin). Deliberately separate from the pre-existing `docker-user`/`Admin` (full `AdministratorAccess`) credential on this machine, which belongs to an unrelated project and should not be used here.
- **CLI profile name:** `boba-shop` (in `~/.aws/credentials`, not project-local). Use `--profile boba-shop` or `export AWS_PROFILE=boba-shop` for any AWS/Amplify command in this repo.
- **Never redirect credential-generating AWS CLI output to a file inside this repo** (e.g. `aws iam create-access-key ... > .aws`) — this happened once already, caught before it was committed. `.gitignore` now has a belt-and-suspenders pattern for it, but the real fix is: don't do it in the first place. Access keys go straight into `~/.aws/credentials` via `aws configure --profile <name>` or `aws configure set`, never through a file that lives under the repo root.

## 9. Open Decisions (resolve before Phase 2/3)

- [x] ~~Backend approach: raw CDK+Lambda+DynamoDB vs. Amplify Gen 2~~ — **resolved: Amplify Gen 2**. See decision log in §4.
- [ ] Frontend hosting: S3+CloudFront (matches the AWS-native plan) vs. Vercel (zero-ops, faster to ship) — pick one before wiring CI/CD
- [ ] Stripe account: personal test account now, migrate to business account when a real shop is attached
- [ ] Clerk vs. rolling a lighter phone-OTP flow ourselves — Clerk is faster to ship, adds a vendor dependency
- [ ] Tax handling: flat rate (current mock uses 8.75%) vs. Stripe Tax — revisit once a real store address/jurisdiction is known
- [ ] Domain name / branding — placeholder "Boba Shop" name throughout `src/` until this is settled
- [x] ~~Confirm target shop~~ — **Snowdaes.** UI, brand, copy, categories and assets are all Snowdaes now; the §8 model expansion is done. Gathered from snowdaes.com 2026-08-26: six categories (Milk Teas, Shaved Snow, Egg Puffs, Specialty Drinks, Asian Ice, Hawaiian Ice), two locations (Lowell original, Billerica new), est. 2013, tagline "Make every day a Snowdae". Their current site has **no menu and no online ordering at all** — a homepage, an about page, socials, and a Google Form. That absence is the concrete gap this project closes and the sharpest line in the §2.5 pitch.
- [ ] **Real menu pricing** — every price in `src/config/menu.ts` is invented; the shop publishes none. Needs the actual price list before anything goes live.
- [ ] **Asset licensing** — product photos and the penguin mark in `public/` were pulled from the shop’s own site as placeholders. Get shop-supplied originals (or written sign-off) before public launch.
- [ ] **Testimonials are fabricated** — the three reviews in `src/config/shop.ts` are invented placeholders written for layout, attributed to people who do not exist. Replace with genuine, permissioned reviews or delete the section before this is shown to the franchisor or the public. They are flagged in the file with a block comment.
- [ ] **Opening hours** — deliberately omitted everywhere; the shop publishes none and inventing hours next to a real phone number is worse than showing nothing. Get real hours before launch.
