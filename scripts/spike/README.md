# Clover sandbox spike

Phase 2 of `PLAN.md`. **Nothing downstream is worth building until an order created by code has been seen to print.** This is a throwaway harness that answers questions; the answers go in `findings.md`, and whatever survives gets rewritten properly as the `catalog-sync` / `order-push` Lambdas.

Target: one focused sitting. No UI, no AWS, no commitment.

---

## What each step proves

| Step | Command | Proves | Blocks |
|---|---|---|---|
| 01 | `node scripts/spike/01-connect.mjs` | The merchant API token works and has every permission we need | everything |
| 02 | `node scripts/spike/02-inventory.mjs` | The Inventory API replaces the RSC scrape, and gives us the **real tax rates** | the menu rebuild |
| 03 | `node scripts/spike/03-atomic-order.mjs` | A coded order lands in the merchant account with modifiers and a discount | the order push |
| 04 | `node scripts/spike/04-print.mjs` | That order fires a ticket on the merchant's own printer | the whole of Option B |
| 05 | `node scripts/spike/05-hosted-checkout.mjs` | We can charge a card, and captures the "before" state | checkout |
| 06 | `node scripts/spike/06-probe.mjs` | **Whether Hosted Checkout creates its own order** | the checkout design |

Steps 04 and 06 are the ones that matter. The rest is setup.

---

## Before you run anything

These steps need a human — account creation, 2FA and dashboard clicks can't be scripted.

**1. Sandbox developer account** — sign up at <https://sandbox.dev.clover.com/> (free, no Clover hardware or merchant relationship needed). Create a **test merchant**, and add a few inventory items with modifier groups if the test merchant starts empty; step 03 needs at least one priced item, ideally one with modifiers.

**2. Merchant API token** — in the test merchant's dashboard: **Settings → View all settings → Business Operations → API tokens**. Two-factor auth has to be switched on first. Create a token with at least:

- Inventory — **read**
- Orders — **read + write**
- Merchant — read
- Payments — read
- Customers — read *(only if testing customer attachment)*
- Process/print — **write** *(the permission behind `print_event`)*

Step 01 probes each of these and names whichever is missing, so don't agonise — issue it, run 01, adjust.

**3. Ecommerce API token** — **Settings → View all settings → Ecommerce → Ecommerce API Tokens**, integration type **Hosted Checkout**. This yields a private key plus the merchant ID.

> ⚠ **Only one Ecommerce API token exists per merchant account.** Harmless in the sandbox. On the shop's real account, ask before generating — regenerating could break an integration they already rely on. This is question A-8 in `CLOVER-AND-LAUNCH.md`.

**4. Put them in `.env.local`** in the repo root (already gitignored — `.env*` is covered, and `git ls-files` confirms nothing env-shaped is tracked):

```sh
CLOVER_ENV=sandbox
CLOVER_MERCHANT_ID=XXXXXXXXXXXXX
CLOVER_API_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLOVER_ECOMM_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
```

Then work down the table. Each script prints what it proved and what to look at.

---

## Ground rules

- **`CLOVER_ENV=sandbox` until the owner is in the room.** Against production, step 03 creates a real order on a real merchant and step 04 prints a real ticket. Step 01 warns when the env is production; the warning is there because printing into a working shop unannounced is a genuinely bad afternoon.
- **The HTTP 200 is not the finding.** What matters is what appeared *on the device* — modifiers rendered correctly, the discount showing as a discount rather than a changed price, and whether anything printed without step 04 because auto-print was already on.
- **Don't fix problems inside the spike.** Note them and move on; the point is to learn the shape, not to build.

---

## Base URLs used

| | Sandbox | Production |
|---|---|---|
| Platform REST (v3), Hosted Checkout | `apisandbox.dev.clover.com` | `api.clover.com` |
| Ecommerce charges | `scl-sandbox.dev.clover.com` | `scl.clover.com` |
| Card tokenisation | `token-sandbox.dev.clover.com` | `token.clover.com` |

Set in `lib/clover.mjs`, switched by `CLOVER_ENV`.

---

## What we already know going in

- Hosted Checkout line items are **`name` / `price` / `unitQty` only — no inventory IDs.** So HCO cannot by itself produce a printable, inventory-linked order; step 03 is what does that. What's undocumented is whether it *also* creates an order, which is exactly what step 06 measures.
- Atomic orders **must** reference valid inventory items with linked modifier groups to be eligible for printing. Custom line items with unlinked modifiers are the documented cause of print failures.
- `print_event` routes to the firing device's order printer, and **once a job prints, Clover discards it** — the status is not replayable.
- Clover stores tax rates as millionths of a percent: `6250000` is 6.25%.
