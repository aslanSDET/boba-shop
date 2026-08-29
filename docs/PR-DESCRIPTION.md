# Snowdaes: real menu, real Clover checkout, real opening hours

Turns the local UI shell into a working proof of concept: a customer can browse
the shop's **actual** menu, build a drink, apply a discount code, pay by card,
and have the order land in Clover with the discount recorded.

**36 commits · 51 files · ~11,000 lines of hand-written code, plus 6,229 generated.**
`tsc`, `eslint` and `next build` all clean. Twelve real orders paid end to end
against a Clover sandbox merchant, totalling $385.98.

The headline is that **discount codes work**, because that is the one thing
Clover Online Ordering cannot do at all — not poorly, not with limits: the
feature does not exist. It is the reason this project is worth building.

---

## What works now

| | Before | Now |
|---|---|---|
| Menu items | 24 hand-written, invented prices | **119 imported from Clover**, 93 shown |
| Categories | 6 | **12 imported**, 11 shown |
| Modifier groups | 11 | **85** |
| Second location | — | Lowell: 122 items, 82 groups, 14 categories |
| Checkout | button hardcoded `disabled` | **Card payment through Clover** |
| Discount codes | — | **`NEWCUSTOMER`, 10%**, recorded on the Clover order |
| Opening hours | hardcoded "OPEN NOW" | **Read from Clover**, with the week on hover |
| Tax | invented 8.75% | **Clover's own rates**, 6.25% + 0.75% |

### The order flow, verified in a browser

1. Browse the real menu — 93 items, 44 with the shop's own photography
2. Open an item — required options first, "comes with" ingredients removable
3. Add to cart, apply `NEWCUSTOMER` — $11.95 − $1.20 = $10.75, ×1.07 = **$11.50**
4. Checkout — the cart is **re-priced on Clover** and its figures take over
5. Pay — Clover's own iframes, four fields, card never touches this app
6. Confirmation — pickup code, amount, masked card, auth code

---

## The decisions this settled

### `POST /v1/orders/{orderId}/pay` works, and it changes the architecture

Found in another integration's source, reported as unverified. **We verified it.**
Ecommerce host only — both platform-host variants answer `405`.

This inverts the flow: instead of Hosted Checkout creating a bare order that we
rewrite afterwards, we build the order **properly first** — inventory-linked,
with Clover applying its own tax — and then pay it. One order, correct from
birth.

It also closed a defect `findings.md` had called *"a bookkeeping defect"* for MA
meals tax: Hosted Checkout reports `taxAmount: $0.00`, while this path reports it
correctly ($2.02, $1.57, $0.49 across paid orders).

### Clover is the calculator — with one boundary that is not obvious

Clover owns **item prices and tax**. It does **not** own modifiers:
`modifications[].amount` is required and recorded without being checked. Sending
`1` for a $0.50 drizzle produced a total one cent higher, not fifty. Every
modifier price is therefore read from the merchant's own inventory at build
time — had it come from the browser, `curl` buys add-ons for a penny.

Price injection was tested directly: a body claiming `price:1, total:1,
discount:9999` came back **$12.90 → $12.43**, entirely from the server's catalog.

### Percentage discounts work, but the field is an integer

`percentage: 10` is stored as a real percentage discount, so the shop's reporting
reads "NEWCUSTOMER 10%" rather than an opaque dollar figure. **`12.5` silently
truncates to `12`.** Anything not a whole percent falls back to explicit cents.

### The integration stays small, and now there is a record of why

The most complete public Clover integration found is **7,210 lines across 22
modules**. Ours is **1,114 across 4**. Their weight comes from being
multi-tenant, being a Clover reseller with an underwriting pipeline, driving
countertop hardware, and being the system of record. None of that is ours.
`PLAN.md` carries the comparison so the next scope argument has an answer.

---

## Bugs found and fixed along the way

Most were invisible until real data arrived.

