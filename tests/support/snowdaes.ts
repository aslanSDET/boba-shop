import { expect, type Page } from "@playwright/test";

/**
 * Shared fixtures for the Snowdaes E2E suite, split out once a second spec
 * file needed the same "get to checkout" and "stub the hours" plumbing that
 * `snowdaes-checkout.spec.ts` already had. Nothing here is a test; everything
 * here is used by at least two files.
 */

/**
 * Put one shaved snow in the cart.
 *
 * "Snow - Small" is chosen deliberately: it has a REQUIRED flavour group, so
 * this also walks the path where the submit button is disabled until the group
 * is satisfied — which is the shape most of the menu has.
 */
export async function addAnItem(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Snow - Small/ }).first().click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: /^Taro Snow/ }).click();
  await sheet.getByRole("button", { name: /Add to order/i }).click();
  await expect(sheet).toBeHidden();
}

export async function openCart(page: Page) {
  await page.getByRole("button", { name: /View order/i }).click();
  await expect(page.getByRole("dialog").getByText("Your order")).toBeVisible();
}

export async function goToCheckout(page: Page) {
  await addAnItem(page);
  await openCart(page);
  await page.getByRole("link", { name: /Go to checkout/i }).click();
  await expect(page.getByRole("heading", { name: "Checkout", level: 1 })).toBeVisible();
}

/** Wait for Clover's own price to replace the cart's preview arithmetic. */
export async function priceToSettle(page: Page) {
  await expect(page.getByText("Confirming the price with the shop…")).toBeHidden({
    timeout: 30_000,
  });
}

/**
 * ── THE HOURS ARE STUBBED, AND THAT IS THE ONLY WAY THESE ARE TESTABLE ───────
 *
 * The pickup rules are entirely a function of the shop's own Clover hours and
 * the shop's current local time. Against the live sandbox merchant a test can
 * only ever assert whatever happens to be true this afternoon — "the shop is
 * shut, so offer tomorrow morning" is untestable on a Tuesday lunchtime, and a
 * suite that quietly asserts nothing is worse than no suite.
 *
 * So `/api/clover/hours` is intercepted. The shape is the route's own contract
 * (`HoursPayload`): the week, plus the shop's local time as an ANCHOR, which is
 * exactly the seam that exists so the browser never reads the visitor's clock.
 * Everything below the stub is the real component doing the real work.
 */
export const WEEK = [
  { key: "monday", label: "Mon", ranges: [{ start: 1200, end: 1930 }], hours: "12pm–7:30pm" },
  { key: "tuesday", label: "Tue", ranges: [{ start: 1100, end: 1930 }], hours: "11am–7:30pm" },
  { key: "wednesday", label: "Wed", ranges: [{ start: 1200, end: 1930 }], hours: "12pm–7:30pm" },
  { key: "thursday", label: "Thu", ranges: [{ start: 1200, end: 1930 }], hours: "12pm–7:30pm" },
  { key: "friday", label: "Fri", ranges: [{ start: 1200, end: 1930 }], hours: "12pm–7:30pm" },
  { key: "saturday", label: "Sat", ranges: [{ start: 1200, end: 1930 }], hours: "12pm–7:30pm" },
  { key: "sunday", label: "Sun", ranges: [], hours: null },
];

export async function stubHours(
  page: Page,
  anchor: { day: string; clock: number } | null,
  week: unknown[] = WEEK,
) {
  await page.route("**/api/clover/hours", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ week, anchor, timeZone: "America/New_York" }),
    }),
  );
}

export const money = (text: string) => Number(text.replace(/[^0-9.]/g, ""));

/** The figure on a totals row, by its label. */
export async function totalRow(page: Page, label: RegExp): Promise<number> {
  const row = page.locator("dl div").filter({ has: page.getByText(label, { exact: false }) }).first();
  return money(await row.locator("dd").innerText());
}

/**
 * The real widths `tests/header.spec.ts` carries the evidence for: a
 * `flex-wrap` header broke between 414px and 430px, so an iPhone 15 Pro Max
 * rendered correctly and a plain iPhone 15 did not, and a suite testing round
 * numbers alone saw nothing. Any layout that can produce two different
 * results (`flex-wrap`, `space-between`, unconstrained `min-width`) is suspect
 * until it has been measured at all of these, not just 320 and 768.
 */
export const WIDTHS = [320, 360, 375, 390, 393, 412, 414, 430, 480, 559, 768, 1280];
