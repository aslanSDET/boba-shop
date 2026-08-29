import { merchantId, platform } from "@/lib/clover";

/**
 * The shop's real opening hours, read from its own Clover account.
 *
 * Clover keeps hours on the merchant, which means the owner edits them in the
 * dashboard they already use and this site follows — nobody maintains a second
 * copy that drifts. Same principle as the menu: Clover owns the fact.
 *
 * ── THE SHAPE, MEASURED ──────────────────────────────────────────────────────
 *
 * `GET /v3/merchants/{mId}/opening_hours` returns a LIST of named sets, each
 * carrying all seven days, and each day holding its own `elements` array of
 * ranges. Times are four-digit local integers: 1930 is 7:30pm, not 1930
 * minutes. A day can hold more than one range — that is how a shop closes for
 * an afternoon — so an empty array means genuinely closed that day.
 *
 * The API refuses a partial week ("sunday is missing. Please specify hour range
 * for all 7 days"), so a set is always complete once it exists.
 */

const DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

type Day = (typeof DAYS)[number];

interface Range {
  start?: number;
  end?: number;
}

type HoursSet = { id?: string; name?: string } & Partial<Record<Day, { elements?: Range[] }>>;

/**
 * Both shops are in Massachusetts.
 *
 * Clover's merchant endpoint does not return a timezone on our test merchant,
 * and guessing from the server's own clock is wrong the moment this deploys —
 * a Lambda in us-east-1 is on UTC and would call the shop closed at 8pm. So
 * the zone is stated rather than inferred, and stated per-location, because
 * §8.6 already commits to two stores and a future one need not be in MA.
 */
export const SHOP_TIMEZONE = "America/New_York";

/** "1930" -> "7:30pm", the way a person writes it on a door. */
export function formatClock(value: number): string {
  const hour24 = Math.floor(value / 100);
  const minute = value % 100;
  const suffix = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12}${suffix}` : `${hour12}:${String(minute).padStart(2, "0")}${suffix}`;
}

/** Local wall-clock time at the shop, as Clover's four-digit integer. */
function nowAtShop(timeZone: string): { day: Day; clock: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // hourCycle h23 still yields "24" at midnight in some engines.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const weekday = get("weekday").toLowerCase() as Day;

  return { day: DAYS.includes(weekday) ? weekday : "sunday", clock: hour * 100 + minute };
}

export interface OpenState {
  /** null when the shop has published no hours — say nothing rather than guess. */
  open: boolean | null;
  /** "12–7:30pm", or null when closed today or unknown. */
  todayLabel: string | null;
  /** "Opens 12pm" / "Closes 7:30pm" — the useful half of the answer. */
  detail: string | null;
}

/**
 * Read the hours and decide.
 *
 * Returns `open: null` rather than `false` when nothing is published. A shop
 * that has not filled in its hours is not a closed shop, and telling customers
 * it is shut would cost real orders — the badge is hidden instead.
 */
export async function openState(timeZone = SHOP_TIMEZONE): Promise<OpenState> {
  const response = await platform<{ elements?: HoursSet[] }>(
    `/v3/merchants/${merchantId()}/opening_hours` +
      "?expand=sunday,monday,tuesday,wednesday,thursday,friday,saturday",
  );

  const set = response.elements?.[0];
  if (!set) return { open: null, todayLabel: null, detail: null };

  const { day, clock } = nowAtShop(timeZone);
  const ranges = (set[day]?.elements ?? []).filter(
    (r): r is Required<Range> => typeof r.start === "number" && typeof r.end === "number",
  );

  if (ranges.length === 0) {
    return { open: false, todayLabel: null, detail: "Closed today" };
  }

  const todayLabel = ranges
    .map((r) => `${formatClock(r.start)}–${formatClock(r.end)}`)
    .join(", ");

  const current = ranges.find((r) => clock >= r.start && clock < r.end);
  if (current) {
    return { open: true, todayLabel, detail: `Closes ${formatClock(current.end)}` };
  }

  const later = ranges.find((r) => clock < r.start);
  return {
    open: false,
    todayLabel,
    detail: later ? `Opens ${formatClock(later.start)}` : "Closed for today",
  };
}
