import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * ── ONE BUILD DIRECTORY PER RESTAURANT, WHEN ASKED FOR ─────────────────────
   *
   * `RESTAURANT` is read once at module load and the pages are statically
   * prerendered, so a build IS a restaurant — `.next` holds Snowdaes or Asian
   * Kitchen, never both. That is invariant 5 working as intended for deploys
   * (one restaurant per deployment), but it makes the two E2E suites exclusive:
   * running one overwrites the build the other needs, and `next start` serves
   * whatever is on disk without complaint. The failure mode is a suite quietly
   * testing the wrong restaurant.
   *
   * So the directory can be moved aside. Unset — which is every deploy, and
   * every ordinary `npm run build` — this is exactly `.next` and nothing about
   * Amplify changes. The Playwright configs set it, so both restaurants can be
   * built and tested side by side.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  /**
   * `next dev` refuses cross-origin requests for its own dev resources, so
   * reaching this machine through a tunnel returns 403 on every asset and the
   * page arrives unstyled and inert — which reads as "nothing is clickable"
   * rather than as a network refusal.
   *
   * Needed because the proof of concept gets demonstrated on a phone, and on
   * the shop's wifi rather than this laptop's localhost. It is a DEV-only
   * allowance; `next build` ignores it, so nothing here widens what a deployed
   * site accepts.
   *
   * ngrok mints a new hostname per free-tier session — if the tunnel is
   * restarted, this string changes with it.
   */
  allowedDevOrigins: ["gear-mountain-antiques.ngrok-free.dev"],
};

export default nextConfig;
