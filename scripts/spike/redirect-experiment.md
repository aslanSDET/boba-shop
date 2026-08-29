# Can Clover own the payment? — the redirect experiment

**Branch:** `redirectExperiment` · **Run:** 2026-08-29 · **Verdict: the thesis fails, but
not for the reason I expected.**

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
