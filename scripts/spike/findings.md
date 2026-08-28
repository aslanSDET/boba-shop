# Spike findings

Fill in as you go. Unanswered is fine; guessed is not. When this is complete, fold the conclusions into `PLAN.md §8.7` and delete the parts of the spike that no longer teach anything.

Date run: ____________  ·  Environment: sandbox / production  ·  Merchant: ____________

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
