# Review of `geminiResearch.md`

Checked 2026-08-30 against what this project has actually measured against a live Clover
merchant. **The document is largely right, and its core recommendation matches what we
independently built.** The corrections below are mostly about confidence and omissions
rather than errors.

## What it gets right — and we can confirm empirically

| Claim | Our measurement |
|---|---|
| §7.2 "When the Lambda submits `atomic_order` containing valid Clover `item.id` values, Clover calculates state (6.25%) and local meals tax (0.75%) automatically" | **Confirmed.** Two $6.45 items came back at **$13.81** — exactly ×1.07, applied by Clover unprompted |
| §7.4 Two-step: create atomic order, then `POST /v1/orders/{orderId}/pay` with the `clv_` token | **Confirmed**, and we found the constraint it does not mention: **Ecommerce host only.** The same path on the platform host answers `405` |
| §7.1 Item and modifier ids must be Clover's own | Confirmed — our importer keys `MenuItem` on `cloverItemId` for this reason |
| §7.1 Money in integer cents | Confirmed throughout |
| §4.1 Iframe = SAQ A, raw PAN = SAQ D | Matches Clover's docs |
| §2.2 "The kitchen printer is non-negotiable" | Consistent with everything we found, **though see the caveat below** |

The architecture it recommends — Next.js front end, DynamoDB menu cache, atomic order,
then `/pay` — is the architecture on `menuImprove`. Two independent routes to the same
answer is worth something.

## Where it is wrong or overstated

**§4.1 "Hosted Redirect … drops auto-tax calculation → Avoid for Restaurants."**
Not quite. Hosted Checkout **will** compute tax if `taxRates` is sent on each **line item**
(not on the cart, which is silently ignored — that mistake cost us a wrong conclusion too).
Measured: an $11.95 line rendered *Subtotal $11.95 · Tax $0.84 · Total $12.79* on Clover's
own page. It also accepts `itemRefUuid` to pull name and price from the merchant's
catalog. The verdict "avoid" may still be right, but the stated reason is not the reason.

**§4.2 "Embedding Clover's Iframe SDK handles credit cards and native Apple Pay / Google
Pay out of the box."** Overstated. Clover's own docs require **domain verification** for
Apple Pay on the iframe — hosting a file at
`/.well-known/apple-developer-merchantid-domain-association`. Not out of the box. Mildly
ironic: we observed **Google Pay appear on the hosted checkout page for free**, which is
the option the document tells you to avoid.

**§7.3 Discounts.** The `{"name": …, "amount": -150}` form is correct and we proved it. But
`percentage` also works and produces a better record — the shop's reporting reads
"NEWCUSTOMER 10%" rather than an opaque dollar figure. The document does not mention it,
and therefore also does not mention the trap: **`percentage` is an integer.** `12.5`
silently truncates to `12` — no error, wrong discount, wrong record.

**§4.3 "Audited Real-World Proof."** Partially verified. `localsonly311.com` does serve
Popmenu — that checks out. But `checkout.clover.com/sdk.js` does **not** appear in the
served HTML; it would be injected at checkout time, so the specific claim about the iframe
was not confirmed from the outside. Reasonable inference, thinner evidence than "audited"
implies.

## What it misses, and one of them matters

**The SDK is unversioned, and it moves.** The document recommends
`https://checkout.clover.com/sdk.js` without noting there is no version in that URL. Checked
directly:

```
last-modified: Thu, 30 Jul 2026 04:10:41 GMT
cache-control: public, max-age=3600
```

**Modified a month ago, cached for one hour.** So Clover does ship changes to it, and every
customer's browser picks them up within the hour, with no version for us to pin. Compare
`/v3/merchants/{mId}/atomic_order/orders`, which is versioned and which a 2016 WordPress
plugin still calls successfully. That asymmetry is the single biggest maintenance fact
about the recommended architecture and the document does not mention it.

**April 2026 introduced a breaking change.** A `User-Agent` header is now required on all
Clover HTTP requests. We comply; the document does not raise it.

**Clover states refunds and voids are unavailable on Hosted Checkout.** A material point
either way, missing from §4.1.

**Modifier prices are taken on trust — this is the security gap.** §7.2 says Clover
calculates tax automatically, which is true, and it is easy to read that as "Clover
computes the money." It does not. `modifications[].amount` is **required**, and Clover
records whatever you send **without checking it against inventory**. Measured: sending `1`
for a $0.50 drizzle produced a total one cent higher, not fifty. If that number ever came
from the browser, `curl` buys add-ons for a penny. The document's §8 blueprints should say
so explicitly.

**`order.taxAmount` is `$0.00` even when tax was charged.** The real figure lives on
`payment.taxAmount`. Anything reconciling against the order will read zero.

## Verdict

**Trust the architecture, verify the details.** Its recommendation is sound and matches
what we built independently. Its per-field specifics are right more often than not, but it
is written with more confidence than its evidence supports in two places — the "out of the
box" wallets and the "audited" proof — and it omits the unversioned-SDK risk, which is
precisely the thing a shop with no technical staff would be exposed to.

It is a good map. It is not a substitute for having run the calls.
