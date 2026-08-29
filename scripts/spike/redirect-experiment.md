# Can Clover own the payment? — the redirect experiment

**Branch:** `redirectExperiment` · **Run:** 2026-08-29

> ## ⚠ CORRECTED — the first verdict was wrong
>
> My first pass concluded "Hosted Checkout has no calculation engine". **That was my bug,
> not Clover's.** I put `taxRates` on `shoppingCart`; the documented place is
> **`shoppingCart.lineItems[].taxRates`**. Moved there, Clover computes the tax on its own
> page, correctly, every time.
>
> `findings.md` carries the same wrong claim from an earlier session and is corrected too.
> Everything below the first section is the rerun.

## Verdict: the redirect works, and it is a genuine contender

## What was being tested

The Shopify pattern, as seen on `checkout.directtoolsoutlet.com`: cart on our site, then
hand the customer to a payment page the vendor hosts, then take them back.

Clover does offer this. `POST /invoicingcheckoutservice/v1/checkouts` returns a URL and
the customer pays there. The prize was never simplicity for its own sake — it is that
**Snowdaes stays self-sufficient after setup**. If we never touch a card, a Clover change
to card handling cannot page anyone at 2am, and the worst failure becomes a stale menu
rather than a lost sale.

## Hypotheses and results

| | Hypothesis | Result |
|---|---|---|
| **H1** | Hosted Checkout accepts a discount | **FAIL** — accepted with `200`, then silently ignored |
| **H2** | It accepts redirect URLs so the customer returns to us | Accepted, **not echoed back**; unverified without a real payment |
| **H3** | It will charge a tax figure we compute | **PASS mechanically** — a positive "Tax" line is charged, but recorded as a *product* |
| **H4** | The bare order can be repaired after payment | **PARTIAL** — lines and discount can be added; **`taxAmount` stays $0.00** |
| **H5** | It can be pointed at an order we already created | **FAIL** — no `orderId` binding of any shape |
| **H6** | `itemRefUuid` links a line to real inventory | **PASS for identity, FAIL for arithmetic** |

## The measurements that decide it

**A discount is accepted and ignored.** Sent `lineItems[].discounts: [{name:"NEWCUSTOMER",
percentage:10}]` on a $11.95 item with a $0.75 tax line. Expected $11.50. The page rendered:

```
Thai Dye — Large   $11.95
Tax (MA meals 7%)   $0.75
Tax                 $0.00
Total              $12.70      <- the discount did nothing
```

