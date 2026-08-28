# Spike findings

Fill in as you go. Unanswered is fine; guessed is not. When this is complete, fold the conclusions into `PLAN.md §8.7` and delete the parts of the spike that no longer teach anything.

Date run: 2026-08-27  ·  Environment: **sandbox**  ·  Merchant: **4XKCZA8Z277R1** (Boba)

---

## Pre-flight (2026-08-27 — paper check, no credentials, nothing run)

Every Clover HTTP call in `scripts/spike/` was checked against the current published docs before the first live session, so the sitting is not spent on request shapes that were wrong on paper. **None of this is empirical — it is docs plus unauthenticated reachability probes. Anything below can still be wrong live, and the live result wins.**

**Verified against the docs, no change needed:**

- **Atomic order body** — `orderCart.lineItems[].item.id`, `modifications[].modifier.id` / `name` / `amount`, top-level `discounts[{name, amount:-N}]`, `orderType.id` and `printed` all match [Create an atomic order](https://docs.clover.com/dev/docs/create-an-atomic-order) field-for-field, including the negative discount amount. Note the doc's own example quotes `printed` as the *string* `"false"`; we send a boolean.
- **`print_event`** — `POST /v3/merchants/{mId}/print_event` with `{"orderRef":{"id":…}}` is exactly right, and status is `GET …/print_event/{eventId}`. Needs **Write orders** to fire, **Read orders** to poll. An optional `category` field exists (e.g. `"LABEL"`). [Print orders with the REST API](https://docs.clover.com/dev/docs/printing-orders-rest-api)
- **Hosted Checkout** — host, path, the three headers, `customer` / `shoppingCart.lineItems[{name, price, unitQty, note}]`, and the `href` + `checkoutSessionId` + `expirationTime` response all match [Create a Hosted Checkout session request](https://docs.clover.com/dev/docs/creating-a-hosted-checkout-session).
- **`expand` names** — `categories`, `modifierGroups`, `taxRates` are all documented on `getItems`; `modifiers` on `getModifierGroups`; `lineItems` and `payments` on `getOrders`. **Cap is three expansions per call**, and the items call is already at three.
- **`orderBy=createdTime%20DESC`** — `%20ASC` / `%20DESC` is the documented syntax. [Sort collections](https://docs.clover.com/dev/docs/sorting-collections)
- **Pagination** — `limit` defaults to 100, hard cap 1000; offset paging is the documented approach. The `all()` helper is correct.
- **Every path exists** — unauthenticated probes on `apisandbox.dev.clover.com` return 401 (not 404) for `items`, `modifier_groups`, `tax_rates`, `orders`, `order_types`, `tenders`, `devices`, `payments`, `categories`; 405 on GET for `atomic_order/orders` and `print_event` (POST-only, as expected); and `POST /invoicingcheckoutservice/v1/checkouts` returns 401, not 404.

**Fixed on paper (details in the diff):** `api()` could not fail softly, so the permission loop in 01, the print poll in 04 and the snapshot in 05 all had dead `catch` blocks; 01's production warning named the wrong step numbers; 06 gained a guard so a mis-sorted window reports INCONCLUSIVE rather than a confident wrong answer.

**Must be confirmed live — do not assume:**

| Uncertainty | How to settle it in the session |
|---|---|
| Is `orderBy` honoured on `/orders` and `/payments`? Their reference pages document only `filter` and `expand`. An ignored param does not error. | The `WINDOW_OK` guard in 06 catches it. If it trips, re-query with `filter=createdTime>{snapshot}`. |
| Is `createdTime` filterable on `/orders`? | Read the `X-Clover-Allowed-Filter-Fields` response header — Clover returns the filterable fields there. Time filters are capped at a **90-day** range. |
| Is `orderType.id` genuinely required on an atomic order? Reference says required, prose says optional. | 03 sends it when the merchant has order types. If the POST fails without one, that is the answer. |
| Does `printed` accept a boolean, or must it be the string the doc example shows? | If 03 is rejected on that field, send `"false"` and record it. |
| Does Hosted Checkout add tax, prompt for a tip, or redirect, when `taxRates` / `tips.enabled` / `redirectUrls` are all omitted? | Observe on the payment page — 05 prints the list. A Merchant Dashboard redirect setting **overrides** `redirectUrls` in the body. |
| Does a sandbox test merchant have an order printer at all? | 04 lists devices first. No device means the endpoint and permission are proven but printing is not — that still needs the shop's own merchant. |

---

## Confirmed live against a sandbox merchant (2026-08-27)

**Clover answers a missing permission with 401, not 403.** The same token 401s on `/v3/merchants/{mId}` and 200s on `/items`. This sends you hunting for a credential problem that is really a checkbox problem. `hint()` in `lib/clover.mjs` said the opposite and has been corrected; `01-connect.mjs` now prints the full per-endpoint matrix instead of dying on the first denial.

**403 means something different: expandable fields are permission-checked individually.** `GET /items?expand=taxRates` returns 403 `"Invalid permissions for expandable fields."` on a token that reads `/tax_rates` directly with a 200. One unpermitted name fails the whole call, so `expand=categories,modifierGroups,taxRates` fails while `expand=categories,modifierGroups` succeeds. Relevant to `catalog-sync`: prefer separate calls over a wide expand, or the sync breaks on a permission you did not know you needed.

**One token per concern does not work for this integration.** Two tokens scoped "business settings" and "inventory and orders" split the endpoints the spike needs — merchant + devices on one, items + orders + tax_rates on the other. The production integration should use a single token carrying Merchant read, Inventory read, Orders read+write, Payments read.

## Measured on a live sandbox merchant — steps 01–04 (2026-08-27)

Merchant `4XKCZA8Z277R1` ("Boba"), seeded from the real Billerica catalog by `seed-sandbox.mjs`.

### Tax rates are hundred-thousandths of a percent, not millionths

**percent = rate / 100_000.** 6.25% is `625000`. This was inferred wrong from the docs in *both* directions during one session, and only an order total caught it: a rate of `6_250_000` was charged as **62.5%**, turning a $5.83 order into $9.27.

Nothing in the API errors. The order just quietly costs the customer ten times the tax. This is the strongest argument for the server recomputing the total and *comparing* against Clover, rather than trusting either side alone.

### Discounts apply BEFORE tax

`(6.45 − 1.00) × 1.07 = 5.83`, not `6.45 × 1.07 − 1.00 = 5.90`. The promo engine must match this ordering or every discounted order reconciles cents out.

### `taxAmount` reads 0 even when tax was charged

`total` was correct at `583` while `taxAmount` stayed `0`. **Do not reconcile against `taxAmount`.** Trust `total`.

### Atomic orders work as designed

One call created an inventory-linked order carrying a modifier and an order-level discount. The discount is recorded as a real discount — `{"name":"SPIKE10 (test promo)","amount":-100}` — not a rewritten line price, so the shop's books stay right. The line item carries `item.id` and both tax rates.

### Order state on creation is `OPEN`, `paymentState: OPEN`

An API-created order is not "pending payment" in any special sense. Whether that alone fires a ticket on a merchant with auto-print enabled is **still unknown**, and it matters: if it does, pushing an order before payment would print an unpaid ticket.

### Hosted Checkout does NOT apply the merchant tax rates — and atomic orders DO

The checkout page rendered **Tax $0.00, Total $16.75** — exactly the sum of the line items we sent. Hosted Checkout charges what you hand it, full stop. Step 03 proved the opposite for orders: an atomic order referencing inventory items applies the merchant tax rates itself and returned $5.83 on a $5.45 net cart.

**So the two halves of Option B disagree by default.** Charge $16.75 through Hosted Checkout, then push an atomic order for the same items, and Clover computes $17.92 on the order. The shop is then holding a paid order whose recorded total does not match its payment — on every single order, not as an edge case.

This is the sharpest argument yet for rule 1 in `PLAN.md` §8.7 (*the server is the pricing authority*), and it needs an explicit resolution rather than a default:

- compute tax server-side, send the tax-inclusive total to Hosted Checkout, and create the order with tax suppressed (`taxRemoved`) or with explicit line prices; **or**
- create the order first, read back Clover's computed total, and charge exactly that.

The second is more robust — Clover stays the arithmetic authority and our maths only has to *agree*, not *lead*. It depends on being able to create an order without it firing a ticket before payment, which is the remaining unknown below.

### Other Hosted Checkout defaults, observed rather than assumed

- **Tips: off by default.** No tip prompt appeared without sending `tips`. Sending `tips:{enabled:true}` is opt-in, not opt-out.
- **Branding is thin**: merchant name in a coloured header bar, otherwise a plain white card. Owning the funnel visually means the iframe integration, not Hosted Checkout. Acceptable for v1.
- **reCAPTCHA is present** without being asked for, which is the card-testing protection the brief credited it with.
- **Customer fields prefill** from the `customer` object we sent, with the email partly masked in the UI.
- Card form is Card Number / MM-YY / CVV / **Zip** — the postal code is required, so our checkout must collect it or let Clover do so.
- Session lifetime is short: `expirationTime` was ~30 minutes out.

### print_event — endpoint and permission proven, printing NOT proven

`POST /print_event` returned `400 {"message":"The default printing device is missing"}`. A business-logic error, not an auth error, so the token and route are right. But a sandbox test merchant has **no devices**, so actual printing cannot be demonstrated here.

**This is the one gap the sandbox cannot close.** It closes only against the shop's own merchant, with the owner watching.

## The two that decide the architecture

### Does an API-created order print on the merchant's own printer? (steps 03–04)

- Order appeared on the device / dashboard: **yes / no**
- A ticket printed: **yes / no**
- Printed automatically on creation, before step 04 ran: **yes / no**  ← if yes, auto-print is on and `print_event` may be redundant or a *duplicate*
- Modifiers rendered correctly on the ticket: **yes / no** — notes:
- Discount shown as a discount (not a silently changed price): **yes / no**
- Clover's computed total matched our own cart maths: **yes / no** — difference:

**Verdict:**

### Does Hosted Checkout create its own order? (steps 05–06)

- New payments after paying the link: ____
- New orders after paying the link: ____
- If an order appeared — were its line items inventory-linked? **yes / no**

**Verdict:** payment-only / creates its own order

**Consequence for the design:**

---

## Everything else worth recording

**Token & permissions** — which permissions the token actually needed, and anything denied:

**Tax rates** — the real rates behind the two `taxIds` on every item:

| Tax name | Rate | Clover ID |
|---|---|---|
| | | |
| | | |

Retires the invented 8.75% in `src/store/useCart.ts`. Does every item carry both?

**Inventory API vs. the RSC scrape** — same data? Anything the scrape can't see (stock, tax rates, availability)? Anything the scrape has that the API doesn't?

**Hosted Checkout, as a customer sees it** — branding control, tax handling, tip prompt, redirect behaviour:

**Surprises** — anything that contradicts `PLAN.md §8.7`:

---

## Decisions this changes

- [ ] `PLAN.md §8.7` — confirm or correct the checkout design
- [ ] `PLAN.md §9` — close the tax question with the real rates
- [ ] `scripts/fetch-clover.mjs` — replace the RSC scrape with the Inventory API
- [ ] `CLOVER-AND-LAUNCH.md §6` — update the sequence diagram if the flow changed
