import { defineConfig, devices } from "@playwright/test";

/* Same .env.local load as the Asian Kitchen config: the suite reads Clover
   credentials and the sandbox test card, and Playwright does not load it. */
import { readFileSync } from "node:fs";
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [k, ...rest] = t.split("=");
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k.trim()) && !process.env[k.trim()]) {
      process.env[k.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* No .env.local: the tests that need it skip, loudly, rather than lying. */
}

/**
 * Snowdaes' E2E suite. Separate from `playwright.config.ts` for one reason:
 *
 * ── A BUILD IS A RESTAURANT ──────────────────────────────────────────────────
 *
 * `RESTAURANT` is read once at module load and `/` is statically prerendered,
 * so `.next` contains one restaurant, never both. Two suites sharing one build
 * directory means running either one silently invalidates the other — and
 * `next start` serves whatever is on disk without complaint, so the symptom is
 * a green suite that tested the wrong shop.
 *
 * So this build goes to `.next-snowdaes` (see `NEXT_DIST_DIR` in
 * next.config.ts) on its own port. Nothing about a deploy changes: unset, the
 * directory is exactly `.next`.
 *
 * Unlike the Asian Kitchen config, the webServer command BUILDS first. That
 * config deliberately does not, to keep its runs fast — but it pays for that
 * with a documented footgun ("run the build after touching anything the browser
 * loads"), and a second suite that can invalidate the first is not the place to
 * repeat it.
 */
export default defineConfig({
  /* The directory is the selector — see the note in `playwright.config.ts`.
     Nothing outside `tests/snowdaes/` runs here, and adding a spec no longer
     means remembering to prefix its filename. */
  testDir: "./tests/snowdaes",
  /* Pricing on Clover CREATES an order, so a run leaves real objects behind.
     See tests/support/sweep-sandbox.ts — it deletes only what this run created,
     and never anything carrying a payment. */
  globalSetup: "./tests/support/sweep-sandbox-setup.ts",
  globalTeardown: "./tests/support/sweep-sandbox.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? "line" : [["list"]],
  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: "http://localhost:3211",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          /*
           * ── WHY THE CARD FIELDS NEED THIS, AND WHY IT IS NOT A PRODUCT BUG ──
           *
           * Clover serves each card field from `checkout.sandbox.dev.clover.com`
           * in its own sandboxed iframe, and the widget inside is a Stencil
           * component that needs cross-origin access to initialise. In a browser
           * profile a real person uses, it gets it and the fields render — which
           * is exactly what happens when the page is opened by hand.
           *
           * A fresh automation profile is stricter, and the failure is SILENT:
           * measured, the frame loads, `customElements.get("checkout-elements")`
           * is defined, both scripts fetch with no network error and no console
           * error, `document.readyState` is "complete" — and the component
           * simply never renders. Zero inputs, no diagnostic of any kind.
           *
           * Measured across the alternatives: bundled Chromium and the real
           * installed Chrome (`channel: "chrome"`) both fail, headed and
           * headless alike, and disabling third-party storage partitioning
           * alone does not help. `--disable-web-security` is what makes the
           * fields appear.
           *
           * It is a blunt flag, so it is worth being precise about what it does
           * and does not buy: it compensates for the automation profile, it does
           * not paper over something a customer would hit. The suite would
           * otherwise have to skip the only test that touches the real card
           * form, which is the one thing no server-side test can reach.
           */
          args: ["--disable-web-security"],
        },
      },
    },
  ],

  webServer: {
    command:
      "NEXT_DIST_DIR=.next-snowdaes RESTAURANT=snowdaes npx next build && " +
      "NEXT_DIST_DIR=.next-snowdaes RESTAURANT=snowdaes npx next start -p 3211",
    url: "http://localhost:3211",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
