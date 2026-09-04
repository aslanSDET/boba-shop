import { expect, test } from "@playwright/test";

/**
 * The header is two sides — the shop's name on the left, where and when it is
 * open on the right — and it has to stay two sides on a phone.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 *
 * It did not. `.ak-header-inner` was `flex-wrap: wrap` with `space-between`,
 * which is two layouts wearing one rule: opposite sides while both blocks fit
 * on a line, and the moment they do not, `.ak-where` wraps onto a second line
 * flush left — directly under the name, on the same side. Reported by the
 * owner as "some phones show the address on the same side as the kitchen
 * name", and measured to flip between 414px and 430px:
 *
 *     320..414   both blocks at x=16      stacked, same side
 *     430..768   name left, where right   correct
 *
 * So an iPhone 15 Pro Max got the intended header and a plain iPhone 15 did
 * not. Nothing caught it because the rest of the suite runs at one viewport,
 * and that viewport was on the correct side of the break.
 *
 * The widths below are devices, not round numbers: 320 is an iPhone SE in
 * portrait and the narrowest thing worth supporting, 375/390/393/412 are the
 * phones most customers will actually hold, 430 is the Pro Max that used to be
 * the only one that worked, and 1280 is the desktop the rest of the suite uses.
 */
const WIDTHS = [320, 360, 375, 390, 393, 412, 414, 430, 480, 559, 768, 1280];

test.describe("the header keeps the name and the address on opposite sides", () => {
  for (const width of WIDTHS) {
    test(`at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");

      const identity = await page.locator(".ak-identity").boundingBox();
      const where = await page.locator(".ak-where").boundingBox();
      const address = await page.locator(".ak-address").boundingBox();
      const inner = await page.locator(".ak-header-inner").boundingBox();
      if (!identity || !where || !address || !inner) throw new Error("header not rendered");

      // Side by side, not stacked: the whereabouts start after the identity
      // ends. This is the assertion the old CSS failed below 430px.
      expect(where.x, `where must begin right of the identity at ${width}px`).toBeGreaterThan(
        identity.x + identity.width - 1,
      );

      /*
       * And on the same row, not merely indented on a second one — asserted as
       * "their vertical extents overlap", which is what sharing a row means.
       *
       * This used to compare the two TOPS within 60px, and that quietly encoded
       * an assumption about how many lines the shop's name takes. At 320px the
       * name wraps to three lines, so the left column is 129px tall while the
       * right one is 60px and `align-items: end` sits it at the bottom — tops
       * 70px apart, in a header that is plainly still two columns. The CSS says
       * outright that the narrow-screen cost is paid by the name, so the test
       * was measuring the wrong thing rather than catching a regression.
       *
       * Overlap still fails the layout this file exists to guard: when
       * `.ak-where` wrapped onto its own line under the name, the two boxes did
       * not overlap at all.
       */
      const overlap =
        Math.min(identity.y + identity.height, where.y + where.height) -
        Math.max(identity.y, where.y);
      expect(overlap, `same row at ${width}px`).toBeGreaterThan(0);

      // The address is the item the right edge is FOR — a right column whose
      // contents rag left reads as a third column, which is what it did
      // between 430 and 559 before the media query was removed.
      expect(
        Math.abs(address.x + address.width - (inner.x + inner.width)),
        `address flush to the header's right edge at ${width}px`,
      ).toBeLessThan(4);

      // Nothing may buy the two-sided header with a sideways scroll.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `no horizontal scroll at ${width}px`).toBeLessThanOrEqual(0);
    });
  }
});
