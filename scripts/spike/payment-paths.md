# How to take the money: three paths, measured

**Question asked:** can Snowdaes avoid us handling card payments, so the shop stays
self-sufficient after setup and nobody gets called at night when something changes?

**Answer:** yes, there is a real alternative, and it is in production elsewhere. It costs
one thing that matters — the discount record — and gains one thing that matters — no
unpinnable script in our checkout. Both halves are now measured rather than assumed.

Run 2026-08-29/30 against sandbox merchant `4XKCZA8Z277R1` on branch `redirectExperiment`.
Everything below is either a measurement or a labelled unknown.

---

## First, the vocabulary — because I kept confusing it

Clover has **two APIs**, and the payment options are not versions of each other.

| | Host | What it does |
|---|---|---|
| **Platform API** `/v3/…` | `api.clover.com` | Menu, inventory, tax rates, orders, opening hours, printing |
| **Ecommerce API** `/v1/…` | `scl.clover.com` | Charging a card, hosted checkout sessions |

`/v3` is used in every option — it is how we read the menu. The choice is only about
**how the card gets charged.**

## The three paths, as actual calls

**Option A — link out** *(what Snowdaes does today)*
```
customer leaves the site → cloveronline.com
```
Zero API calls at checkout. No cart, no discount codes.

**Option B — iframe** *(built, on `menuImprove`)*
```
GET  /v3/merchants/{id}/items                  Platform   read the menu
POST /v3/merchants/{id}/atomic_order/orders    Platform   create the order — Clover taxes it
     checkout.clover.com/sdk.js                SDK        card fields, on OUR page
POST /v1/orders/{id}/pay                       Ecommerce  charge the clv_ token
```

**Option C — redirect** *(tested here)*
```
GET  /v3/merchants/{id}/items                        Platform
POST /invoicingcheckoutservice/v1/checkouts          Ecommerce  → returns a URL
     customer pays on Clover's page, returns to us
     (Clover creates its own order; we never call atomic_order)
```

---

## What each path actually does, measured

| | A | **B — built** | **C — tested** |
|---|---|---|---|
| Real payments taken end to end | — | **12** ($385.98) | **0** — see *Blocked* below |
| Clover computes tax | n/a | ✅ $12.90 → **$13.81** (×1.07) | ✅ $11.95 → Tax **$0.84** → $12.79 |
| `payment.taxAmount` | n/a | ✅ $0.88 / $0.74 / $0.49 | **unknown** |
| `order.taxAmount` | n/a | **$0.00 always** | **unknown** |
| Discount as a structured record | ✗ | ✅ `NEWCUSTOMER 10%` on the order | ✗ **silently ignored** |
| Inventory-linked lines | n/a | ✅ | ✅ via `itemRefUuid` |
| Refunds | Clover's own | ✅ `/v1/refunds` | ✗ Clover's docs say unavailable |
| Google Pay | n/a | ours to build | ✅ **free on their page** |
| Loads the unversioned SDK | ✗ | **✅** | ✗ |

### The three C findings worth keeping

**Tax works — I had this wrong first time.** `taxRates` must go on
**`shoppingCart.lineItems[].taxRates`**, not on `shoppingCart`. At cart level it is
accepted and silently ignored, which is what produced an earlier wrong conclusion that
"Hosted Checkout has no calculation engine". Sent per line with `{name, rate}` matching a
rate the merchant already holds, Clover computes it on its own page. Rate scale is the
same as `/v3`: 6.25% is `625000`. An `id`-only reference is refused —
*"Rate map missing tax summary rates"*.

**`itemRefUuid` links a checkout line to real inventory.** Undocumented in the page I was
reading; found because an error message named it. Send the inventory id alone — no name,
no price — and Clover renders both from the merchant's own catalog.

**Discounts cannot be expressed.** Three shapes tried:
`lineItems[].discounts` returns `200` and does nothing (confirmed twice, including
alongside working tax rates); a cart-level `discounts` array returns `400`; a negative line
item returns `400 "Line item prices should be positive."` The workaround is to apply the
discount to the price and put the reason in the line name — Clover then taxes the
discounted figure correctly ($11.95 → $10.75 → **$11.50**), and the receipt reads
`Thai Dye — Large (NEWCUSTOMER 10% off)`. Legible to a person; not a field anyone can total.

---

## Who actually runs each option — exact sites, verified in a browser

**Method note first, because it changed the answer.** These were initially checked with
`curl` and I published the wrong conclusion. Popmenu sites are client-rendered: `curl` gets
a 107 KB shell where the browser renders 312 KB, and the Clover configuration is entirely
in the part `curl` never receives. **Everything below was re-checked by loading the page
and reading the rendered DOM.**

### Option B — custom storefront, Clover iframe takes the card

