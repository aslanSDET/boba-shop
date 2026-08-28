# Spike findings

Fill in as you go. Unanswered is fine; guessed is not. When this is complete, fold the conclusions into `PLAN.md §8.7` and delete the parts of the spike that no longer teach anything.

Date run: ____________  ·  Environment: sandbox / production  ·  Merchant: ____________

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
