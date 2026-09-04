# boba-shop

Direct-ordering websites for small independent restaurants, so they stop paying predatory platforms a cut of every order and keep their own customers.

One repo, several restaurants, **one deployment each**. The directory name is
historical — this started as a boba shop and now serves more than one kind of
food.

| Restaurant | Where | POS | State |
|---|---|---|---|
| **Snowdaes** | Billerica & Lowell, MA | Clover | Full checkout against Clover's sandbox — menu, cart, discount codes, pickup time, tip, card entry, confirmation |
| **Asian Kitchen** | Center Point, Birmingham, AL | Square | Full checkout against Square's sandbox — menu, cart, card entry, confirmation. Pickup only |

Both are live on Amplify Hosting, one app each, each behind HTTP basic auth
(it's a sandbox, not a security boundary — see `FAQ.md`). **Neither has real
merchant credentials yet**; both process cards against the POS's own sandbox.

**New here, or coming back after a break? Read `FAQ.md` first** — recurring
questions answered once, plus every manual command for running the app and
checking a deployment without Claude Code.

---

## Running it

One restaurant per run. The `RESTAURANT` variable decides which:

```bash
npm install

RESTAURANT=snowdaes      npm run dev    # Snowdaes at localhost:3000
RESTAURANT=asian-kitchen npm run dev    # Asian Kitchen at localhost:3000
npm run dev                             # defaults to snowdaes
```

Both serve `/`. There is no URL where you can see them side by side, on purpose —
each will eventually be its own deployment, and running them that way now keeps
the code honest. An unrecognised value fails the build with a message naming the
valid ones.

```bash
npm run build     # production build
npm run lint      # eslint
npx tsc --noEmit  # typecheck
```

E2E is Playwright, and it is **two separate suites** — `RESTAURANT` is read
once at module load and the page is statically prerendered, so a build is one
restaurant, never both, and the two suites cannot share a server:

```bash
npm run test:e2e            # Asian Kitchen — playwright.config.ts, port 3210
npm run test:e2e:snowdaes   # Snowdaes — playwright.snowdaes.config.ts, port 3211
```

**One folder per domain, and the folder is the selector:**

```
tests/
  asian-kitchen/   checkout · contrast · header      → playwright.config.ts
  snowdaes/        checkout · journeys · promo-rail  → playwright.snowdaes.config.ts
  support/         helpers and the sandbox sweep — imported, never collected
```

Put a new spec in the folder for the restaurant it drives and it runs in the
right suite against the right server. This replaced a `testMatch: /snowdaes.*/`
filename rule, under which a Snowdaes spec named without the prefix would have
been collected by the Asian Kitchen suite and failed against the wrong shop.
Playwright only globs `*.spec.ts`, so `support/` is never picked up as tests.

Both suites drive real card iframes against their POS's real sandbox and create
real sandbox objects — cleaned up automatically by each run
(`tests/support/sweep-sandbox.ts` for Snowdaes), never anything with a payment
on it.

---

## Deployed

| Restaurant | URL | Basic auth |
|---|---|---|
| Snowdaes | https://main.d2j2i5n9o6zf7a.amplifyapp.com | `snowdaes` / see `FAQ.md` |
| Asian Kitchen | https://main.d28ppkfg682mtw.amplifyapp.com | `asiankitchen` / see `FAQ.md` |

AWS account `003655672994` (alias `aslansdet-bobashop`), Amplify Hosting, one
app per restaurant, both building from `main`. A merged PR deploys itself —
nothing further to run. **How to check a build's status, redeploy by hand, or
change the basic-auth password — all without Claude Code — is in `FAQ.md`.**

---

## What you need in `.env.local`

Gitignored, and it must stay that way — **this is a public repo**.

| Variable | For |
|---|---|
| `CLOVER_MERCHANT_ID` | Snowdaes' Clover merchant |
| `CLOVER_API_TOKEN` | Clover Platform API (`/v3`) — menu, orders, hours |
| `CLOVER_ECOMM_PRIVATE_KEY` | Clover Ecommerce — card tokenisation and charges |
| `CLOVER_ENV` | `sandbox` (the default) or `production` |
| `SQUARE_SANDBOX_ACCESS_TOKEN` | Asian Kitchen's Square sandbox — orders, payments |
| `SQUARE_SANDBOX_APPLICATION_ID` | Square's Web Payments SDK — card entry |
| `SQUARE_ENV` | `sandbox` (the default) or `production` |

**`CLOVER_ENV=sandbox` and `SQUARE_ENV=sandbox` are the defaults and should
stay that way.** Both clients refuse a non-GET request against production
outright (`guardProductionWrite` in `src/pos/clover/client.ts`; the Square
equivalent in `src/pos/square/client.ts`), because a write against the real
merchant creates an order in a working kitchen.

Deployed, neither restaurant reads these from an Amplify environment variable
— both read from **SSM Parameter Store at request time** instead
(`src/pos/clover/creds.ts`, `src/pos/square/creds.ts`; the FAQ explains why).

---

## Layout

Three directories. Every file has an owner.

```
src/
  app/            ROUTES ONLY — a Next requirement. See src/app/README.md
    page.tsx        picks the restaurant; contains nothing else
    checkout/       the order screen; renders one restaurant's, 404s otherwise
    order/[id]/     the confirmation; same shim pattern
    api/clover/     Clover endpoints; 404 on a non-Snowdaes deployment
    api/square/     Square endpoints; 404 on a non-Asian-Kitchen deployment
    layout.tsx      the one root layout Next permits — no fonts, no palette
    globals.css     Tailwind + resets. No restaurant's colours

  restaurants/
    active.ts       reads RESTAURANT, validates it
    snowdaes/       root, checkout, confirmation, components (incl. its own
                    shadcn ui), lib, menu, promos, theme.css
    asian-kitchen/  root, checkout, confirmation, components, menu, config,
                    theme.css

  pos/
    clover/         client, catalog, order, hours, idempotency
    square/         client, creds, order, request
```

**The two restaurants share nothing.** No import crosses between them; Asian
Kitchen imports nothing from outside its own folder. The only files both touch
are `layout.tsx` and `globals.css`, which Next requires and neither of which
carries a palette. Adding a third restaurant means adding a folder, not editing
the other two.

Routes cannot live beside their restaurant because Next derives URLs from the
folders inside `app/`. That is a framework constraint, not a choice —
`src/app/README.md` explains it.

---

## Where the thinking is written down

Read these before changing anything structural; they record *why*, and most of
it was measured rather than assumed.

| File | What it holds |
|---|---|
| [`FAQ.md`](FAQ.md) | Recurring questions, answered once — plus every manual command for running or deploying without Claude Code |
| [`PLATFORM.md`](PLATFORM.md) | How one repo serves several restaurants. One deploy each, duplicate-before-abstracting, why not every "platform" is a POS, and what changes at 40 restaurants instead of 2 |
| [`PLAN.md`](PLAN.md) | Snowdaes: product decisions, the two-location menu problem, the Clover integration |
| [`docs/ASIAN-KITCHEN.md`](docs/ASIAN-KITCHEN.md) | Asian Kitchen: their menu, their real combo structure, what to ask the owner |
| [`docs/ASIAN-KITCHEN-DESIGN.md`](docs/ASIAN-KITCHEN-DESIGN.md) | Their visual direction and why the flow is a menu rather than a plate builder |
| [`scripts/spike/findings.md`](scripts/spike/findings.md) | Clover's API as actually measured, including where the docs are wrong |
| [`scripts/spike/prior-art.md`](scripts/spike/prior-art.md) | Nine public Clover integrations, and the traps they hit |
| [`docs/OWNER-ASKS.md`](docs/OWNER-ASKS.md) | Open questions only a shop owner can answer |
| [`artifacts/`](artifacts/) | Published pages: the owner pitch, the Owner.com comparison, the Uber Eats architecture note |

---

## Scripts

```bash
node scripts/import-menu.mjs                     # regenerate both Snowdaes menus from Clover
node scripts/import-menu.mjs billerica           # or just one
node scripts/fetch-clover.mjs                    # raw Clover reads, for poking around
node scripts/asian-kitchen/fetch-photos.mjs      # download Asian Kitchen's menu photography
```

Asian Kitchen's photos land in `public/asian-kitchen/menu/`, which is
**gitignored on purpose**: they came from a third-party ordering listing and may
be subject to third-party copyright. Fine for a demo; clear them with the owner
or replace them before any complete deployment (`docs/ASIAN-KITCHEN.md` §4).

Re-running that script needs `PHOTO_CDN_BASE` in the environment — the CDN host
is deliberately not in this repo.

---

## Ground rules

- **Public repo.** No token, key or merchant id in a commit, a log line, or a script argument. Only the Ecommerce *public* key may ever be `NEXT_PUBLIC_`.
- **Sandbox by default.** A production write needs a human who knows the kitchen is watching.
- **The POS is the calculator.** Totals and tax come back from Clover or Square, never computed here; the numbers in the cart are a preview only. Two calculators disagree eventually, and the shop's own till has to be right.
- **Restaurants do not share code.** If two of them need the same thing, copy it. Extract only once a third case proves the shape (`PLATFORM.md` §3).
