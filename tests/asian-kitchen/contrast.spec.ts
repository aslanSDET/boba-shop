import { expect, test } from "@playwright/test";
import { AA_SMALL, measureContrast } from "../support/contrast";

/**
 * The header's small type has to clear WCAG AA against the green behind it.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 *
 * `--green` was darkened from #1e9350 to #1b8548 precisely so that white text
 * on it would clear AA, and the reasoning was checked against pure #fff, where
 * it does: 3.93:1 -> 4.67:1. But the elements that change actually named —
 * "hours at 10px", "the address at 13px" — were not pure white. They were
 * `rgba(255,255,255,0.94)` and `rgba(255,255,255,0.78)`, which composite over
 * the new green to 4.33:1 and 3.49:1. Both still failed, and the commit
 * asserted "zero AA failures on the menu" on the strength of the #fff figure.
 *
 * Nothing caught it because contrast was a one-off manual pass and the suite
 * asserted geometry only. A colour is not a layout; it does not announce itself
 * when it regresses. So the numbers get asserted here, composited the way a
 * browser actually paints them rather than against an assumed background — see
 * `contrast-helper.ts` for the algorithm, shared with the Snowdaes suite.
 *
 * The closed state is included deliberately. It is only on screen in the
 * evening, so a sweep of the live page never sees it, and it was the worst
 * contrast in the header at 2.69:1.
 */

/* 390px is an iPhone 15 — the width the original contrast pass reported on. */
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
});

const OPEN_STATE = [
  ".ak-hours",          // 10px. 4.33:1 before this was fixed.
  ".ak-address-street", // 13px.
  ".ak-address-city",   // 11px. 3.49:1 before.
  ".ak-wordmark",
];

for (const selector of OPEN_STATE) {
  test(`${selector} clears AA on the header green`, async ({ page }) => {
    const r = await page.evaluate(measureContrast, selector);
    expect(r.error, `${selector} should exist`).toBeUndefined();
    expect(
      r.ratio,
      `${selector} at ${r.size}px measures ${r.ratio}:1, needs ${AA_SMALL}`,
    ).toBeGreaterThanOrEqual(AA_SMALL);
  });
}

test(".ak-tz inherits a passing colour, it does not set its own", async ({ page }) => {
  /* It was failing silently at 4.33:1 by inheriting .ak-hours. If someone gives
     it its own colour again, that has to be measured too. */
  const r = await page.evaluate(measureContrast, ".ak-tz");
  expect(r.ratio).toBeGreaterThanOrEqual(AA_SMALL);
});

test("the CLOSED pill clears AA — the state a sweep of the live page never sees", async ({
  page,
}) => {
  /* The pill is rendered only once the client has resolved the shop's hours
     (`data-open={status.open}`), so it is not in the DOM on first paint and
     forcing the attribute before it arrives silently does nothing. */
  const pill = page.locator(".ak-open");
  await expect(pill).toBeVisible();
  await pill.evaluate((el) => el.setAttribute("data-open", "false"));
  const r = await page.evaluate(
    measureContrast,
    '.ak-open[data-open="false"]',
  );
  expect(r.error, "the open/closed pill should exist").toBeUndefined();
  expect(
    r.ratio,
    `the closed pill at ${r.size}px measures ${r.ratio}:1, needs ${AA_SMALL}`,
  ).toBeGreaterThanOrEqual(AA_SMALL);
});

/**
 * The brand green lives in three files — theme.css, config.ts (which tints the
 * phone's status bar) and hero-neon.svg. One sweep already moved two of three
 * and left the third, so the drift gets asserted rather than commented about.
 */
test("the status-bar tint matches the header green", async ({ page }) => {
  const meta = await page
    .locator('meta[name="theme-color"]')
    .getAttribute("content");
  const green = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".ak") || document.body)
      .getPropertyValue("--green")
      .trim(),
  );
  expect(meta?.toLowerCase()).toBe(green.toLowerCase());
});

/**
 * The plate sheet, which both contrast passes missed for the same reason.
 *
 * Each swept the page AS LOADED. This markup does not exist until a plate is
 * opened, so neither ever measured it — and it is the screen a customer spends
 * the most time on, because it is where the order is actually built.
 *
 * `.ak-step-n` and `.ak-step-skip` sit inside `.ak-step`, which is an enabled
 * `<button>`. WCAG's exemption for inactive components does not reach them, and
 * "skip" names an action. They were #9aa295 at 2.54:1 — the last hardcoded grey
 * on the page, and the third instance of the same failure mode after
 * .ak-fineprint and .ak-soon-label.
 *
 * Measured against the previous stylesheet: 2.54, 2.54 and 4.47 — three of the
 * four below fail, and the fourth passes by three hundredths.
 */
test.describe("inside an open plate sheet", () => {
  test.beforeEach(async ({ page }) => {
    await page
      .locator("main button")
      .filter({ hasText: /Pick Any/i })
      .first()
      .click();
    await expect(page.locator(".ak-step").first()).toBeVisible();
  });

  for (const [selector, note] of [
    ['.ak-step[data-state="todo"] .ak-step-n', "a step not yet reached"],
    ['.ak-step[data-state="now"] .ak-step-n', "the current step, on --wash"],
    [".ak-step-skip", "an action, not a label"],
    [".ak-step-label", "the step's name"],
  ] as const) {
    test(`${selector} clears AA — ${note}`, async ({ page }) => {
      const r = await page.evaluate(measureContrast, selector);
      expect(r.error, `${selector} should exist`).toBeUndefined();
      expect(
        r.ratio,
        `${selector} at ${r.size}px measures ${r.ratio}:1, needs ${AA_SMALL}`,
      ).toBeGreaterThanOrEqual(AA_SMALL);
    });
  }

  /* The primary button is genuinely `disabled` until a choice is made, and
     SC 1.4.3 exempts inactive components — so its 1.65:1 is NOT a failure.
     Asserted so that nobody "fixes" it later, and so the exemption stops
     applying loudly if the button is ever left enabled while it looks spent. */
  test("the disabled CTA is actually disabled, which is why its contrast is exempt", async ({
    page,
  }) => {
    const cta = page.locator(".ak-sheet .ak-btn, .ak-btn").last();
    await expect(cta).toBeDisabled();
  });
});
