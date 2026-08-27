# Boba Shop — Ordering Website: Project Plan

Living plan for the project, distilled from the architecture discussion (Gemini) and the scaffold already built with Claude Code. Update this file as decisions get made — it's the single source of truth for "where are we and what's next."

## 1. Product Positioning

**Concept:** A mobile-first ordering website combining two references:

| Aesthetic (The Alley) | Ordering mechanics (Kung Fu Tea) |
|---|---|
| Dark/charcoal, editorial, high-contrast typography | Instant category-anchored menu navigation |
| Gold/cream accent, subtle glassmorphism | Bottom-drawer modifier selection (size/ice/sugar/toppings) |
| Full-bleed imagery, premium brand feel | Sticky bottom cart, one-tap checkout |

**Platform:** Responsive mobile web (PWA-installable later), not a native app. No App Store review, no binary releases — deploy and it works on every phone browser.

**Business context:** This project doubles as a proof-of-work for a Snowdaes franchise negotiation — offering a custom ordering stack (replacing their current Wix + DoorDash/Uber Eats setup) in exchange for franchise fee/royalty concessions. See [§7 Business Angle](#7-business-angle-snowdaes) for the pitch structure. Not a blocker for the build — this repo works as a standalone boba/dessert shop site regardless of which shop ends up running it.

## 2. Scope: MVP vs. Later

| Component | MVP | Later |
|---|---|---|
| Platform | Responsive mobile web / PWA | Native app |
| Auth | Clerk (phone/SMS) or guest checkout | Loyalty points, saved favorites |
| Payment | Stripe Checkout (card, Apple/Google Pay) | In-store POS hardware sync |
| Fulfillment | Single-location pickup | Multi-store, scheduled future orders |
| Staff view | Password-protected `/kitchen` board | Thermal ticket printer integration |

Off-the-shelf over custom everywhere possible: Clerk for auth, Stripe for payments/PCI, shadcn/ui for component primitives. Custom code is glue, not infrastructure.

## 3. Tech Stack

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Zustand (cart state)
- **Hosting:** AWS S3 + CloudFront (static/edge) — or Vercel if we want zero-ops for the frontend specifically
- **Backend:** AWS API Gateway + Lambda (Node/TypeScript)
- **Database:** Amazon DynamoDB, single-table design
- **Auth:** Clerk (phone/SMS sign-in)
- **Payments:** Stripe Checkout + webhooks
- **IaC:** AWS CDK (TypeScript) — so infra is versioned code, not console clicks
- **Testing:** Playwright (E2E — cart math, modifier combinations, mocked Stripe flow) — natural fit given SDET background

## 4. Current Status (as of this commit)

✅ **Phase 1 — Local UI shell (done):**
- Next.js + TS + Tailwind + shadcn/ui scaffolded, dark boba-brand theme applied
- `src/types/boba.ts` — MenuItem, CartItem, Order, modifier types
- `src/config/menu.ts` — mock menu (4 categories, 7 drinks) + `calculateCartItemPrice`
- `src/store/useCart.ts` — Zustand cart store (add/remove/updateQuantity, subtotal/tax/total)
- `src/components/modifier-drawer.tsx` — size/sugar/ice/toppings bottom sheet, live price
- `src/components/cart-sheet.tsx` — line items, qty controls, totals
- `src/app/page.tsx` — top bar, category tabs, drink grid, sticky cart bar
- Verified: `tsc --noEmit` clean, `eslint` clean, dev server boots, manual click-through confirmed working

Everything so far runs **entirely locally** — no AWS, no Stripe, no Clerk yet. No real drink photos (using an emoji placeholder tile — swap in `imageUrl` renders later).

## 5. Roadmap

### Phase 2 — Auth + Payments (off-the-shelf integration)
- [ ] Add Clerk: `<ClerkProvider>`, phone/SMS sign-in, guest-checkout fallback
- [ ] `POST /api/checkout` (Next.js route handler, local-only for now) that builds a Stripe Checkout Session from cart line items
- [ ] Redirect to Stripe Checkout (test mode keys)
- [ ] `POST /api/webhooks/stripe` handler for `checkout.session.completed`
- [ ] Order confirmation page (`/orders/[id]`) showing a receipt from session data
- [ ] `.env.local` for `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CLERK_*` — never commit real keys (already gitignored)

### Phase 3 — AWS Backend (move persistence off local/mock)
- [ ] `infrastructure/` CDK app (TypeScript): DynamoDB table (`PK`/`SK`, pay-per-request), Lambda(s), API Gateway HTTP API
- [ ] Single-table access patterns: menu catalog, order by ID, user order history, kitchen active queue (see table sketch below)
- [ ] Migrate `/api/checkout` and webhook logic from Next.js route handlers to Lambda behind API Gateway
- [ ] Order status lifecycle: `PENDING → PAID → PREPARING → READY → COMPLETED` (`CANCELLED` as an exception path)
- [ ] Deploy frontend to S3 + CloudFront (or confirm Vercel is fine for v1 and defer this)

**DynamoDB single-table sketch:**

| Access pattern | PK | SK | Notes |
|---|---|---|---|
| Menu catalog | `MENU#CATALOG` | `ITEM#<itemId>` | Full `MenuItem` JSON |
| Order lookup | `ORDER#<orderId>` | `METADATA` | Full `Order` object |
| User order history | `USER#<clerkUserId>` | `ORDER#<timestamp>` | Summary + orderId |
| Kitchen active queue | `STORE#MAIN` | `STATUS#<status>#<orderId>` | Simplified payload for `/kitchen` |

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
- [ ] Real drink photography (replace emoji placeholder tiles)
- [ ] Copy pass on brand voice/description text

## 6. Suggested Agent/Subagent Split

Once the phases above have enough shape to parallelize, split by concern rather than by phase — each area has a distinct context (infra vs. UI vs. payments) that doesn't benefit from sharing a single agent's attention:

| Agent focus | Owns | Key files |
|---|---|---|
| **Frontend** | UI components, cart UX, responsive/mobile polish | `src/app/`, `src/components/`, `src/store/` |
| **DB / Data** | DynamoDB schema, access patterns, data migrations | `infrastructure/lib/*-stack.ts`, `src/types/boba.ts` |
| **AWS Ops / Infra** | CDK stacks, deploy pipeline, CloudFront/S3, IAM | `infrastructure/` |
| **Payments/Auth** | Stripe + Clerk integration, webhook correctness | `src/app/api/checkout/`, `src/app/api/webhooks/` |
| **QA/Testing (SDET)** | Playwright suites, edge-case coverage | `tests/`, `playwright.config.ts` |

This file is the shared reference all of them should read first and update on completion, so state doesn't drift between agent contexts.

## 7. Business Angle: Snowdaes

Snowdaes' current stack is a Wix site that hands off web ordering to DoorDash Storefront/Uber Eats — meaning ~15–30% commission bleed on web orders and zero ownership of customer data (emails, phone numbers, order history all sit with the aggregator, not the brand).

**The pitch:** trade a custom ordering stack (this repo, generalized) for franchise concessions:
- Waived/discounted initial franchise fee (offset against the ~$30–50k value of a custom build)
- Reduced ongoing royalty rate in exchange for stack maintenance
- Master tech rights / licensing upside if the stack rolls out to other franchisees

This is a negotiating lever, not a blocker — the build proceeds as a generic boba/dessert ordering site either way, and gets re-skinned/re-pointed at real menu data once the franchise conversation resolves.

## 8. Open Decisions (resolve before Phase 2/3)

- [ ] Frontend hosting: S3+CloudFront (matches the AWS-native plan) vs. Vercel (zero-ops, faster to ship) — pick one before wiring CI/CD
- [ ] Stripe account: personal test account now, migrate to business account when a real shop is attached
- [ ] Clerk vs. rolling a lighter phone-OTP flow ourselves — Clerk is faster to ship, adds a vendor dependency
- [ ] Tax handling: flat rate (current mock uses 8.75%) vs. Stripe Tax — revisit once a real store address/jurisdiction is known
- [ ] Domain name / branding — placeholder "Boba Shop" name throughout `src/` until this is settled
