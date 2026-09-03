# FAQ — for the developer, not for Claude

Answers to the questions that keep coming back up, written so you can check
this before asking again. Everything here is either a command you can run
yourself, or a pointer to the file that has the real answer.

If Claude Code changed one of these answers, it should have updated this file
in the same PR — if something below looks stale, that's a bug in the PR that
changed it, not in this file.

---

## Architecture

### Are we using Clover Hosted Checkout, or the card iframes + the v3 API?

**Iframes + the v3/v1 API. Not Hosted Checkout.**

- **Card capture**: Clover's **Elements SDK** (`clover.elements()`), which
  mounts four separate cross-origin iframes — card number, expiry, CVV,
  postal code — directly into our own checkout page
  (`src/restaurants/snowdaes/components/card-fields.tsx`). The customer never
  leaves our site.
- **Order build**: `POST /v3/merchants/{id}/atomic_order/orders` — real
  inventory ids, so Clover applies its own tax.
- **Charge**: `POST /v1/orders/{orderId}/pay` on the Ecommerce host, using the
  token Elements produced.

**Why not Hosted Checkout** (Clover redirects the customer to a page *they*
own): their own archived docs say plainly that it has **no refunds or
voids**, and that **a merchant's inventory cannot be used with it**. Both are
disqualifying for a real shop — see `PLAN.md` §"Hosted Checkout has no
refunds" if you want the exact quotes.

### The tax shown at checkout — do we calculate it, or does Clover?

**Clover. We hold no tax rate anywhere in the code.**

Every number in `subtotal - discount + tax = total` on the checkout screen
traces back to something Clover itself returned from the order it built:

```
tax = order.total − (subtotal − discount)
```

— a remainder, not a rate, because Clover's own `taxAmount` field reads
`$0.00` even on taxed orders (measured — `scripts/spike/findings.md`). Before
Clover's response lands, the tax row shows a literal `—`, never a guess. See
`readBack()` in `src/pos/clover/order.ts`.

### Where's the deep architectural reasoning — restructures, POS decisions, why things are shaped this way?

`PLATFORM.md` is the umbrella doc for "one repo, several restaurants." Read it
before touching anything structural. `PLAN.md` is Snowdaes' own plan;
`docs/ASIAN-KITCHEN.md` is Asian Kitchen's. `scripts/spike/findings.md` is
everything measured against the real Clover sandbox, including where Clover's
own docs turned out to be wrong.

### If this grows to 40 restaurants, do we still duplicate everything?

Short answer: yes for restaurant code, no for tooling that outlives any one
restaurant. Long answer — with a table of what to share and the specific
trigger for each — is `PLATFORM.md` §4b. Don't build the shared version
before its trigger fires; that section names the two failure modes on either
side of "too early."

---

## Manual operations — no Claude Code required

Everything below is a plain command or a console click. Worth knowing these
cold, because a Claude Code session running out of credits mid-task should
never mean you're stuck.

### Run a restaurant locally

```bash
npm install
RESTAURANT=snowdaes      npm run dev    # localhost:3000
RESTAURANT=asian-kitchen npm run dev    # localhost:3000, same port — one at a time
```

### Check whether a deploy succeeded

Both restaurants are AWS Amplify Hosting apps, account `003655672994`
(alias `aslansdet-bobashop`), region `us-east-1`, building from `main`.

| | App id | URL |
|---|---|---|
| Snowdaes | `d2j2i5n9o6zf7a` | https://main.d2j2i5n9o6zf7a.amplifyapp.com |
| Asian Kitchen | `d28ppkfg682mtw` | https://main.d28ppkfg682mtw.amplifyapp.com |

**Console** (easiest): sign in as `yusuf` (passkey) at
`https://aslansdet-bobashop.signin.aws.amazon.com/console` → Amplify → the
app → the `main` branch shows the last build's status directly. **Watch which
of the two AWS accounts you're in** — a second one, `341920485423`, also
displays as "aslansdet," and that mismatch alone has cost an hour before
("App not found" for no real reason).

