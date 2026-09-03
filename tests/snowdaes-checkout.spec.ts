import { test, expect, type Page } from "@playwright/test";
import {
  addAnItem,
  goToCheckout,
  openCart,
  priceToSettle,
  stubHours,
  totalRow,
} from "./snowdaes-helpers";

/**
 * Snowdaes: menu → cart → `/checkout` → paid, through the real Clover card
 * iframes against the sandbox merchant.
 *
 * ── WHAT THIS SUITE IS FOR ───────────────────────────────────────────────────
 *
 * Checkout stopped being a panel inside the cart drawer and became a route, and
 * the order grew a pickup time, a tip, a kitchen note and the discount code.
 * Most of that is testable elsewhere — `pickupOptions` is pure, and the money
 * path was measured against Clover directly (`scripts/spike/09`). What is NOT
 * testable elsewhere, and is what this file covers:
 *
 *   1. the cart surviving a RELOAD, which is new and only possible because the
 *      cart is persisted and hydrated manually — a hydration mismatch here
 *      shows up as an emptied order and nothing else catches it;
 *   2. a discount code re-pricing THROUGH CLOVER, tax included, which is the
 *      whole reason the code moved off the drawer;
 *   3. the card iframes, which no server-side test can exercise at all.
 *
 * ── THE CARD COMES FROM THE ENVIRONMENT ──────────────────────────────────────
 *
 * Read from `.env.local`, never written here. It is a Clover SANDBOX test card
 * that works only against the sandbox hosts, but this is a public repository
 * and `scripts/spike/08` already set the rule: the card is supplied by the
 * environment, never stored in a file, never logged, never echoed. Without it
 * the paying test SKIPS rather than fails — a missing local credential is not a
 * broken build.
 */

const CARD = {
  number: process.env.CLOVER_TEST_CARD_NUMBER ?? "",
  exp: process.env.CLOVER_TEST_CARD_EXP ?? "",
  cvv: process.env.CLOVER_TEST_CARD_CVV ?? "",
  zip: process.env.CLOVER_TEST_CARD_ZIP ?? "",
};
const HAVE_CARD = Object.values(CARD).every(Boolean);

/**
 * Clover mounts each field in its OWN cross-origin iframe, one per container id
 * — unlike Square, which puts the whole form in one. So each field is located
 * through the frame belonging to its own container rather than by hunting one
 * shared frame for placeholders.
 */
async function fillCard(page: Page) {
  const field = (id: string, placeholder: RegExp) =>
    page.locator(`#${id}`).frameLocator("iframe").first().getByPlaceholder(placeholder);

  const number = field("clover-card-number", /card number/i);
  /* The SDK attaches asynchronously: the container exists before the iframe
     inside it does, so waiting on the container alone races. */
  await expect(number).toBeVisible({ timeout: 30_000 });

  /*
   * ── TYPED, THEN BLURRED, THEN VERIFIED ──────────────────────────────────────
   *
   * Three separate things Clover's widget needs, each learned from a failure:
   *
   * 1. TYPED, not `fill()`. `fill()` sets the value and dispatches one `input`
   *    event, and the widget does not accept that — measured, the number looked
   *    filled and the form still refused with "Card CVV is required".
   *
   * 2. BLURRED. The widget commits a field on blur, so whichever field was
   *    typed LAST is the one that has not registered when Pay is pressed. That
   *    moved the error from CVV to postal code as the order changed, which is
   *    what gave it away.
   *
   * 3. VERIFIED. Both failures above surfaced as a Pay button that simply did
   *    nothing — the error is reported inside a cross-origin iframe, so it
   *    appears in no page snapshot and no assertion. Reading the value back
   *    makes a field that did not take fail HERE, naming the field, instead of
   *    sixty seconds later at a navigation timeout.
   */
  const type = async (locator: ReturnType<typeof field>, value: string, what: string) => {
    await locator.click();
    await locator.pressSequentially(value, { delay: 30 });
    await locator.blur();
    await expect(locator, `${what} did not accept input`).not.toHaveValue("");
  };

  await type(number, CARD.number, "card number");
  await type(field("clover-card-date", /mm\s*\/\s*yy/i), CARD.exp, "expiry");
  await type(field("clover-card-cvv", /cvv/i), CARD.cvv, "CVV");
  await type(field("clover-card-postal", /zip|postal/i), CARD.zip, "postal code");

  /*
   * 4. SETTLED.
   *
   * Each field lives in its own cross-origin iframe and reports its state to
   * the parent SDK by postMessage. Pressing Pay in the same tick as the last
   * keystroke calls `createToken()` before the last field's message has landed,
   * and Clover rejects the whole thing with "Card postal code is required" —
   * for a field that visibly contains "12345". Moving focus out of every iframe
   * and giving the messages a moment is what makes the tokenise deterministic.
   *
   * A wait rather than a signal because there is nothing to wait ON: the
   * handshake is between Clover's iframes and Clover's SDK, and neither exposes
   * a readiness event to the page hosting them.
   */
  await page.getByRole("heading", { name: "Checkout", level: 1 }).click();
  await page.waitForTimeout(2_000);
}

