/**
 * Who Asian Kitchen is. Everything here came from the restaurant itself —
 * their sign, their listing — rather than from us.
 */
export const RESTAURANT = {
  name: "Asian Kitchen",
  /** Printed on their sign, under the wordmark. Their own description. */
  tagline: "Hibachi · Asian · Philly Steak",
  address: "1652 Center Point Pkwy, Birmingham, AL 35215",
  /** Central, not Eastern. Snowdaes' hard-coded America/New_York is wrong here. */
  timeZone: "America/Chicago",
  /** Single range, every day, per their ordering page. */
  hours: { open: "10:30", close: "19:45" },
  /** Rating on their public ordering listing, 1 Sep 2026. Not shown on the
   *  page: a score with no source next to it is a claim we cannot stand behind. */
  rating: { score: 4.5, count: "3k+" },
  /**
   * The band under the header. `poster` is a still of their own counter and is
   * what shows until `video` exists — which is also exactly what a <video
   * poster> paints before its first frame decodes, so the day the owner shoots
   * a loop this becomes a one-line change and nothing else moves.
   *
   * A clip belongs here only if it is muted, seamless and under ~2 MB: this is
   * a phone-first page and the band is decoration, not the order.
   */
  hero: {
    poster: "/asian-kitchen/hero-neon.svg",
    video: undefined as string | undefined,
    eyebrow: "Pickup only",
    headline: "Order here, collect at the counter",
  },
  /** Not known. Left null rather than invented — see docs/ASIAN-KITCHEN.md §6. */
  phone: null as string | null,
} as const;

/**
 * ESTIMATED from a photograph of the storefront and NOT their real brand green.
 * Replace with the value from the owner's artwork before this goes anywhere
 * public — it is referenced from `theme.css` and nowhere else, so it is one edit.
 */
/**
 * Sales tax, as a percentage, applied to every order.
 *
 * ── THIS IS A PLACEHOLDER, AND IT IS THE ONLY NUMBER HERE THAT IS ────────────
 *
 * The sandbox merchant has **no TAX object in its catalog** (measured), so
 * Square correctly returns `$0.00` tax and the checkout showed a zero tax line
 * — accurate, and it reads as broken.
 *
 * 10% is in the right neighbourhood for prepared food in Birmingham, which
 * stacks state, county and city rates, but it has NOT been confirmed against
 * the shop's own register and must be before anyone is charged for real. It is
 * a `docs/ASIAN-KITCHEN.md` §6 question.
 *
 * ── HOW THIS DOES NOT BREAK "THE POS IS THE CALCULATOR" ──────────────────────
 *
 * We send Square the RATE and Square computes the AMOUNT, as an order-scoped
 * tax on the order it is already pricing. We never multiply anything. That is
 * the same division already accepted for the unit price: the menu is
 * transcribed, so we supply what an item costs and Square works out the total
 * (`pos/square/order.ts`).
 *
 * The moment there is a catalog sync, this constant should disappear — a real
 * merchant carries its tax on the location, `CalculateOrder` picks it up with
 * no help from us, and that is strictly better than a number in a repo.
 */
export const SALES_TAX_PERCENT = "10";

export const BRAND_GREEN = "#1E9350";

/** "10:30" -> "10:30 am", the way it reads on a door. */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/**
 * Open right now, in the shop's timezone — never the visitor's.
 *
 * A device with the wrong clock, or a customer ordering from another state,
 * must not be told the shop is shut. Same reasoning as Snowdaes'
 * `lib/clover-hours.ts`, which is why the timezone is named per restaurant.
 */
export function isOpenNow(now: Date = new Date()): { open: boolean; label: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESTAURANT.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const minutes = (get("hour") % 24) * 60 + get("minute");

  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const open = minutes >= toMin(RESTAURANT.hours.open) && minutes < toMin(RESTAURANT.hours.close);

  return {
    open,
    label: open
      ? `Open till ${clockLabel(RESTAURANT.hours.close)}`
      : `Opens ${clockLabel(RESTAURANT.hours.open)}`,
  };
}