| Site | Evidence |
|---|---|
| **localsonly311.com/menu** | Rendered DOM: `"cloverSdkUrl":"https://checkout.clover.com/sdk.js","env":"production"` and `"clover_menu_sync":true`. Platform: Popmenu |
| **801chophouse.com/menus** | Same: `cloverSdkUrl` → `checkout.clover.com/sdk.js`, `clover_menu_sync: true`. Platform: Popmenu |
| **elpatroncuisine.com/store** | Direct tag: `<script src="https://checkout.clover.com/sdk.js" id="woocci_clover-js">`. WordPress 6.8.8 + WooCommerce 6.8.3 + `woo-clover-gateway-by-zaytech` + `clover-online-orders` |

**The strongest fact here is not the three restaurants — it is Popmenu.** `cloverSdkUrl`
sits in their `menuConfig` alongside `authorizePaymentUrl` and `cloudflareUrl`. It is
platform configuration, shipped to every merchant, with a per-merchant `clover_menu_sync`
flag. A restaurant-tech company serving thousands of US independents has built its Clover
integration on exactly the script we are using.

### Option A — link out to Clover's own ordering page

| Site | Evidence |
|---|---|
| **sophiascafepdx.com/store** | Links to `clover.com/online-ordering/sophias-cafe-woodburn`, button labelled "Clover Online Ordering". Also carries Zaytech's `moo-OnlineOrders` plugin, so it has Option-B machinery installed but does not appear to use it |
| **southernspicela.com/store** | Links to `clover.com/online-ordering/SouthernSpiceLA` |

Worth noticing: **two real Clover restaurants chose the simplest option.** Neither was
offered as evidence for it.

### Could not verify

| Site | Why |
|---|---|
| **cleo.popmenu.com** | JavaScript execution not permitted on that domain by the browser extension |
| **sweenzkitchen.com** | Returns 0 bytes to every request. Appears offline |

### Option C — nobody found

No site was located using Clover's Hosted Checkout redirect for restaurant ordering. The
one production Hosted Checkout integration read in full — `Ooak21/rekindlemarriage.com`,
`convex/clover.ts` — sends **one line item with a pre-computed figure and no tax or discount
fields at all**, carrying its own order reference in the line's `note` for reconciliation.
Its comment also records that **Hosted Checkout returns no `clv_` token**, so a card used
there cannot be reused later.

---

## Maintenance: what can change underneath each

**Nine months of a production Clover integration** (`Yipyy-Inc/puneet`, Nov 2025 – Aug 2026):

```
commits touching src/lib/clover/     42
  of which fixes                     14
commits describing Clover breaking    0
orders.ts (atomic orders)             1 commit, ever
```

All fourteen fixes are their own bugs — concurrency, reconciliation, a token expiry parsed
57 years out. **None is "Clover changed and broke us."**

**Clover's changelog** runs about one update every one to three months, categorised *Added
/ Fixed / Improved*. No *Removed*, *Deprecated* or *Breaking* category appears across the
visible two years. **One genuinely breaking change**: April 2026 made a `User-Agent` header
mandatory on all requests. We already send one (`snowdaes-poc/1.0`) and it is not yet
enforced.

**The asymmetry that matters:**

| | Versioned? |
|---|---|
| `/v3/merchants/{id}/atomic_order/orders` | **Yes.** A 2016 WordPress plugin still calls v3 successfully |
| `checkout.clover.com/sdk.js` | **No.** `last-modified: Thu, 30 Jul 2026`, `cache-control: max-age=3600` |

The SDK has no version to pin, changed a month ago, and every browser picks up changes
within the hour. **But there is no evidence it has ever broken anyone** — I found no
reports, the production integration's card-field components took 5 commits then went quiet,
and this is how Stripe, Square and Braintree all ship card fields. *Unpinnable with a total
failure mode* is accurate; *fragile* is not supported.

What the redirect changes is **whose phone rings**. If Clover's own page breaks, that is
Clover's emergency and the shop's existing ordering is down too. If our SDK integration
breaks, it is ours on a Saturday.

---

## Blocked, and it is the one number that would settle this

**Nobody has paid a Hosted Checkout session end to end**, so we do not know what the
resulting order records. The page displays tax correctly; the page is not the record.

It could not be automated: Clover's card fields on the hosted page are **cross-origin
iframes that do not appear in the accessibility tree at all**. Element refs, raw
coordinates and viewport-scaled coordinates all failed. That is the isolation working as
designed, and it means the test needs a person for sixty seconds.

To finish it: pay a session created with `lineItems[].taxRates`, then read back
`order.taxAmount` and `payment.taxAmount`. **If `payment.taxAmount` populates, Option C
loses almost nothing but the discount record.**

---

## Where this leaves the decision

**Option B is proven, ours, and in production elsewhere.** Twelve real payments, correct
tax, a discount Clover records as a discount, refunds available — and Popmenu runs
thousands of restaurants on the same script.

**Option C is real and lighter, with two known costs**: no discount record, and no refunds
per Clover's own documentation. Its deciding measurement is not taken.

**Option A is what two of the surveyed restaurants actually do**, and it remains the honest
answer if maintenance outweighs everything — zero API surface, nothing to break.

The choice is not technical any more. It turns on two questions for the owner:

1. **How often do they refund?** Clover states refunds are unavailable on Hosted Checkout.
2. **Do they need discount usage as a number they can total, or a label they can read?**

Everything else is now measured.