Same failure mode as `taxRates` in `findings.md`: the field is accepted, stored nowhere,
and changes nothing. **Two ways of expressing a discount return `400` outright** — a
top-level `shoppingCart.discounts` array, and a negative line item (*"Line item prices
should be positive"*). So there is no shape that works.

**`itemRefUuid` is real, and it is not enough.** An error message gave it away — *"Please
provide either itemRefUuid or name, price."* Passing an inventory id alone returns `200`
and the page renders the correct name and price straight from the merchant's catalog. But:

```
Snow - Small   $7.75
Tax            $0.00
Total          $7.75      <- inventory-linked, and still no tax
```

So **Hosted Checkout has no calculation engine at all.** Not "ignores tax rates you send" —
it will not compute tax even for an item it looked up in the merchant's own inventory. It
renders what it is handed and charges the sum.

**Repair after the fact gets two of three.** On a paid, locked Hosted Checkout order:

- add an inventory-linked line → `200`
- add a real `NEWCUSTOMER 10%` discount → `200`, and it shows in the order's discounts
- `total` stays pinned to the payment → as expected
- **`order.taxAmount` and `payment.taxAmount` stay `$0.00`** → not repairable

The tax was never collected *as tax*, so nothing added later can make it one.

## What this means for Snowdaes

The redirect pattern **works as a way to take money**. The customer is charged the right
amount either way, because we can always bake tax and discount into the line prices.

What it costs is the shop's own records:

- **The meals tax never appears as tax.** Clover's tax reporting shows `$0.00` on every
  online order, permanently, with the tax sitting in a line item called "Tax". That is an
  accounting problem for the owner and her accountant, not a cosmetic one.
- **A discount is either invisible** (baked into a lower line price, so Clover records a
  mysteriously cheap drink) **or bolted on afterwards** by an API call — which puts us
  back in the business of calling Clover after a payment, which is the thing the redirect
  was supposed to avoid.

That last point is the sharpest. **The redirect does not actually remove the on-call
surface — it moves it.** To get a correct record we still have to call Clover after the
payment lands. The difference is that failure is now degraded data rather than a failed
sale, which is genuinely better, but it is a smaller win than it looked.

## The honest comparison

| | Static link-out | Cart + redirect | Full integration (on `menuImprove`) |
|---|---|---|---|
| We touch a card | no | no | **yes** |
| Customer charged correctly | n/a | yes | yes |
| Tax recorded as tax | n/a | **never** | **yes** — measured $2.02, $1.57, $0.49 |
| Discount recorded as a discount | n/a | only by a later API call | yes, at the moment of sale |
| Can page you at 2am | nothing | menu sync, post-payment repair | menu sync, cards, tokens, order |

## Recommendation

**Do not ship the redirect as a way to avoid owning the payment.** It does not buy what it
looked like it bought, and it breaks the shop's tax reporting to get there.

The decision is now genuinely two-way, and it is a business call rather than a technical
one:

- **If the marketing engine matters** — discount codes, a customer list — the full
  integration is the only path where a discount is a real recorded discount and the meals
  tax is right. That is `menuImprove`, and it works today.
- **If maintenance is the overriding concern**, the honest answer is not this middle
  option but the **static link-out**: zero API surface, nothing to break, and no tax
  problem because Clover's own ordering page handles the whole sale. The cost is that
  there is no cart and no discount code, which is the entire reason to build anything.

One thing worth confirming with the owner before closing this off: **how their meals tax
is filed today**, and whether a `$0.00` tax figure on online orders would actually cause
her a problem. If her accountant computes it from gross sales anyway, the strongest
objection here weakens considerably.

---

# Rerun, after finding the real field

## The mistake

`taxRates` belongs on **each line item**, not on the cart. Clover's docs say so plainly:

> "Hosted Checkout requests are not linked to the merchant's Clover inventory, so any
> default tax configuration is not applied. The tax is included on any applicable line
> items in the request."

Sent at cart level it is ignored silently — which is what produced the wrong verdict.
Sent per line, with `{name, rate}` matching a rate the merchant already has on file, it
works. Rates are the same scale as the Platform API: 6.25% is `625000`.

An `id`-only reference is refused — `"Rate map missing tax summary rates"` — so the name
and rate must both be sent.

## What actually works

| Sent | Rendered on Clover's page |
|---|---|
| `lineItems[].taxRates` = MA Meals 6.25% + Local 0.75% on a $11.95 line | Subtotal **$11.95** · Tax **$0.84** · Total **$12.79** |
| Same, with the discount already applied to the price and named in the line | Subtotal **$10.75** · Tax **$0.75** · Total **$11.50** |
| `itemRefUuid` (inventory id) + `taxRates`, no name or price sent | **Snow - Small** · $7.75 · Tax **$0.54** · Total **$8.29** |

So the redirect path can do all of this:

- **Clover computes the tax**, on its own page, and shows it as tax — not as a product line.
- **Line items reference real inventory** by `itemRefUuid`, and Clover pulls the name and
  price from the merchant's own catalog. Send neither name nor price and it still renders
  correctly — the catalog is the source of truth, exactly as it should be.
- **The right total is charged with a discount applied**, and the discount is *visible* in
  the line name: `Thai Dye — Large (NEWCUSTOMER 10% off)`.
- **Google Pay appears on the page for free.** We would not have to build wallet support,
  domain-verify with Apple, or maintain any of it.
- **We never touch a card.** No iframes, no SDK, no tokens, no PCI surface at all.

## What is still lost

**A discount is not a structured discount.** `lineItems[].discounts` is accepted with a
`200` and silently ignored — confirmed twice, once alongside working tax rates. The two
other shapes are refused outright: a cart-level `discounts` array, and a negative line
item (*"Line item prices should be positive"*).

So a promo has to be applied to the price before sending, with the reason in the line name.
Clover's reporting will show a $10.75 line called "Thai Dye — Large (NEWCUSTOMER 10% off)"
rather than a $11.95 line with a 10% discount attached to it. Legible to a human reading a
receipt or an order; not a field anyone can total up.

**Still unproven: what the paid order records.** The page shows tax correctly, but whether
`order.taxAmount` and `payment.taxAmount` come back non-zero needs an actual payment, which
needs a card. **This is the one remaining question, and it is the one that decides it** —
if `taxAmount` populates on this path, the redirect loses almost nothing.

## Where this leaves the decision

The comparison is much closer than the first pass suggested.

| | Cart + redirect | Full integration (`menuImprove`) |
|---|---|---|
| We touch a card | **no** | yes |
| Tax computed by Clover | **yes** | yes |
| Inventory-linked lines | **yes**, via `itemRefUuid` | yes |
| Discount as a structured record | no — a line-name convention | **yes** |
| Apple/Google Pay | **free** | ours to build |
| Refunds | unavailable on this path per Clover's docs | via `/v1/refunds` |
| On-call surface | menu sync only | menu, cards, tokens, order |

**The redirect is now the better default for Snowdaes**, unless one of two things is true:
the owner refunds often enough that Hosted Checkout's missing refunds hurt, or she needs
discount usage as a number she can total rather than a label she can read.

Both are questions for her, not for us. And the wallets alone — Google Pay showing up
without us doing anything — are worth real money on a phone-heavy dessert menu.

## Next test

Pay one of these sessions with a sandbox card and read back `order.taxAmount` and
`payment.taxAmount`. That single number decides the architecture.
