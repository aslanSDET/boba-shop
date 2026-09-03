import { test, expect } from "@playwright/test";
import {
  addAnItem,
  goToCheckout,
  openCart,
  priceToSettle,
  stubHours,
  totalRow,
  WIDTHS,
} from "./snowdaes-helpers";
import { AA_SMALL, contrastOfElement } from "./contrast-helper";

/**
 * Snowdaes: the journeys either side of paying.
 *
 * `snowdaes-checkout.spec.ts` covers the money — Clover's pricing, the tip, the
 * discount, the card. This file covers everything a customer does AROUND that:
 * arriving with nothing, changing their mind, going back, and what they are
 * left looking at afterwards.
 *
 * These are the paths that broke when checkout moved from a drawer to a route,
 * because a drawer could not be arrived at cold, reloaded, or linked to, and a
 * route can be all three.
 */

test.describe("Snowdaes journeys", () => {
  test("arriving at checkout with an empty cart creates no Clover order", async ({ page }) => {
    /*
     * The assertion that matters is the ABSENCE of a request.
     *
     * Pricing on Clover CREATES an order on the merchant's account — there is no
     * calculate-only call. So a bare visit to /checkout that priced an empty
     * cart would leave a real object behind every time a link was shared, a
     * crawler followed it, or somebody hit back into it. The page must decide
     * there is nothing to price before it asks.
     */
    const priced: string[] = [];
    await page.route("**/api/clover/checkout", async (route) => {
      priced.push(route.request().url());
      await route.continue();
    });

    await page.goto("/checkout");

    await expect(page.getByRole("heading", { name: "Your order is empty" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse the menu" })).toBeVisible();

    /* Give it longer than the page would need, so this fails on a real request
       rather than passing because the assertion ran first. */
    await page.waitForTimeout(2_000);
    expect(priced, "an empty cart must not be priced on Clover").toEqual([]);
  });

  test("the empty state leads back to the menu", async ({ page }) => {
    await page.goto("/checkout");
    await page.getByRole("link", { name: "Browse the menu" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: /Snow - Small/ }).first()).toBeVisible();
  });

  test("quantity carries from the drawer through to checkout", async ({ page }) => {
    await addAnItem(page);
    await openCart(page);

    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: "Increase quantity" }).click();
    await expect(drawer.getByText("2", { exact: true })).toBeVisible();

    /* The subtotal is the cart's own preview arithmetic — the only number the
       drawer is allowed to show, and it must track the stepper. Scoped to the
       <dd> specifically: at quantity 2 the line price and the subtotal are
       both $15.50, and a bare text match resolves to both. */
    await expect(drawer.getByRole("definition").getByText("$15.50")).toBeVisible();

    await page.getByRole("link", { name: /Go to checkout/i }).click();
    await expect(page.getByText("2×")).toBeVisible();
    await expect(page.getByText("$15.50").first()).toBeVisible();
  });

  test("removing the last item empties the drawer", async ({ page }) => {
    await addAnItem(page);
    await openCart(page);

    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: /Remove Snow - Small/i }).click();

    await expect(drawer.getByText(/Pick a drink from the menu/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Go to checkout/i })).toHaveCount(0);
  });

  test("removing a discount code puts the price back", async ({ page }) => {
    await goToCheckout(page);
    await priceToSettle(page);

    const taxBefore = await totalRow(page, /Tax/);
    const totalBefore = await totalRow(page, /Total/);

    await page.getByRole("textbox", { name: "Discount code" }).fill("NEWCUSTOMER");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("New customer — 10% off")).toBeVisible();
    await priceToSettle(page);
    await expect.poll(() => totalRow(page, /Tax/)).toBeLessThan(taxBefore);

    /* Removing it must re-price too, not just hide the row — the discount lives
       on the Clover order, so the only way back is another price. */
    await page.getByRole("button", { name: /Remove code NEWCUSTOMER/i }).click();
    await priceToSettle(page);

    await expect(page.getByText("New customer — 10% off")).toHaveCount(0);
    await expect.poll(() => totalRow(page, /Tax/)).toBeCloseTo(taxBefore, 2);
    await expect.poll(() => totalRow(page, /Total/)).toBeCloseTo(totalBefore, 2);
  });

  test("going back to the menu keeps the order", async ({ page }) => {
    await goToCheckout(page);
    await page.getByRole("link", { name: /Back to the menu/i }).click();

    await expect(page).toHaveURL(/\/$/);
    /* The bar is the proof the cart survived the navigation. */
    await expect(page.getByRole("button", { name: /View order/i })).toBeVisible();

    await openCart(page);
    await expect(page.getByRole("dialog").getByText("Snow - Small")).toBeVisible();
  });

  test("one checkout attempt keeps one idempotency key across reloads", async ({ page }) => {
    /*
     * The key names an ATTEMPT, not a request. It is what stops a reload — which
     * a route invites and a drawer never could — from creating a second order on
     * the merchant's account for one customer.
     *
     * Asserted at the network boundary because that is the contract: the server
     * collapses repeats bearing the same key, so what matters is that the
     * browser sends the same one.
     */
    const keys: string[] = [];
    await page.route("**/api/clover/checkout", async (route) => {
      const body = route.request().postDataJSON() as { idempotencyKey?: string };
      if (body?.idempotencyKey) keys.push(body.idempotencyKey);
      await route.continue();
    });

    await goToCheckout(page);
    await priceToSettle(page);
    await page.reload();
    await priceToSettle(page);

    expect(keys.length, "expected a price on each load").toBeGreaterThanOrEqual(2);
    expect(new Set(keys).size, `one attempt, one key — saw ${keys.join(", ")}`).toBe(1);
  });

  test.describe("the confirmation", () => {
    const ORDER = "ABC123DEF4567";

    const seed = async (page: import("@playwright/test").Page, detail: object | null) => {
      await page.goto("/");
      if (detail) {
        await page.evaluate(
          ([id, value]) => sessionStorage.setItem(`snowdaes.order.${id}`, value as string),
          [ORDER, JSON.stringify(detail)] as const,
        );
      }
      await page.goto(`/order/${ORDER}`);
    };

    test("shows the pickup code, the chosen time, the note and what was paid", async ({ page }) => {
      await seed(page, {
        amount: 858,
        tip: 112,
        card: { brand: "VISA", last4: "1111" },
        authCode: "OK1636",
        pickup: "Tomorrow at 11am",
        note: "Nut allergy — clean scoop please",
        lines: [{ name: "Snow - Small", quantity: 1, detail: "Taro Snow" }],
        at: Date.now(),
      });

      await expect(page.getByRole("heading", { name: "Order placed" })).toBeVisible();
      /* The last four of Clover's own order id — a real substring staff can
         search on, not a number we invented. */
      await expect(page.getByText("4567", { exact: true })).toBeVisible();
      await expect(page.getByText("Tomorrow at 11am")).toBeVisible();
      await expect(page.getByText("Nut allergy — clean scoop please")).toBeVisible();
      await expect(page.getByText("$8.58")).toBeVisible();
      await expect(page.getByText("$1.12")).toBeVisible();
      await expect(page.getByText("VISA ••1111")).toBeVisible();
    });

    test("still shows the pickup code when the detail is on another device", async ({ page }) => {
      /*
       * The detail lives in sessionStorage, so a shared link or a cleared tab
       * has none of it. Somebody standing at the counter still needs the number,
       * and it survives because it is derived from the URL.
       */
      await seed(page, null);

      await expect(page.getByRole("heading", { name: "Order placed" })).toBeVisible();
      await expect(page.getByText("4567", { exact: true })).toBeVisible();
      await expect(page.getByText(/isn’t on this device/i)).toBeVisible();
    });

    test("offers directions and a phone number", async ({ page }) => {
      await seed(page, null);

      await expect(page.getByRole("heading", { name: "Where to collect it" })).toBeVisible();
      await expect(page.getByText("99 Chelmsford Rd")).toBeVisible();

      /* The links are the primary action, not a fallback for the iframe: on a
         phone you want turn-by-turn in your own maps app and a number you can
         press. Both must work even if the embed never loads. */
      const maps = page.getByRole("link", { name: /Open in Maps/i });
      await expect(maps).toHaveAttribute("href", /maps\.google\.com/);
      await expect(page.getByRole("link", { name: /Call 978/ })).toHaveAttribute("href", /^tel:\d+$/);

      await expect(page.locator("iframe[title*='Map showing']")).toBeAttached();
    });
  });

  test.describe("no horizontal overflow", () => {
    /*
     * ── WHY EVERY WIDTH, AND WHY THESE ONES ──────────────────────────────────
     *
     * `tests/header.spec.ts` carries the evidence: a flex-wrap header broke
     * between 414px and 430px, so an iPhone 15 Pro Max rendered correctly and a
     * plain iPhone 15 did not, and a suite running at one viewport saw nothing.
     *
     * Checkout is the densest screen in this restaurant — a tip row of four
     * controls, a discount input beside a button, and four fixed-height card
     * iframes in a two-column grid. Every one of those is a rule that can
     * produce two different layouts.
     */
    for (const width of WIDTHS) {
      test(`checkout at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await stubHours(page, { day: "monday", clock: 1300 });
        await goToCheckout(page);

        const overflowing = await page.evaluate(() =>
          [...document.querySelectorAll("main *")]
            .filter((el) => el.getBoundingClientRect().width > window.innerWidth + 1)
            .map((el) => `${el.tagName}.${(el as HTMLElement).className}`.slice(0, 90)),
        );
        expect(overflowing).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth))
          .toBeLessThanOrEqual(width);
      });
    }
  });

  /*
   * ── WHAT AN OVERFLOW TEST CANNOT SEE ───────────────────────────────────────
   *
   * The block above proves nothing sticks out past the viewport. That is not
   * the same as the layout being right, and the tip row is the proof: it never
   * overflowed at any width, and it was still broken on every phone.
   *
   * `flex flex-wrap` + `flex-1` on three of four buttons produced THREE
   * different layouts across the phone range, because wrapping picks how many
   * buttons fit using their content width and flex-1 then grows whichever ones
   * landed on that line. Measured before the fix: 320/360/375 wrapped 2+2 and
   * stretched "25%" to 202/242/257px next to a 70px "None"; 390–430 fitted
   * three and dropped "None" alone onto a second line; 480+ fitted all four.
   * The break is between 375 and 390 — an iPhone SE and an iPhone 15 rendered
   * differently, which is the same failure shape as the header at 414/430.
   */
  test.describe("checkout controls hold their shape", () => {
    for (const width of WIDTHS) {
      test(`the four tip buttons are one size at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await stubHours(page, { day: "monday", clock: 1300 });
        await goToCheckout(page);

        const tips = await page.$$eval(
          'div[role="radiogroup"][aria-labelledby="tip-heading"] button',
          (els) =>
            els.map((el) => {
              const r = el.getBoundingClientRect();
              return { w: Math.round(r.width), h: Math.round(r.height) };
            }),
        );
        expect(tips).toHaveLength(4);

        /* The invariant that holds at every width, and the one the old layout
           broke: a grid gives four equal cells whether it is 2×2 or 4×1, so
           every tip button is the same width as every other. The old row
           measured 136/136/202/70 at 320px. */
        expect(new Set(tips.map((t) => t.w)).size).toBe(1);

        /* And none of them may fall under the touch floor while doing it. */
        for (const t of tips) expect(t.h).toBeGreaterThanOrEqual(44);
      });
    }

    test("every control a customer types into is at least 16px", async ({ page }) => {
      /*
       * iOS Safari zooms the viewport when a focused control is under 16px and
       * does not zoom back out, leaving the customer scrolled sideways in the
       * middle of paying. The discount input already had `text-base`; the
       * pickup select and the kitchen note had been missed at 15px.
       */
      await page.setViewportSize({ width: 390, height: 900 });
      await stubHours(page, { day: "monday", clock: 1300 });
      await goToCheckout(page);

      // The select only exists once a specific time is being chosen.
      await page.getByRole("radio", { name: /Pick a time/i }).click();
      await expect(page.locator("main select")).toBeVisible();

      const sizes = await page.$$eval("main textarea, main select, main input", (els) =>
        els.map((el) => ({
          tag: el.tagName.toLowerCase(),
          px: parseFloat(getComputedStyle(el).fontSize),
        })),
      );
      expect(sizes.length).toBeGreaterThanOrEqual(3);
      for (const s of sizes) expect(s.px).toBeGreaterThanOrEqual(16);
    });

    test("the back link clears the touch floor", async ({ page }) => {
      /* `py-2` on a 15px line box measured 38.5px at all twelve widths. */
      await page.setViewportSize({ width: 390, height: 900 });
      await stubHours(page, { day: "monday", clock: 1300 });
      await goToCheckout(page);

      const box = await page.getByRole("link", { name: /Back to the menu/i }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    });

    /*
     * ── THE TWO FIXES A LAYOUT ASSERTION CANNOT SEE ──────────────────────────
     *
     * A colour does not overflow, wrap, or shrink under 44px — none of the
     * geometry checks above would notice `opacity-80` reverting to `opacity-70`,
     * or `text-brand-ink` reverting to `text-primary`. Both are one Tailwind
     * class away from a silent AA failure, so both are measured the way
     * `tests/contrast.spec.ts` measures Asian Kitchen's header: composited over
     * the real background a browser paints, not a colour assumed from the
     * token's own name.
     */
    test("the selected tip's dollar amount clears AA on the button", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 });
      await stubHours(page, { day: "monday", clock: 1300 });
      await goToCheckout(page);
      await priceToSettle(page);

      /* 15% is the default selection, so its amount is the one on screen
         without any interaction — the case a customer actually sees. */
      const amount = page
        .locator('div[role="radiogroup"][aria-labelledby="tip-heading"] button[aria-checked="true"] span');
      await expect(amount).toBeVisible();

      const r = await amount.evaluate(contrastOfElement);
      expect(r.error).toBeUndefined();
      expect(
        r.ratio,
        `tip amount at ${r.size}px measures ${r.ratio}:1, needs ${AA_SMALL} — ` +
          `opacity-70 measured 4.29:1 here before the fix`,
      ).toBeGreaterThanOrEqual(AA_SMALL);
    });

    test("the applied discount code's amount clears AA", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 });
      await stubHours(page, { day: "monday", clock: 1300 });
      await goToCheckout(page);
      await priceToSettle(page);

      await page.getByRole("textbox", { name: "Discount code" }).fill("NEWCUSTOMER");
      await page.getByRole("button", { name: "Apply" }).click();
      await priceToSettle(page);

      /* Picked out by the promo code's own text — the row has no class name of
         its own to select by, only the utility class this test exists to guard. */
      const row = page
        .locator("dl div")
        .filter({ has: page.getByText("NEWCUSTOMER", { exact: true }) })
        .first();
      await expect(row).toBeVisible();

      const r = await row.evaluate(contrastOfElement);
      expect(r.error).toBeUndefined();
      expect(
        r.ratio,
        `discount row at ${r.size}px measures ${r.ratio}:1, needs ${AA_SMALL} — ` +
          `text-primary measured 2.36:1 here before the fix`,
      ).toBeGreaterThanOrEqual(AA_SMALL);

      /* The Tag icon beside "Discount code" carries the same fix and the same
         risk — a non-text element needs only 3:1, but it was 2.36:1. */
      const icon = page.locator("svg.lucide-tag");
      await expect(icon).toBeVisible();
      const iconResult = await icon.evaluate(contrastOfElement);
      expect(iconResult.ratio).toBeGreaterThanOrEqual(3);
    });
  });
});
