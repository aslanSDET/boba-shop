/**
 * Which restaurant this deployment serves.
 *
 * `PLATFORM.md` §2 settles that each restaurant gets its own deployment rather
 * than a shared multi-tenant one, so this is a **constant per environment**, not
 * a request-time lookup. One env var, read once, validated loudly.
 *
 *   RESTAURANT=snowdaes      npm run dev
 *   RESTAURANT=asian-kitchen npm run dev
 *
 * Unset defaults to Snowdaes, which is what `/` served before this existed.
 *
 * ── WHY THIS REPLACED A ROUTE PER RESTAURANT ─────────────────────────────────
 *
 * Both shops used to live in one dev server, Snowdaes at `/` and Asian Kitchen
 * at `/asian-kitchen`. That forced Next route groups — `app/(snowdaes)/` — to
 * say who owned `/` and `/api/*`, because a plain `app/api/` reads as "the
 * app's API" when it is one shop's Clover integration. Parenthesised folders are
 * Next arcana, and the asymmetry (one restaurant grouped, one not) was worse.
 *
 * Selecting the restaurant here removes the problem rather than labelling it:
 * every deployment serves one shop at `/`, which is what production looks like
 * anyway.
 */
export const RESTAURANTS = ["snowdaes", "asian-kitchen"] as const;
export type RestaurantId = (typeof RESTAURANTS)[number];

function resolve(): RestaurantId {
  const raw = (process.env.RESTAURANT ?? "snowdaes").trim().toLowerCase();
  if ((RESTAURANTS as readonly string[]).includes(raw)) return raw as RestaurantId;
  throw new Error(
    `RESTAURANT="${raw}" is not a restaurant in this repo. ` +
      `Expected one of: ${RESTAURANTS.join(", ")}.`,
  );
}

export const ACTIVE_RESTAURANT: RestaurantId = resolve();