- **Tax was 8.75%** — a placeholder from before the catalog existed, overstating
  every order by 1.75 points. The real rate is 7%.
- **Eight items rendered `$0.00`** — shaved snow prices live in a required "Snow
  Size" group. Tiles now show `from $9.25`.
- **Two of three promo cards emptied the grid** — they held category ids from the
  hand-written menu. Resolved by name now, because Clover's ids change on
  re-import.
- **Forty photoless items drew the same brown boba cup** — Kiwi and Vanilla
  Milkshake both rendered as milk tea.
- **The category rail hid its first pills** — `justify-center` on an overflowing
  scroller pushes them past `scrollLeft: 0` where nothing can reach them.
- **The hero wordmark was 899px of unbreakable text** from a 640px breakpoint.
  Reported twice as a regression; it had never been fixed, and the breakage band
  is non-monotonic, so the same build looked fine on one monitor and broken on
  another.
- **The modifier parser misread radio groups** — "No Ice" in `[Extra Ice, Lite
  Ice, No Ice]` is a choice, not a removal.
- **ngrok returned 403 on everything** — `next dev` refuses cross-origin dev
  resources, which reads as "nothing is clickable" rather than a network refusal.
- **Card validation was invisible** — Clover validates inside its own iframe and
  reports through an event nobody was listening to.

---

## What is missing

### Blocking a real launch

- **No persistence.** Deliberate — no AWS, no DynamoDB. Clover holds the orders.
  A customer cannot see order history and we have no customer list yet, which is
  half the marketing pitch.
- **No auth.** Clerk is planned, not started. Checkout is guest-only.
- **No webhook.** If a customer's phone dies between paying and the confirmation,
  nothing reconciles it. Clover has **two** webhook systems with completely
  different auth — only the Hosted Checkout one is signed.
- **The checkout API is unauthenticated and unthrottled.** Correct that anyone can
  buy; a rate-limiting question, not an access one, but someone could spam order
  creation on the shop's account.
- **No automated tests.** Verification has been manual and by script.

### Needs the shop, not code

- **Does a coded order print?** `print_event` returns `400 "The default printing
  device is missing"` on a sandbox merchant — the route and permission are
  proven, the ticket is not. **Downgraded from a blocker**: across nine surveyed
  integrations, *none* call `print_event`; they push an open order and use a
  second channel as the backstop.
- **How often do they refund?** Clover states refunds and voids are unavailable
  on Hosted Checkout. This decides the payment path.
- **Asset licensing.** 44 product photos and the penguin mark are the shop's,
  used without written sign-off.
- **The three testimonials are invented**, attributed to people who do not exist.
  **These cannot survive going public** and should be deleted or replaced.

`docs/OWNER-ASKS.md` is the handout for that conversation.

### Known rough edges

- Promo cards under the hero clip their bottom text.
- `isPopular` is false for all 93 items, so the POPULAR badge is dead code.
- "Ready in 15–20 min" is hardcoded — deliberately: Clover returns no prep time
  and this is the owner's own figure.
- Ice Cream is four size-named items ("Kiddie - Ice Cream"), and two names carry
  a trailing `*`. That is the shop's data, and a tidy-up for them.
- The shop has **two items called "Lychee"** — a $1.75 topping and a $6.45 drink.
  The catalog resolver refuses to guess rather than selling the wrong one.

---

## Notes for review

- `src/config/menu.*.generated.ts` (6,229 lines) is **generated** by
  `scripts/import-menu.mjs`. Do not review line by line; review the importer.
- `scripts/spike/` is a throwaway harness kept because each script documents what
  it proved. `findings.md` holds our measurements; `prior-art.md` holds what nine
  other integrations taught us, tagged CONFIRMED vs CLAIMED.
- Sandbox only. Nothing here has touched a production Clover merchant, and the
  scripts refuse to.
- `.env.local` is gitignored and no credential appears in any tracked file.
