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
