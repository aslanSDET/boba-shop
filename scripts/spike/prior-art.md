# Prior art — what other Clover integrations already learned

Surveyed 2026-08-28. Everything in `findings.md` is something **we measured**. Everything
here is something **someone else measured**, and each item is tagged with how far we
trust it:

- **CONFIRMED** — checked against Clover's official docs or our own spike.
- **CLAIMED** — a specific, falsifiable statement in someone's production code, usually
  with the scar tissue to match. Plausible, not yet verified by us.

Nothing here has been copied into our code. This is a map of where the mines are.

All nine are cloned at `../clover-reference/` — deliberately a sibling of this repo, never
inside it, because `boba-shop` is public and most of that code is unlicensed.

**`../clover-reference/README.md` is the index**: what each repo is, what to borrow from
it, and which files to open. Start there; this document is the analysis, that one is the
map.

## The repos worth reading

| Repo | What it is | Why it matters to us |
|---|---|---|
| [`Yipyy-Inc/puneet`](https://github.com/Yipyy-Inc/puneet) | Production Next.js app, Clover OAuth + terminals + ecommerce, actively pushed | By far the most valuable. Exhaustively commented, and the comments record *measured* failures, not intentions |
| [`mbates/clover`](https://github.com/mbates/clover) | MIT TypeScript wrapper for both Clover hosts, Aug 2026 | Confirms the two-host split and the Hosted Checkout webhook signature scheme |
| [`atinm/clover-online-orders`](https://github.com/atinm/clover-online-orders) | One developer's personal mirror of **Zaytech's** commercial "Smart Online Order for Clover" WordPress plugin. **Not Clover's**, and not the mirror-owner's work either — original author `elbanyaoui`, 2016 | A commercial vendor product. See the architecture note below |
| [`mattlisiv/clover-api-python`](https://github.com/mattlisiv/clover-api-python) | Most-starred standalone Clover client (11 stars) | Mostly a thin v3 wrapper; low signal |
| [`clover/*`](https://github.com/orgs/clover/repositories) | Clover's own GitHub org | `hosted-checkout-codelab` and `export-api-examples` are on our path but **both archived**. Everything else is `remote-pay-*` SDKs for physical terminals |

Two caveats on the search itself. First, "clover" is a badly polluted keyword on
GitHub — the bootloader, Cloverly (carbon offsets), Naver Clova, and several game mods
all crowd the results. Second, a chunk of the code search hits for `scl.clover.com`
are **card-testing / fraud tooling** ("charge gates"). Those were not opened and are
not listed.

## The one that could change our architecture

### `POST /v1/orders/{orderId}/pay` links an order to a payment — online only

**CLAIMED** — `src/lib/clover/orders.ts` in the Yipyy codebase:

> Online is different: Clover DOES support a real link, via `POST /v1/orders/{orderId}/pay`
> on the same Ecommerce host and the same `clv_` token the charge already uses.
> **That is not built.**

They could not verify it — their sandbox token had expired and Clover rotates refresh
tokens, so re-authing outside the app would have broken the stored grant. **We do not
have that problem.** Our merchant tokens are live and do not rotate.

If it works, it is the answer to the question we shelved: we create the order ourselves
— inventory-linked, with Clover's own tax rates applied by Clover's own calculation —
and *then* pay it. That is strictly better than Hosted Checkout creating a bare order we
have to rewrite afterwards, and it closes the `taxAmount: $0.00` reporting gap in
`findings.md` without us owning a calculation engine.

This is a ~20 minute test on the sandbox and it is the single highest-value thing left
in the spike.

## Webhooks: there are TWO systems and they authenticate completely differently

**CONFIRMED** against Clover docs. This one matters because `PLAN.md` currently says
`clover-webhook (signature verification)` as if there were one thing.

| | Platform / merchant webhooks | Ecommerce Hosted Checkout webhooks |
|---|---|---|
| Header | `X-Clover-Auth` | `Clover-Signature` |
| Value | A **static UUID**, identical on every message | `t=<ts>,v1=<hmac>` |
| Integrity | **None.** No signature, no timestamp, no replay protection | HMAC-SHA256 over `` `${t}.${rawBody}` `` with the Signing Secret |
| Set up in | Developer Dashboard, per app | Per Hosted Checkout URL |

Consequences we should adopt regardless of which one we end up on:

- **A delivery is a hint, never a fact.** The Yipyy handler records that Clover
  *mentioned* an object id, then re-reads that object from the API with the merchant's
  own token, and every decision comes from the read. On the platform webhook this is not
  optional — possession of a static UUID is the entire proof of origin.
- **Return 200 for anything you will never process.** Clover retries non-200 forever, so
  a status code is a scheduling instruction, not an opinion. Record the event, close it
  with a reason, answer 200. Reserve non-200 for "I genuinely could not record this".
- **The handshake cannot be authenticated.** Clover POSTs `{"verificationCode": "..."}`
  *before* the auth header starts appearing, so the first message can never carry the
  secret. Yipyy's fix is elegant: that branch is live **only while the secret env var is
  unset**, so the door closes the moment you finish walking through it.
- Compare secrets with `timingSafeEqual`, and length-check first — it *throws* on
  differing lengths.

## Money gotchas

### A reversal is not always a refund

**CLAIMED**, measured by Yipyy against the Clover sandbox, and flagged by them as a
silent bug they nearly shipped. Calling `/v1/refunds` on a charge **from the same batch**
produces a **void**, not a refund. The payment comes back as:

```json
{ "result": "VOIDED", "voidReason": "USER_CANCEL", "refunds": { "elements": [] } }
```

Fully reversed, with an **empty** `refunds` array. Reconciling on `refunds[]` alone —
the obvious reading of the API — misses every same-day reversal and reports the money as
still taken. "How much did Clover give back" is: the whole amount if `result` is
`VOIDED`, otherwise the sum of refunds that actually succeeded (a listed refund with
`status != SUCCESS` or `voided: true` is not money).

For a boba shop, same-day reversal *is* the common case. This would have bitten us.

### `externalPaymentId` is capped at 32 characters

**CLAIMED.** A UUID is 36. Yipyy strips the dashes to fit. If we key Clover payments by
our own order id, it cannot be a raw UUID.

### Idempotency keys are honoured, and are the crash-recovery story

**CLAIMED** by both Yipyy and `mbates/clover` (which defaults an `idempotency-key` header
on every mutating call). On retry with the same key Clover returns the **original**
charge instead of making a second one. Yipyy's pattern: write the intent row *before*
calling Clover, with the key you are about to send. If the process dies mid-charge, the
row says "we asked for this amount with key K and never heard back", which is both the
thing to reconcile and what makes the retry safe.

### Money can arrive that you cannot place

**CLAIMED**, and they built a whole feature for it — an "unattached payments" queue with
a nightly sweep, a review screen, and an explicit dismiss-with-reason. This is the exact
failure mode our Hosted Checkout finding implies: Clover takes the money and creates its
own order, and if our side crashed in between, nothing links it to a customer.

Worth internalising even at feasibility level: **plan for a reconciliation surface, not
just a happy path.** It does not have to be built in Phase 2, but it should not be a
surprise in Phase 4.

## Permissions cannot be introspected — you have to provoke a refusal

**CONFIRMED** — matches what we found independently. Clover's token exchange returns
`access_token`, `refresh_token` and expiries and **says nothing about permissions**.
Permissions are ticked on the app in the developer dashboard and are never reported back
to the app holding the token.

So the only way to know what a connection may do is to ask Clover to do it and read the
refusal. Yipyy's trick is a deliberately invalid write — `POST /v1/customers` with an
empty body cannot create anything, so the status is purely about permission:

- `400` — understood and rejected on merit → **permitted**
- `403` — the app lacks the permission
- `401` — the token is dead

Note this differs from ours: on **merchant-generated tokens** we measured a missing
permission as **401**, not 403, and saw 403 only when an `expand=` value was rejected.
Same principle, different codes per auth model. Both are worth having written down.

They also refuse to report `charge` as working, because taking a payment cannot be proven
without taking one — it is reported as `untested` and never as green. That is a good
habit for our own status surfaces.

## Printing

**CLAIMED**, and this is the REST Pay Display API (a semi-integrated countertop terminal),
**not** the `print_event` route our spike uses. Still worth recording, because if
`print_event` does not work on the shop's real merchant this is where we go next.

- The path is `POST /connect/v1/device/print/text`, **not** `/v1/device/print`. The latter
  answers `404 {"message":"Invalid URI"}`. Their note: it cost a live terminal test to
  find, because the failure is invisible — the payment succeeds, the response says
  `receiptPrinted: false`, and the 404 only appears in the server log.
- `POST /connect/v1/device/printers` (empty body) lists the device's printers. **This is
  a way to answer our open printing question without a sale** — a merchant with an
  attached kitchen printer lists more than one, and the first is the device's own roll.
- The `X-Clover-Device-Id` header takes the **serial**, not the device id.

## The design rule everyone converged on independently

Both `orders.ts` and `print.ts` in the Yipyy codebase state it in nearly identical words,
and it is the single most transferable thing in this survey:

> A sale that succeeded with no paper is a nuisance. A sale reported as failed because a
> second request failed is a double charge.

So every call that is *not* the one moving money returns `null` rather than throwing, has
a short timeout (8s for orders, 15s for print), and **no retries**. The caller is expected
to be able to ignore the failure entirely.

This is the correct shape for our order-push and ticket-fire steps, and it is worth
writing into `.claude/agents/clover-ops.md` as a rule.

## Architecture note: what the commercial product actually does

`atinm/clover-online-orders` is the source of **Smart Online Order**, a paid WordPress
plugin that is close to a direct competitor to what we are building — take a merchant's
Clover menu, put a nicer storefront on it.

It does **not** talk to Clover. Every call goes to `api.smartonlineorders.com`,
`api-v2.smartonlineorders.com`, `api-inventory.smartonlineorders.com` — their own hosted
middleware, which holds the Clover connection. The plugin authenticates to *them* with a
JWT.

Three things follow:

1. **Nobody puts Clover credentials in a browser.** The middleware layer is universal.
   Our Amplify Functions are the same shape as their API tier. This is not
   over-engineering; it is the only shape available.
2. They built **their own customer accounts** — `moo_CustomerLogin`, `moo_CustomerSignup`,
   `moo_CustomerFbLogin`, `sendVerificationSms`, `moo_CustomerVerifPhone` — rather than
   using anything of Clover's. That is a direct precedent for our Clerk decision.
3. They route payments through **Spreedly** (`moo_PayOrderUsingSpreedly`) alongside a
   Clover pay-key path. Two paths, because one processor is not enough for a plugin
   serving many merchants. We have one merchant, so this is a complexity we get to skip.

Also visible in their API surface, and a useful checklist of what a *finished* Clover
storefront needs beyond a menu: `getOpeningHours`, `getOpeningStatus`, `getBlackoutStatus`,
`getOrderTypes`, `getTrackingStockStatus`, `getItemStocks`, `removeOrderFromClover`,
`NotifyMerchant`. Store hours, blackout dates, order types and stock tracking are all
things Clover already knows and we have not yet planned to read.

## Everyone hand-rolls the client

**CONFIRMED.** There is no first-class Clover Node SDK. `mbates/clover` states it
outright and every other integration surveyed hand-rolls `fetch`. Our dependency-free
`scripts/spike/lib/clover.mjs` is the normal answer, not a shortcut.

`mbates/clover` is MIT and reasonably clean if we ever want a typed client, but it covers
charges/refunds/customers and **not** orders, inventory or line items — which is most of
what we need. Not worth adopting; worth reading.

## The retrospective worth reading twice

**CLAIMED**, from `docs/quality/debt-map.md` in the Yipyy repo — a section titled
"Fifteen defects, and all but one were found by running the code":

> Clover's documented behaviour and its actual behaviour differ in ways that are
> individually small and collectively expensive, and the failures are quiet — a null, a
> wrong status code, a missing row.

**Six of the fifteen were already committed and described as working.** Their rule after
that: exercise the path against the live sandbox before claiming it works, and if you
change a money path and cannot test it, say so in the commit rather than letting a green
typecheck stand in for evidence.

This is the same shape as our tax-divisor episode — inferred from the docs, wrong by a
factor of ten, caught only because we ran an order and read the total.

The fifteen, as a checklist of things that bite:

| Symptom | Cause |
|---|---|
| Card fields never mount | `mount()` takes a **CSS selector, not a node**. Passing the element fails the whole mount with a generic message |
| Selector syntax error on mount | React `useId()` yields `:r1:`; a bare `#:r1:` is invalid. Strip the punctuation |
| A declined card returns 500 | Clover sends **no `error.type` on a decline**, only HTTP **402** |
| Silent nulls under load | Three separate **429s** from Clover, swallowed |
| A refund took the whole charge | A refund that **omits its amount** asks for the full original |
| A facility went offline | **Clover rotates refresh tokens**, so two concurrent refreshes invalidate each other |
| An awake terminal reported unreachable | A guessed 25s `deviceState` timeout; a healthy device answers in **8s** |
| Payment id silently truncated | `externalPaymentId` caps at **32 chars**; a UUID is 36 |

Three more from elsewhere in the same document:

- **A `clv_` token is single-use.** Splitting a payment across two cards means calling
  `createToken()` inside the loop, not once outside it.
- **`POST /v1/orders/{id}/returns` refunds the WHOLE order while echoing your amount back
  in the response.** That is about as quiet as a money bug gets.
- **A tip makes `/v1/refunds` refuse a partial refund**, and Clover does not expose how a
  refund splits across subtotal/tax/tip — the refund element carries none of its own, and
  the nested `payment` holds the *original's*. They derive the split proportionally and
  say plainly that it is a derivation, not Clover's answer.

### The one that lands directly on our two-location design

Their webhook retry loop spun for eighteen days — roughly **1,700 attempts** — on
deliveries naming a merchant that was not the facility's current one. `reconcilePayment`
reads with the *current* merchant's token, Clover cannot answer for another estate, the
read returns "unreadable", and unreadable was skipped and left for next time.

`PLAN.md` §8.6/§8.7 already say Billerica and Lowell are **two merchant accounts with two
credential sets**. So our webhook handler will receive deliveries for two merchants and
must dispatch on the merchant id in the delivery — not read with whichever token it
happens to hold. Getting this wrong is silent and self-perpetuating.

## The browser key is safe to expose; nothing else is

**CLAIMED**, and it matches what `clover-ops.md` already says. Clover's public browser key
tokenises and **cannot charge**. Their card-fields component receives only a `clv_` token
and they note the rule that keeps it true:

> There is deliberately no state anywhere holding anything card-shaped, and there must
> not be. A single "let me just read the value out of the field" undoes the whole
> arrangement.

They still gate the route that serves the key — not for the key's secrecy, but because an
open route tells anybody which businesses have a live merchant account. Worth copying.

## Three developers who rebuilt a real business on Clover

This is the genre we actually wanted: an independent developer taking one small
bricks-and-mortar business and putting a real storefront on its Clover account. None of
them turn up in a repo search — every one was found by code-searching for
`CLOVER_MERCHANT_ID`, because none of them mention Clover in the repo name or
description. All three are zero-star, unlicensed, and actively pushed in August 2026.

| Repo | Stack | Business |
|---|---|---|
| [`Brighter55/chiang-mai-ai-phone-ordering`](https://github.com/Brighter55/chiang-mai-ai-phone-ordering) | Django | A Thai restaurant taking orders by AI phone call |
| [`sanqin888/sanqinMVP`](https://github.com/sanqin888/sanqinMVP) | NestJS + Prisma | A restaurant web ordering site |
| [`cranzoid/Pizza62Sol`](https://github.com/cranzoid/Pizza62Sol) | Next.js | A pizza shop |

### The Django one has independently arrived at our exact design

`sync_menu_from_clover.py` and `push_order_to_clover.py` are, line for line, the two
Amplify Functions in `PLAN.md` §6. Their model gained `clover_item_id`,
`clover_modifiers`, `clover_order_id`, `clover_pushed` and `clover_error` in a single
migration — our `MenuItem` keyed by `cloverItemId` and our `Order` mirror with
`PUSH_FAILED`, arrived at by someone who never saw our plan.

Two details worth stealing outright:

- **The sync preserves locally-curated fields by name.** Clover owns names, prices and
  modifiers; their phonetic aliases and Thai names survive a resync. We will have the same
  problem the moment we add a photo, a description or a tag that Clover has no field for.
  Their default for an item that vanishes from Clover is **mark unavailable, not delete**,
  precisely to keep that curation.
- **The push has a manual retry command** taking a local order id, `--force` to re-push.
  For a two-store shop that is a better answer than an automatic retry queue.

And the same rule we saw everywhere else, stated in their own words: the push "never
raises to the caller", because "the local order + SMS are the source of truth / backup".

### The NestJS one answers the question we shelved

`pricing-token.service.ts` is the cleanest solution to "who calculates" that turned up
anywhere. The server computes the total, then issues an **HMAC-signed token** binding
`totalCents` + a cart fingerprint + the checkout intent id, with a **15-minute TTL**. The
browser carries the token to checkout and cannot alter the price; the server verifies the
signature, the fingerprint and the amount before charging.

That is the missing half of our Hosted Checkout finding. We already know Clover has no
calculation engine and silently ignores `taxRates`, so we must compute. This is how you
compute on the server without trusting the client with the number — and it is about
sixty lines.

They also compute `taxCents` themselves and **recalculate rather than trust** what came
back in the checkout metadata, which is the same conclusion `findings.md` reached.

### And the pizza one runs both payment paths at once

`lib/clover.ts` calls **both** `/invoicingcheckoutservice/v1/checkouts` (Hosted Checkout)
and `/v1/charges` (the tokenising iframe, via `CloverCardForm.tsx`). Whatever the reason,
it means our Hosted-Checkout-vs-iframe question does not have to be answered once and
forever — the two can coexist behind one cart, and someone is shipping them that way.

## Nobody calls `print_event`. Not one of them.

Across all nine Clover integrations now cloned in `../clover-reference/` — including
three restaurants and a commercial ordering plugin — **`print_event` does not appear
once**. We are the only ones trying it.

That reframes our last open risk. The other restaurants get an order in front of staff
by pushing an **open order** to Clover and letting it land in the merchant's Orders app,
with a second channel as the real backstop — the Django one sends an SMS and treats it,
explicitly, as the source of truth.

Two readings, and we cannot yet tell which is right:

1. `print_event` is unnecessary — an open order on the device prints or alerts by itself,
   the way an order from Clover's own online ordering does today.
2. `print_event` is unreliable enough that people quietly stopped using it.

Either way, **the fallback is proven and cheap**: push the order, and notify staff on a
second channel we control. That is the answer if printing does not work on the shop's
real merchant, and it means printing is no longer a risk that can sink Option B. It is
now a question of how good the experience is, not whether the thing works.

Worth asking the owner directly: *when an online order arrives today, what actually
happens — does paper come out, or does someone watch a screen?*

## Clover's own codelab admits two Hosted Checkout limitations

**CONFIRMED** — from the README of `clover/hosted-checkout-codelab`, Clover's own
tutorial repo (archived 2024, so worth re-checking against current docs):

> 1. A merchant's Clover inventory cannot be used with hosted checkout.
> 2. Refunds and voids are not available with hosted checkout. Hosted checkout provides a
>    customer-facing payment interface, not a fully-featured payment system for merchants.

The first is Clover confirming, in writing, what we measured the hard way — no inventory
link, no calculation engine, `taxRates` silently ignored.

**The second is new, and it is the strongest argument yet against Hosted Checkout.** A
boba shop refunds wrong orders. If refunds and voids are unavailable on that path, every
refund has to happen inside the Clover dashboard by hand, and our side only learns about
it by webhook or sweep — which is exactly the reconciliation burden the Yipyy repo shows
is expensive to get right.

The tokenising iframe path (`/v1/charges` + `/v1/refunds`) does not have this problem, and
`Pizza62Sol` demonstrates both paths can run side by side. This does not need deciding
now, but it should be decided before Phase 2b rather than discovered during it.

## What this changes

- [ ] **Test `POST /v1/orders/{orderId}/pay` on the sandbox.** Highest value item left.
- [ ] **Test `POST /connect/v1/device/printers`** — may answer the printing question
      without needing a sale, though still needs the real merchant.
- [ ] `PLAN.md` §6 — `clover-webhook` needs to name *which* webhook system; the auth is
      completely different and only one of them has a signature.
- [ ] `clover-ops.md` — add the "a secondary call must never fail a sale" rule.
- [ ] Reconciliation / unattached-payment handling belongs on the Phase 4 roadmap.
- [ ] Void-vs-refund handling belongs in whatever we build for order cancellation.
- [ ] Read Clover's store-hours / blackout / order-type endpoints before designing our
      own opening-hours logic.
- [ ] Webhook handler must dispatch on the merchant id in the delivery — we have two
      merchants and reading with the wrong token fails silently and retries forever.
- [ ] Treat HTTP 402 as a decline, not an error, and handle 429 explicitly.
- [ ] Borrow the signed pricing-token pattern — it closes the "we must calculate but
      cannot trust the client" gap in about sixty lines.
- [ ] Catalog sync must preserve locally-curated fields, and mark vanished items
      unavailable rather than deleting them.
- [ ] Owner question: when an online order arrives today, does paper come out, or does
      someone watch a screen? Printing is no longer a blocker either way.
- [ ] Settle Hosted Checkout vs the tokenising iframe before Phase 2b. Clover states
      refunds and voids are unavailable on Hosted Checkout, and a boba shop refunds
      wrong orders.
