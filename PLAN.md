# Boba Shop — Ordering Website: Project Plan

> **Read this first, every time.** This file is the single source of truth for the project — vision, decisions made, current build status, and what's next. Update it whenever a phase completes or a decision changes. If you are an agent picking up work here, read all of §0–§4 before touching code; they explain *why* the code looks the way it does, not just *what* to build next.

## 0. TL;DR (for quick context loading)

Building a mobile-first ordering **website** (not a native app) for a boba/dessert shop. Look and feel copies **The Alley** (dark, editorial, premium); ordering flow copies **Kung Fu Tea** (fast category nav, bottom-sheet modifiers, sticky cart). Stack is 100% TypeScript: Next.js frontend, AWS serverless backend (Lambda/DynamoDB/API Gateway via CDK), Stripe for payment, Clerk for auth — all off-the-shelf, minimal custom infra code. Business context: this doubles as a pitch asset for a Snowdaes franchise negotiation (see §3), but the repo itself is generic and works for any boba/dessert shop.

**Built so far (local only, no cloud yet):** full menu-browse → customize → cart flow, dark theme, verified working. See §5 for exact file list.

**Not built yet:** everything cloud (auth, payments, database, kitchen view). See §6 for the phased plan.

## 1. Reference Benchmarks

Two real sites define the target experience — one for look, one for flow. Don't blend them into a third thing; keep the split explicit when making UI decisions.

| Site | Role | What to copy |
|---|---|---|
| **[The Alley](https://www.the-alley.us/)** | Visual & aesthetic benchmark | Editorial, high-contrast dark/moody palette; minimalist layout; elegant typography; premium product presentation |
| **[Kung Fu Tea ordering flow](https://kft.orderexperience.net/)** | UX & ordering-flow benchmark | Fast location/pickup header; sticky category navigation; bottom-sheet modifier customization (Size, Sugar, Ice, Toppings); instant sticky checkout cart |

In short: **Alley's skin, Kung Fu Tea's skeleton.**

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
| `src/types/boba.ts` | `MenuItem`, `CartItem`, `Order`, modifier types |
| `src/config/menu.ts` | Mock menu (4 categories, 7 drinks) + `calculateCartItemPrice` |
| `src/store/useCart.ts` | Zustand cart store (add/remove/updateQuantity, subtotal/tax/total) |
| `src/components/modifier-drawer.tsx` | Size/sugar/ice/toppings bottom sheet, live price |
| `src/components/cart-sheet.tsx` | Line items, qty controls, totals |
| `src/app/page.tsx` | Top bar, category tabs, drink grid, sticky cart bar |
| `src/app/globals.css`, `src/app/layout.tsx` | Dark boba-brand theme, default dark mode |

Verified: `tsc --noEmit` clean, `eslint` clean, dev server boots, manual click-through confirmed working (tabs switch, drawer opens/prices update live, add-to-cart, cart sheet totals correct).

**Not built yet:** everything cloud — no AWS, no Stripe, no Clerk. No real drink photos (emoji placeholder tile in place of `imageUrl` renders).

Repo: `https://github.com/aslanSDET/boba-shop` (public). `main` is the pushed baseline; work-in-progress plan updates happen on feature branches (e.g. `initialsetup`) until merged.

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
    name: a.string(),
    description: a.string(),
    basePrice: a.float(),
    imageUrl: a.string(),
    availableSizes: a.json(),        // Partial<Record<DrinkSize, number>>
    availableIceLevels: a.json(),    // IceLevel[]
    availableSugarLevels: a.json(),  // SugarLevel[]
    availableToppings: a.json(),     // Topping[]
    isPopular: a.boolean(),
    isAvailable: a.boolean(),
  })
    .secondaryIndexes((index) => [index('categoryId')])
    .authorization((allow) => [allow.publicApiKey().to(['read']), allow.owner()]), // owner = staff/admin write access

  Order: a.model({
    customerUserId: a.string(),      // Clerk userId
    customerPhone: a.string(),
    customerName: a.string(),
    items: a.json(),                 // CartItem[]
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

## 8. Data Model Gap Check (Snowdaes-specific)

Current `src/types/boba.ts` / `src/config/menu.ts` model **only boba/milk tea** (size, sugar %, ice level, toppings). If this ends up serving Snowdaes specifically, two more product types need modeling before Phase 6:

- **Shaved snow / Bingsu-style:** base flavor (mango, taro, green tea, Thai tea), toppings/jellies/fruit, drizzle — likely a different modifier shape than boba (no ice level, no sugar %; instead a flavor-base select + topping multi-select + drizzle select)
- **Puffles / egg waffles:** cone flavor, ice cream flavor, fruit/topping add-ons

Recommendation: don't force these into the existing `SelectedModifiers` shape — model them as a discriminated union (`ProductType: "DRINK" | "SHAVED_SNOW" | "WAFFLE"`) with type-specific modifier schemas, so the cart/pricing logic stays type-safe rather than accumulating optional fields that only apply to some items.

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
- [ ] **Confirm target shop:** if Snowdaes is confirmed, trigger the §8 data-model expansion (shaved snow + waffles) before writing real menu data in Phase 6; if it stays a generic boba shop, skip §8 entirely
