# Asian Kitchen on Square — payments and delivery, in questions

> **Status: RESEARCH, with the pricing path now MEASURED.**
>
> Most claims below are **read from documentation** — the same standing the
> Square column in `PLATFORM.md` §8 has. Three are not, and are marked
> **measured** where they appear: authentication, `GET /v2/locations`, and
> `POST /v2/orders/calculate` have been run against the sandbox merchant
> `LA5YVEHPBFX7Y` ("Default Test Account") with a real cart, and they work.
>
> The money path — `CreateOrder`, `CreatePayment`, declines — has **not** been
> run. Neither has anything in §8. §10 is still the list.
>
> Where a source contradicts another source, both are recorded rather than
> resolved by preference.

---

## 1. Does building on Square give us delivery for free?

**No. This is the finding that changes the plan.**

The premise was that Square's On-Demand Delivery would dispatch a DoorDash or
Uber courier for us, so choosing Square's backend would mean delivery without a
custom courier integration. Square staff say otherwise, directly:

> On-Demand Delivery is Square Online only — it does not dispatch a courier via
> the Orders API.
> — jseok, Square, [developer forum](https://developer.squareup.com/forums/t/does-on-demand-delivery-dispatch-via-the-orders-api-or-is-it-square-online-only/27379)

And on the fulfillment type specifically: the Orders API does support a
`DELIVERY` fulfillment (beta), but creating an order with it *"does not
automatically trigger Square's managed courier dispatch (DoorDash/Uber)"*. That
workflow is tied to Square Online's own checkout.

**What this means concretely.** Square Online is the hosted storefront — the
thing this entire project exists to replace. Using it to get courier dispatch
would mean handing the customer relationship back to a rented storefront, which
is the argument in `docs/ASIAN-KITCHEN.md` §2 and
`artifacts/snowdaes-vs-owner.html` turned inside out.

So delivery on our own checkout means **integrating DoorDash Drive (or Uber
Direct) directly**. That is a real integration — courier quotes, dispatch,
status webhooks, cancellation, refunds when a courier fails — not a flag.

---

## 2. What does DoorDash Drive actually cost?

Two DoorDash sources disagree, and the difference is about $3 an order.

| Source | Price |
|---|---|
| Merchant product page | **$6.99–$10.99** flat per delivery |
| [Developer pricing docs](https://developer.doordash.com/en-US/docs/drive/overview/pricing_payment/) | **$9.75** base within 5 miles, **+$0.75/mile** to 15 miles → ~$13.50 |

These are probably different products — the self-serve Drive On-Demand a
merchant turns on from a dashboard, versus the Drive API a developer integrates.
**Not resolved, and it should not be guessed at**: the API path is the one we
would build against, and its floor is $9.75, not $6.99.

Two details that are consistent across both:

- **No percentage commission.** This is the real difference from the marketplace
  (15% / 25% / 30% on Basic / Plus / Premier). The restaurant keeps the food
  ticket.
- **Tips pass to the Dasher**, and DoorDash discounts the base rate by **$2.75**
  if the application enables tipping and forwards 100% of tips.

That $2.75 matters: with tipping wired, an in-town delivery is ~$7.00, which is
roughly where the merchant page's floor sits. The two sources may be describing
the same thing before and after that discount.

---

## 3. Is Asian Kitchen actually gaining delivery, or taking it back?

**Taking it back.** `docs/ASIAN-KITCHEN.md` §2 establishes they already deliver
through four surfaces, including an aggregator white-label site that charges the
diner a **10% service fee plus $3.99 delivery**.

This is not a restaurant without delivery. It is a restaurant whose delivery is
intermediated. That changes the pitch from "we will give you delivery" to "you
are already paying for delivery, and someone else owns the customer".

**The number we do not have.** §2 is emphatic that every published figure is what
the *customer* pays, and that Asian Kitchen's own commission is not visible from
outside and has not been established. Any comparison of "our delivery cost vs
theirs" is unquotable until the owner shares a statement (§6).

---

## 4. Can we price a cart without creating an order?

**Yes — `CalculateOrder`.** It takes the same request body as `CreateOrder` and
returns Square's own computed totals, discounts, taxes and service charges,
without persisting anything.

This is the single biggest structural improvement over Clover, and
`PLATFORM.md` §8 already called it: every orphaned OPEN order this project has
fought — the 11 duplicates, the 9 swept on 2026-08-31, the whole of
`pos/clover/idempotency.ts` — exists because Clover cannot price a cart without
creating one.

**Measured, 2026-09-02.** A Pick Any Three Items plate with three Sesame
Chicken and a Fried Rice returned `$10.99`, with the four choices itemised as
line-item modifiers rather than folded into the name — which is what makes a
kitchen ticket legible on a menu where the modifiers *are* the product.

One thing the same call exposed: the sandbox merchant has **zero `TAX` objects
in its catalog**, so `taxCents` comes back `0`. That is an empty sandbox, not an
arithmetic bug, and it must not be "fixed" by computing tax locally — invariant
4 exists precisely to stop that. A demo either creates a `TAX` object in the
sandbox or shows a $0.00 tax line honestly.

On Square the shape becomes:

```
browser cart → CalculateOrder    (pricing preview, nothing persisted)
             → CreateOrder       (only once the customer commits)
             → CreatePayment     (with the token from the Web Payments SDK)
```

The POS is still the calculator (`AGENTS.md` invariant 4). We never compute tax.
What changes is that asking the question no longer leaves litter.

---

## 5. How does card entry work?

**Web Payments SDK in the browser → single-use token → Payments API on the
server.** Square's own description: *"The SDK produces a secure single-use
payment token that your application web client sends to your backend, where it's
processed as a payment with the Payments API."*

All methods produce the same token format and are accepted as `source_id`, which
means one server path covers: card, **Apple Pay, Google Pay, Cash App Pay**,
Afterpay/Clearpay, ACH, and Square gift cards.

That is materially better than Clover's split — three non-interchangeable hosts,
a PAKMS key fetched at request time, and a separate `/pay` call
(`pos/clover/client.ts`). Square needs an **application ID** and a **location
ID**, both non-secret and browser-safe.

Constraints worth knowing before designing the page:

- **HTTPS / Secure Contexts required**, and a Content Security Policy, from
  1 October 2025.
- **Chrome extensions do not work with the SDK** — relevant because a browser
  extension was already observed injecting into a page during this project.

---

## 6. Do we need a hosted checkout, like Clover's?

**No.** Clover Hosted Checkout was chosen partly because it carried PCI scope,
and it came with a real cost — `memory: hosted-checkout-has-no-refunds`.

Square's normal path *is* the inline one: the SDK isolates the PAN, the server
never sees a card number, and we keep the page. Payment Links exist as Square's
hosted option, but there is no reason to reach for them here.

---

## 7. What does Square charge?

**Square raised online rates on 13 January 2026.**

| Plan | Online / card-not-present |
|---|---|
| Free | **3.3% + 30¢** |
| Plus / Premium | **2.9% + 30¢** |

The widely quoted "2.9% + 30¢" is now the *paid-plan* rate. Which one applies to
Asian Kitchen depends on the plan they are already on, which is a §6 owner
question and not knowable from outside.

For scale against the thing being replaced: a 15–30% marketplace commission is
an order of magnitude above either number. Processing cost is not the argument;
commission is.

---

## 8. Does an order we create actually reach the kitchen?

**Unverified, and this is the blocking question.**

It is the same question that decided the Clover architecture. `PLAN.md` §8.7
dropped the entire kitchen-display phase on the finding that Clover's Orders app
and the shop's existing printer *are* the kitchen display, and that building a
second screen for staff to watch during a rush is how orders get missed.

Square's documentation says the KDS receives orders from Square for Restaurants,
Point of Sale, Square Terminal, **Square Online**, and third-party delivery and
kiosk partners *"sending orders to Square"*, and that auto-print is a toggle
under Orders → Print Orders.

What is **not** established is whether an order created by a custom application
through the Orders API lands in that same queue and prints, or whether it needs
Square for Restaurants specifically, or a particular fulfillment state.

`memory: clover-printing-is-not-a-blocker` records that nine public Clover
integrations used zero print events and the fallback held. The equivalent has
not been checked for Square. **Until it is, no delivery work should start** —
a delivery order that never reaches the kitchen is worse than no delivery.

---

## 9. What breaks in our data model?

`PLATFORM.md` §8 already answered this: **item variations**.

Snowdaes models `Snow - Kiddie / Small / Large` as three rows with a flat
`basePrice`. Square models one `ITEM` with `ITEM_VARIATION`s, which is the
better model — Clover's version loses the fact that they are the same product.

Asian Kitchen's own menu is already variation-shaped: `Pick Any Three Items`
with entrée slots is closer to variations-plus-modifiers than to Snowdaes' flat
list (`docs/ASIAN-KITCHEN.md` §8). This is the extraction trigger in
`PLATFORM.md` §3 arriving on schedule.

---

## 10. What is the smallest thing that would make this file trustworthy?

A Square sandbox spike, in the shape that worked for Clover
(`scripts/spike/findings.md`), answering in order:

1. Read the catalog. Does `ITEM_VARIATION` map onto the transcribed menu, or does
   the transcription have to change?
2. `CalculateOrder` on a real cart. Do the totals match the tiles?
3. `CreateOrder` + `CreatePayment` with a sandbox card. Does the money path close?
4. **Does the order appear in the merchant's Square POS, and does it print?** (§8)
5. Idempotency: `idempotency_key` is *required* on Square writes. Does a repeat
   return the first result, or an error?

Credentials for 1–3 and 5 are in `.env.local` and **do work** —
`src/pos/square/` now reads them, and questions 1 and 2 are answered above.
**Question 4 cannot be answered in a sandbox** — it needs the owner's real
device, the same way Clover's print question did.

> **A trap that cost time here.** `.env.local` contains a multi-line test-card
> block that is not valid shell, so `set -a; . .env.local` aborts before
> reaching the `SQUARE_` lines and every subsequent curl goes out with an empty
> bearer token. That returns `401 UNAUTHORIZED` on every endpoint in both
> environments and is indistinguishable from a revoked credential — it was
> written up as one before the app, which parses the file properly, worked
> first time. Parse `.env.local` in Python before blaming a token.

---

## 11. So what should actually be built first?

**Pickup only, and no delivery toggle.**

That is the recommendation in the brief this file was written against, and it
survives the corrections — for a stronger reason than the brief gave. The brief
argued sequencing (don't overwhelm the kitchen). The real reason is §1: delivery
is not a checkbox on Square, it is a second integration against a third party,
and §8 is unanswered.

The checkout page from the brief is sound and mostly carries over:

- Fulfillment pill: `Pickup at [address]`, no switcher in v1
- Ready-in estimate
- Three fields: name, mobile, email
- Tip selector — `CalculateOrder` prices it, we never compute it
- One-tap Apple/Google Pay above the card form, since the SDK gives them for free
- Confirmation at `/order/[id]` with a large pickup number, map pin, click-to-call

The delivery design in the brief — address autocomplete, drop-off notes, fee
breakdown, courier tracker — is **not wasted**, it is just Phase 2, and it is
larger than it looked.