**CLI**, if the `boba-shop` profile is configured:

```bash
export AWS_PROFILE=boba-shop
aws amplify list-jobs --app-id d2j2i5n9o6zf7a --branch-name main --region us-east-1 \
  --max-results 5 \
  --query "jobSummaries[].{id:jobId,status:status,commit:commitId,startTime:startTime}" \
  --output table
```

Swap the app id for Asian Kitchen's to check that one. `status` is one of
`PENDING` / `RUNNING` / `SUCCEED` / `FAILED`.

A push to `main` triggers a build automatically — merging a PR is enough,
nothing further to do. If a build failed, the console's build log (Amplify →
app → the failed job) is more useful than the CLI for actually reading the
error.

### Trigger a rebuild by hand, without a new commit

Console: Amplify → the app → `main` branch → **Redeploy this version**.

CLI:
```bash
aws amplify start-job --app-id d2j2i5n9o6zf7a --branch-name main \
  --job-type RELEASE --region us-east-1
```

### Change or remove HTTP Basic Auth on a deployment

Both sites currently sit behind it — Snowdaes logs in as `snowdaes`, Asian
Kitchen as `asiankitchen`. **The passwords are deliberately not written down
here or anywhere else in this repo** — this repo is public, and a basic-auth
password published in it stops doing anything the moment it's published.
It exists purely to keep an unfinished sandbox site from being crawled or
stumbled on; it is not a real security boundary and isn't meant to be one
long-term, but that's a reason to eventually remove it, not a reason to
publish it in the meantime. If you need the current password, it's wherever
you actually keep it — ask the owner if that's not you.

**This is a live, outward-facing, easy-to-forget-you-changed setting** — real
customers or a real owner could hit the site mid-change. Confirm you mean it
before running the CLI version.

**Console**: Amplify → the app → **Hosting → App settings → Access control** →
edit the branch.

**CLI** — check current state:
```bash
aws amplify get-branch --app-id d2j2i5n9o6zf7a --branch-name main \
  --region us-east-1 --query "branch.enableBasicAuth"
```

Remove it entirely:
```bash
aws amplify update-branch --app-id d2j2i5n9o6zf7a --branch-name main \
  --region us-east-1 --no-enable-basic-auth
```

Change the credentials (base64 of `user:pass`):
```bash
aws amplify update-branch --app-id d2j2i5n9o6zf7a --branch-name main \
  --region us-east-1 --enable-basic-auth \
  --basic-auth-credentials "$(printf 'newuser:newpass' | base64)"
```

Swap the app id for Asian Kitchen's the same way. **Claude Code's default
mode won't flip this one for you** even if asked — it's the kind of thing
staged and handed over rather than run directly, specifically because it's a
live, outward-facing, easy-to-forget-you-changed setting on a real customer's
site.

### What still works if Claude Code is out of credits

Everything above needs only `git`, `npm`, the `gh` CLI, and the `aws` CLI with
the `boba-shop` profile configured — none of it depends on Claude Code being
available. `git log`, `gh pr list`, and the files in this repo (this one
included) are the durable record; a Claude Code session is a way of *acting*
on that record, not where the record lives. If you're mid-task and run out:
the branch and its commits are exactly as safe as any other git state, and a
fresh Claude Code session (or you, by hand) can pick up from `git status` and
`git log` with nothing lost.

---

## Where the real credentials live

`.env.local` locally (gitignored — never commit it). In production, **SSM
Parameter Store, read at request time by the SSR compute role** — never an
Amplify environment variable, because those are baked into the build artifact
at build time and anyone with artifact access can read them. `amplify.yml`
(the header comment) has the long version of why.

---

## If something here is wrong

This file describes the system as of the date of its last edit — check
`git log FAQ.md` if something reads stale. Update it in the same PR as
whatever changes it, not as a follow-up "someday" task.
