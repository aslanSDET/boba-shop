# Prior art — what other Clover integrations already learned

Surveyed 2026-08-28. Everything in `findings.md` is something **we measured**. Everything
here is something **someone else measured**, and each item is tagged with how far we
trust it:

- **CONFIRMED** — checked against Clover's official docs or our own spike.
- **CLAIMED** — a specific, falsifiable statement in someone's production code, usually
  with the scar tissue to match. Plausible, not yet verified by us.

Nothing here has been copied into our code. This is a map of where the mines are.

## The repos worth reading

| Repo | What it is | Why it matters to us |
|---|---|---|
| [`Yipyy-Inc/puneet`](https://github.com/Yipyy-Inc/puneet) | Production Next.js app, Clover OAuth + terminals + ecommerce, actively pushed | By far the most valuable. Exhaustively commented, and the comments record *measured* failures, not intentions |
| [`mbates/clover`](https://github.com/mbates/clover) | MIT TypeScript wrapper for both Clover hosts, Aug 2026 | Confirms the two-host split and the Hosted Checkout webhook signature scheme |
| [`atinm/clover-online-orders`](https://github.com/atinm/clover-online-orders) | Source of the "Smart Online Order" WordPress plugin | The closest commercial analog to what we are building. See the architecture note below |
| [`mattlisiv/clover-api-python`](https://github.com/mattlisiv/clover-api-python) | Most-starred standalone Clover client (11 stars) | Mostly a thin v3 wrapper; low signal |

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
