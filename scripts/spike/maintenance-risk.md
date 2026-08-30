# How fragile is any of this, really?

Researched 2026-08-30, because the deciding question for Snowdaes is not what is possible
but **what will still work in a year with nobody watching it.**

Two things we would own on the full-integration path: **atomic orders** and **Clover's
card-field iframes**. They turn out to have very different risk profiles, and the
difference is not the one I expected.

## Evidence 1 — nine months of a real production integration

`../clover-reference/puneet` has run Clover in production since November 2025.

```
commits touching src/lib/clover/      42
  of which fixes                      14
commits describing Clover breaking    0
```

Per file, over that whole period:

| File | Commits |
|---|---|
| `orders.ts` (atomic orders) | **1** |
| `webhook.ts` | 1 |
| `vault.ts` | 2 |
| `charge.ts` | 6 |
| `terminal.ts` | 6 |

**`orders.ts` was written once and never touched again.** Atomic orders are the most
stable thing in that codebase.

And all fourteen fixes are their own bugs, not Clover moving:

> a single-pay token cannot be spent twice · a payment that failed is not money to attach ·
> two customers paying at once took a facility's card payments offline · three lookups in
> parallel were rate-limited · the stored Clover token expiry was 57 years out

Concurrency, reconciliation, a date-parsing slip. **Not one is "Clover changed and broke
us."** That is the single most reassuring number in this whole survey.

Their card-field components tell the same story: **5 commits, all features**, over three
weeks of active building, then untouched.

## Evidence 2 — Clover's own change cadence

The public changelog runs at roughly **one update every one to three months**, and the
entries are categorised *Added*, *Fixed*, *Improved*. Across the visible two years there
is no *Removed*, *Deprecated* or *Breaking* category at all.

Examples of what a typical update is: a `stockAlertThreshold` field added to item stock;
`GetPayments` restricted to a 90-day window without a date filter; an intent name
corrected to `save_credentials_on_file`. Additive, or narrow.

**One genuinely breaking change in that period**, April 2026:

> you must now include a `User-Agent` header in all HTTP API requests

It applies to everything — orders, ecommerce, hosted checkout, the iframe. **We already
comply** (`snowdaes-poc/1.0` in `src/lib/clover.ts`), and a request without one is still
accepted today, so it is not yet enforced. Worth knowing that we got that for free rather
than by foresight.

## The asymmetry that actually matters

This is the finding I would not have guessed:

| | Versioned? | What that means |
|---|---|---|
| **Atomic orders** | **Yes** — `/v3/merchants/{mId}/atomic_order/orders` | Clover can ship a v4 beside it. A v3 call keeps working. The 2016 WordPress plugin in our reference clones still calls v3 |
| **Card-field SDK** | **No** — `https://checkout.clover.com/sdk.js` | One unversioned URL, fetched fresh by every customer's browser. Whatever Clover puts there is what runs |

**The API is versioned. The SDK is not.** That is the real fragility difference, and it
runs opposite to intuition: the thing that looks like plumbing is the stable half, and the
thing that looks like a simple drop-in script is the one with no version to hold onto.

To be fair to it: an unversioned SDK is also how Stripe and every other processor ships
card fields, and they are strongly motivated not to break the thing that takes money. But
it is a dependency we cannot pin, cannot test ahead of, and would find out about from a
customer.

## What breaks, and how loudly

| If this breaks | Symptom | Who notices |
|---|---|---|
| Catalog sync | Menu goes stale | Nobody, for a while |
| Atomic order create | Paid order with no ticket | Staff, that shift |
| **Card-field SDK** | **Nobody can pay** | **Every customer, immediately** |
| Hosted Checkout page | Nobody can pay | Every customer, immediately — **but it is Clover's page and their emergency** |

That last row is the honest case for the redirect. It does not reduce the number of things
that can break so much as **change whose phone rings**. If Clover's own checkout page goes
down, Clover fixes it and the shop's own ordering page is down too, so nobody blames the
website. If our SDK integration breaks, it is our problem at 9pm on a Saturday.

## Where I would land, with the uncertainty stated

**Atomic orders are not the risk.** One commit in nine months, a versioned endpoint, and a
2016 plugin still calling the same version. Whatever we decide about payment, building the
order ourselves is the low-maintenance half.

**The iframe is a modest but real ongoing exposure** — not because it churns (5 commits,
then nothing) but because it is unversioned and its failure is total and immediate.

**What I still do not know**, and would want to before treating this as settled:

- Whether Clover has ever actually broken `sdk.js` in a way that hurt integrators. I found
  no reports, but absence of reports is weak evidence.
- What Clover's support response time looks like when something does break, which matters
  more than frequency for a shop with no technical staff.
- Whether the 90-day `GetPayments` restriction has a sibling anywhere we depend on.

One production integration and a public changelog is a thin evidence base. It points
clearly, but it is two data points, and I would not bet the shop's Saturday on it without
saying so.