/**
 * Press Pay and wait for whichever comes first: the confirmation, or an error.
 *
 * ── WHY A SANDBOX DECLINE IS A SKIP AND NOT A FAILURE ────────────────────────
 *
 * Clover's test merchant enforces velocity limits — per card, and per IP — and
 * a day of development against it exhausts them:
 *
 *     "Declined as sale count per card is greater than configured amount"
 *     "Declined as sale count per IP address is greater than configured amount"
 *
 * Once the per-IP limit is hit, EVERY card declines, so the suite can no longer
 * distinguish a broken checkout from a sandbox that has stopped accepting
 * anything. Failing there would train everyone to ignore a red suite.
 *
 * Card entitlement is the same kind of thing: the supplied Mastercard tokenises
 * happily and then charges 402 "NOT ENTITLED", because that brand is not
 * enabled on this test merchant. Also not a defect in this code.
 *
 * Everything else — a genuine decline, a bad request, our own 500 — still
 * fails, loudly, with Clover's own words.
 */
const SANDBOX_REFUSAL = /sale count|NOT ENTITLED|velocity/i;

async function payAndConfirm(page: Page) {
  await page.getByRole("button", { name: /^Pay \$/ }).click();

  const problem = page.locator("p[role=alert]").first();
  const outcome = await Promise.race([
    page.waitForURL(/\/order\/[A-Z0-9]+$/, { timeout: 90_000 }).then(() => "paid" as const),
    problem.waitFor({ state: "visible", timeout: 90_000 }).then(() => "refused" as const),
  ]);

  if (outcome === "refused") {
    const said = (await problem.innerText()).trim();
    test.skip(SANDBOX_REFUSAL.test(said), `Clover's sandbox refused every card: "${said}"`);
    throw new Error(`Payment was refused: ${said}`);
  }
}

