# What we need from Snowdaes

A working handout for the owner conversation. Two things only they can give us:
**two credentials**, and **answers**. Everything else we can do ourselves.

> **The sandbox is ours, not theirs.** We build against a free Clover developer
> test merchant that has no connection to Snowdaes, already loaded with a faithful
> copy of their menu — 118 items, 12 categories, 85 modifier groups, 1,064
> modifiers. The owner does not touch it and does not need to know it exists.
> Nothing below is about the sandbox.

---

## Part 1 — The two credentials

Both are self-serve from the owner's own Clover dashboard, behind their own login.
**No developer account, no app, no approval queue, no Clover salesperson.** This is
the part that was feared to be a six-week unknown and turned out to be a form.

**Prerequisite: two-factor authentication must be switched on** for their Clover
login, or the API-token screens do not appear at all.

### A. Merchant API token — reads the menu, writes the order

Dashboard → **Settings** → **View all settings** → **Business Operations** →
**API tokens** → create a token.

Scope it to exactly these, and nothing more:

| Permission | Why |
|---|---|
| Inventory — **read** | Pull the live menu, prices and modifiers |
| Orders — **read + write** | Create the order the kitchen sees |
| Payments — **read** | Reconcile what was actually taken |
| Merchants — **read** | Tax rates and store details |
| Print — **write** | Fire the kitchen ticket |

> A token that can *create orders* **and** *print* is the one credential capable of
> putting fake tickets into a live kitchen. It is worth saying out loud that we
> understand that, and that it lives in AWS secrets and never in the website.

### B. Ecommerce API token — charges the card

Dashboard → **Settings** → **Ecommerce** → **Ecommerce API Tokens** → create,
integration type **Hosted Checkout**.

> ⚠️ **Ask before generating this one.** Only **one** Ecommerce token exists per
> merchant account. If the shop already uses it for something, generating a new one
> may break whatever that is. Find out first.

### C. And it is two of everything

Billerica and Lowell are **separate merchant accounts**, so this is **two sets of
credentials**, gathered twice. Confirm they have logins for both.

---

## Part 2 — The blocking questions

Ordered by what they unblock. The first four decide code we would otherwise write twice.

### How an order reaches the kitchen today  *(decides the whole fulfilment design)*

1. **Walk me through what happens when an online order comes in right now.** Does
   the Clover Station beep? Does somebody have to be watching it?
2. **Does a kitchen ticket print by itself, or does staff press print?**
3. Is there a printer in the back, or does everything print at the counter? Any
   kitchen display screen?
4. If a new website sent orders to that same printer, would that be better or worse
   than what you have now?

> **Why this matters more than it looks.** We surveyed nine public Clover
> integrations, including three real restaurants. **Not one of them uses Clover's
> print API.** They push the order and let it appear in the Orders app, with a text
> message as the real backstop. So if paper already comes out on its own, we write
> less code and carry less risk. If it does not, we need to know now.

### Refunds  *(decides how we take the money)*

5. What is your refund policy, and who handles a refund today?
6. **Roughly how often — daily, weekly, rarely?**

> Clover's own documentation says refunds and voids are **not available** on the
> simpler of the two payment methods. A shop that refunds often pushes us to the
> other one, which is more work but keeps refunds where staff already do them.

### The menu  *(decides how much of it we rebuild)*

7. Is the Clover menu **current and correct** — prices, what is out of stock, what
   you have stopped selling?
8. You have two items both called **"Lychee"** — a $1.75 topping and a $6.45 drink.
   Intentional?
9. Do people buy **toppings on their own** ($1 almonds, $1.25 blue crystal boba), or
   are those only ever added to a drink? *(Decides whether the website shows a
   Toppings section at all.)*
10. Billerica has 119 items, Lowell 122, sharing 104. Should the site show **each
    store its own menu**, or is one of them the "real" one?
11. Do prices differ between the two stores?

### Money and tax

12. Every item carries two tax IDs — MA state meals tax plus the local option meals
    tax? Both apply to everything?
13. Do you want a **tip prompt** on online orders? What do you use now?

---

## Part 3 — Permission, not information

Things we are currently using without explicit sign-off, and should not launch with.

14. **Product photography.** We have 44 photos pulled from your Clover menu. Are
    they yours to license, and may we use them? *(Some may belong to a photographer
    or a franchise.)*
15. **The penguin logo and brand marks** — same question.
16. **Reviews.** The site currently shows three placeholder testimonials that are
    **invented** and attributed to people who do not exist. We need real,
    permissioned reviews or we delete the section. This one is not negotiable
    before anything goes public.
17. Who owns **snowdaes.com**, and who has the registrar login?
18. Who manages the Google Business Profile?
19. Is there a privacy policy or terms of service anywhere today?

---

## Part 4 — What we are actually offering

Worth saying plainly, because it frames every answer above.

The shop **already has working online ordering** through Clover. This project does
not make order delivery better. What it adds is what Clover's online ordering
**cannot do at all**:

- **Discount codes.** Clover Online Ordering has none. Not limited ones — none.
- **A customer list that is ours**, so a second visit can be encouraged.
- **Campaigns** — a slow Tuesday, a new flavour, a student offer.
- **A site that looks like Snowdaes**, rather than a Clover template.

Their current site has no menu and no ordering on it at all — just a homepage and a
Google Form. That gap is the pitch.

---

## The 30-second version

> "Two things. First, from your Clover dashboard I need two API tokens for each
> store — Settings, then API tokens; it takes about five minutes once two-factor is
> on. Nothing gets installed and no one from Clover is involved. Second, I need to
> watch what happens on your Station when an online order arrives, and know how
> often you refund. Those two answers decide how I build the checkout."
