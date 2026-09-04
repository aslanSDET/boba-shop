import { defineConfig, devices } from "@playwright/test";

/* The suite reads SQUARE_SANDBOX_ACCESS_TOKEN to assert against the merchant's
   own books, so .env.local has to be loaded here as well as by Next. */
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
  /* No .env.local: the tests that need it will fail loudly rather than silently. */
}


/**
 * E2E, and specifically the parts that cannot be checked any other way.
 *
 * ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────
 *
 * Square documents that **Chrome extensions do not work with the Web Payments
 * SDK**. Claude Code's browser automation is a Chrome extension, so the card
 * iframe silently refuses synthetic input from it — the form renders, the
 * fields look focused, and nothing lands. The money path had to be driven
 * server-side with a test nonce instead, which proves the API integration and
 * proves nothing at all about the form a customer actually types into.
 *
 * Playwright drives Chrome over CDP rather than as an extension, so the SDK
 * treats its input as real. That closes the one gap, and `PLAN.md` §4 had
 * already chosen Playwright for E2E anyway.
 *
 * ── THE SERVER IS A PRODUCTION BUILD, NOT `next dev` ─────────────────────────
 *
 * `RESTAURANT` is read once at module load (`restaurants/active.ts`), and the
 * page under test is statically prerendered. A dev server would exercise a
 * different rendering path from the one that ships. This project has been
 * bitten by exactly that gap before — a green build hiding a page that did not
 * render — which is why AGENTS.md says to verify in a browser.
 */
export default defineConfig({
  /*
   * One directory per restaurant, and the directory IS the selector.
   *
   * This used to be `testDir: "./tests"` plus `testIgnore: /snowdaes.*\.spec\.ts/`,
   * which made the filename load-bearing: a Snowdaes spec named
   * `promo-rail.spec.ts` would have been picked up here and run against Asian
   * Kitchen's server on port 3210, failing for a reason with nothing to do with
   * the test. Shared helpers live in `tests/support/` and are imported, never
   * collected — Playwright only globs `*.spec.ts`.
   */
  testDir: "./tests/asian-kitchen",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? "line" : [["list"]],
  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: "http://localhost:3210",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    /*
     * Port 3210 rather than 3000: this project routinely has other servers up,
     * and a suite that silently tests whatever happens to be listening is worse
     * than one that fails to start.
     *
     * It BUILDS first, like the Snowdaes config does.
     *
     * It used to run `next start` alone and serve whatever `.next` held, which
     * kept a run fast at the price of a suite that could not see a change you
     * had not built. The comment here already warned about it — "the header
     * tests passed against a stale bundle while the fixed stylesheet sat
     * unbuilt beside it" — and it happened a second time anyway: 49 green runs
     * against a stale build, and a real 320px header failure that only appeared
     * once someone rebuilt by hand. A footgun documented is still a footgun,
     * and a suite that reports green on code it did not load is worse than a
     * slow one.
     */
    command:
      "RESTAURANT=asian-kitchen npx next build && " +
      "RESTAURANT=asian-kitchen npx next start -p 3210",
    url: "http://localhost:3210",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