test.describe("Snowdaes checkout", () => {
  test("the cart drawer quotes no tax and no total — only checkout does", async ({ page }) => {
    await addAnItem(page);
    await openCart(page);

    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Subtotal")).toBeVisible();

    /*
     * The regression this guards is invariant 4. The drawer used to print a tax
     * line and a Total from the cart's own arithmetic, while the figure actually
     * charged comes from Clover a screen later — two calculators quoting one
     * order. If either word comes back to this drawer, that has been undone.
     */
    await expect(drawer.getByText(/^Tax$/)).toHaveCount(0);
    await expect(drawer.getByText(/^Total$/)).toHaveCount(0);
    await expect(drawer.getByText(/Tax, tip and codes at checkout/i)).toBeVisible();
  });

  test("Clover prices the order, and the tip is added on top of Clover's total", async ({ page }) => {
    await goToCheckout(page);

    /* Wait for the real price to replace the cart's preview. */
    await priceToSettle(page);

    const subtotal = await totalRow(page, /Subtotal/);
    const tax = await totalRow(page, /Tax/);
    const tip = await totalRow(page, /Tip/);
    const total = await totalRow(page, /Total/);

    /* Tax is CLOVER's, applied because the line items reference real inventory —
       we never compute or send one. Its presence at all is the assertion. */
    expect(tax).toBeGreaterThan(0);

    /* The tip defaults to 15% of what is actually being paid for the food:
       Clover's subtotal plus Clover's tax, not the cart's preview. */
    expect(tip).toBeCloseTo(Math.round((subtotal + tax) * 15) / 100, 2);
    expect(total).toBeCloseTo(subtotal + tax + tip, 2);

    /* And "None" must genuinely remove it — measured in the total, because a
       pressed-looking button that changes no number is the bug worth catching. */
    await page.getByRole("radio", { name: "None" }).click();
    await expect
      .poll(async () => totalRow(page, /Total/))
      .toBeCloseTo(subtotal + tax, 2);
  });

  test("a discount code re-prices through Clover, and the tax moves with it", async ({ page }) => {
    await goToCheckout(page);
    await priceToSettle(page);

    const taxBefore = await totalRow(page, /Tax/);

    await page.getByRole("textbox", { name: "Discount code" }).fill("NEWCUSTOMER");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText("New customer — 10% off")).toBeVisible();
    await priceToSettle(page);

    /*
     * The point of the whole move. Clover applies the discount BEFORE tax
     * (measured, findings.md), so a re-price must lower the TAX as well as the
     * subtotal. Our own preview arithmetic in the drawer could not show this,
     * which is why the code entry lives here now.
     */
    await expect.poll(async () => totalRow(page, /Tax/)).toBeLessThan(taxBefore);

    const subtotal = await totalRow(page, /Subtotal/);
    const discount = await totalRow(page, /NEWCUSTOMER/);
    expect(discount).toBeCloseTo(Math.round(subtotal * 10) / 100, 2);
  });

  test("the order survives a reload of the checkout page", async ({ page }) => {
    await goToCheckout(page);
    await expect(page.getByText("Snow - Small")).toBeVisible();

    /*
     * Checkout is a route now, so it can be reloaded — by a pull-to-refresh, or
     * by a phone restoring a backgrounded tab. Before the cart was persisted
     * this emptied the order somebody was about to pay for.
     *
     * It also guards the hydration half: the store is `skipHydration` and read
     * back in an effect, so a regression that hydrates during module init shows
     * up as a mismatch rather than as a lost cart.
     */
    await page.reload();

    await expect(page.getByRole("heading", { name: "Checkout", level: 1 })).toBeVisible();
    await expect(page.getByText("Snow - Small")).toBeVisible();
    await expect(page.getByText("Your order is empty")).toHaveCount(0);
  });

  test("offers a note, and counts what is typed into it", async ({ page }) => {
    await goToCheckout(page);

    const note = page.getByLabel("Notes for the kitchen");
    await note.fill("Nut allergy — clean scoop please");
    await expect(page.getByText("32/400")).toBeVisible();
  });

  test.describe("pickup time", () => {
    test("while the shop is open, the default is as soon as possible", async ({ page }) => {
      await stubHours(page, { day: "monday", clock: 1300 });
      await goToCheckout(page);

      await expect(page.getByRole("radio", { name: "As soon as possible" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(page.getByText(/Ready about 30 minutes after you order/i)).toBeVisible();
    });

    test("while the shop is shut, it offers the next opening and never 'as soon as possible'", async ({
      page,
    }) => {
      /* Monday 9pm: shut for the night, and Tuesday opens at 11am. This is the
         case the whole day-spanning search exists for. */
      await stubHours(page, { day: "monday", clock: 2100 });
      await goToCheckout(page);

      /*
       * The assertion that matters is the ABSENCE. "As soon as possible" when
       * there is nobody in the building is a promise the shop cannot keep, and
       * it is the exact wording a regression would bring back.
       */
      await expect(page.getByRole("radio", { name: "As soon as possible" })).toHaveCount(0);

      const next = page.getByRole("radio", { name: /When they open/ });
      await expect(next).toHaveAttribute("aria-checked", "true");
      await expect(next).toContainText("Tomorrow at 11am");
      await expect(page.getByText(/Closed right now/i)).toBeVisible();
    });

    test("near midnight it does not offer a slot earlier the same day", async ({ page }) => {
      /*
       * 11:50pm Monday. The 30-minute lead lands at 12:20am on TUESDAY, so
       * Monday is entirely in the past — but Monday's own range (12pm–7:30pm)
       * is still in the week. An implementation that floors the day instead of
       * skipping it offers Monday lunchtime, in the past, to someone standing
       * there at midnight.
       */
      await stubHours(page, { day: "monday", clock: 2350 });
      await goToCheckout(page);

      await expect(page.getByRole("radio", { name: /When they open/ })).toContainText(
        "Tomorrow at 11am",
      );

      await page.getByRole("radio", { name: "Pick a time" }).click();
      const options = await page.getByLabel("Collect at").locator("option").allTextContents();
      const groups = await page.getByLabel("Collect at").locator("optgroup").evaluateAll((els) =>
        els.map((e) => e.getAttribute("label")),
      );

      expect(groups).not.toContain("Today");
      expect(options.length).toBeGreaterThan(0);
    });

    test("skips a day the shop is closed altogether", async ({ page }) => {
      /* Saturday evening, shut. Sunday is closed, so the answer is Monday —
         not "tomorrow", which would be a locked door. */
      await stubHours(page, { day: "saturday", clock: 2000 });
      await goToCheckout(page);

      const next = page.getByRole("radio", { name: /When they open/ });
      await expect(next).toContainText("Monday at 12pm");
      await expect(next).not.toContainText("Tomorrow");
    });

    test("picking a time groups the slots by day", async ({ page }) => {
      await stubHours(page, { day: "monday", clock: 1300 });
      await goToCheckout(page);

      await page.getByRole("radio", { name: "Pick a time" }).click();

      const select = page.getByLabel("Collect at");
      await expect(select).toBeVisible();

      /* The day lives on the optgroup, so "11am" is never ambiguous about
         whether it means today or tomorrow. */
      const groups = await select.locator("optgroup").evaluateAll((els) =>
        els.map((e) => e.getAttribute("label")),
      );
      expect(groups).toEqual(["Today", "Tomorrow"]);

      /* The lead time is real: the first slot today is at least 30 minutes out,
         and 1:00pm or 1:15pm would both be too soon at 1:00pm. */
      const today = select.locator('optgroup[label="Today"] option');
      await expect(today.first()).toHaveText("1:30pm");
    });

    test("falls back to as soon as possible when the hours cannot be read", async ({ page }) => {
      /* A shop whose hours we cannot read is NOT a closed shop — the same rule
         the open/closed badge follows. Refusing to take the order would cost
         real money on the strength of a failed request. */
      await stubHours(page, null, []);
      await goToCheckout(page);

      await expect(page.getByRole("radio", { name: "As soon as possible" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(page.getByRole("radio", { name: "Pick a time" })).toHaveCount(0);
    });

    test("the chosen time reaches the confirmation", async ({ page }) => {
      test.skip(!HAVE_CARD, "Set CLOVER_TEST_CARD_* in .env.local to run the paying test.");

      await stubHours(page, { day: "monday", clock: 1300 });
      await goToCheckout(page);
      await priceToSettle(page);

      await page.getByRole("radio", { name: "Pick a time" }).click();
      /* "2:15pm", not "2:00pm": `formatClock` drops the minutes on the hour, so
         the option on the hour reads "2pm". Picking one WITH minutes also makes
         the assertion below unambiguous. */
      await page.getByLabel("Collect at").selectOption({ label: "2:15pm" });

      await fillCard(page);
      await payAndConfirm(page);

      /* The phrase the customer chose, not a re-derivation: the confirmation
         has no hours to resolve a slot against. */
      await expect(page.getByText("2:15pm")).toBeVisible();
    });
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await goToCheckout(page);

    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("main *")]
        .filter((el) => el.getBoundingClientRect().width > window.innerWidth + 1)
        .map((el) => `${el.tagName}.${(el as HTMLElement).className}`.slice(0, 80)),
    );
    expect(overflow).toEqual([]);
  });

  test("pays through Clover's own card fields and confirms the order", async ({ page }) => {
    test.skip(!HAVE_CARD, "Set CLOVER_TEST_CARD_* in .env.local to run the paying test.");

    await goToCheckout(page);
    await priceToSettle(page);

    await page.getByRole("radio", { name: "20%" }).click();
    await page.getByLabel("Notes for the kitchen").fill("Less ice");

    const total = await totalRow(page, /Total/);

    await fillCard(page);

    /* The confirmation is a different route, so this also proves the redirect
       and that the cart was cleared before it. */
    await payAndConfirm(page);

    await expect(page.getByRole("heading", { name: "Order placed" })).toBeVisible();

    /* The pickup code is the last four of Clover's own order id — a real
       substring staff can search on, not a number we invented. */
    const orderId = new URL(page.url()).pathname.split("/").pop() ?? "";
    await expect(page.getByText(orderId.slice(-4).toUpperCase(), { exact: true })).toBeVisible();

    /* The customer must be shown the figure that was actually charged, tip
       included — the whole reason the pay route adds the tip back onto
       `amount_paid`, which excludes it (findings.md, step 09). */
    await expect(page.getByText(`$${total.toFixed(2)}`).first()).toBeVisible();

    await expect(page.getByText("Less ice")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where to collect it" })).toBeVisible();
    await expect(page.frameLocator("iframe[title*='Map showing']").locator("body")).toBeAttached();

    /* Paid means the cart is gone: going back to the menu must not re-offer it. */
    await page.getByRole("link", { name: /Order something else/i }).click();
    await expect(page.getByRole("button", { name: /View order/i })).toHaveCount(0);
  });
});
