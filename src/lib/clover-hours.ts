import { merchantId, platform } from "@/lib/clover";

/**
 * The shop's opening hours, and whether it is open right now.
 *
 * ── TWO JOBS WITH VERY DIFFERENT SHELF LIVES ─────────────────────────────────
 *
 * The schedule changes about twice a year. Whether the shop is open changes on
 * a minute boundary. Answering both server-side forced one cache window to
 * serve both, and the honest window was 60s — which meant a Clover call every
 * minute, forever, for a fact that almost never moves.
 *
 * So they are split:
 *
 *   fetchWeek()   I/O. Rare. Cached for an hour. Replaceable.
 *   openAt()      Pure. No I/O, no imports, no clock of its own.
 *
 * The route sends the week plus the shop's current local time as an ANCHOR, and
 * the browser ticks forward from it. The badge flips exactly on the minute
 * without another request, and it is anchored to OUR clock rather than the
 * visitor's, so a device with the wrong time cannot send somebody to a locked
 * door.
 *
 * ── WHERE THE DATABASE GOES ──────────────────────────────────────────────────
 *
 * `fetchWeek` is the only function here that talks to Clover, and it returns
 * plain data. When this moves to AWS, a DynamoDB read — kept fresh by the
 * catalog sync or a Clover webhook — replaces its body, and nothing else in
 * this file or in the UI changes. Do not let Clover calls leak into `openAt` or
 * into components; that is what keeps the swap a one-function job.
 *
 * ── THE SHAPE, MEASURED ──────────────────────────────────────────────────────
 *
 * `GET /v3/merchants/{mId}/opening_hours` returns a LIST of named sets, each
 * carrying all seven days, each day holding its own `elements` array of ranges.
 * Times are four-digit local integers: 1930 is 7:30pm, not 1930 minutes. A day
 * can hold more than one range — that is how a shop shuts for an afternoon — so
 * an empty array means genuinely closed. Clover refuses a partial week outright
 * ("sunday is missing"), so a set that exists is always complete.
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

export type Day = (typeof DAYS)[number];

const SHORT: Record<Day, string> = {
  sunday: "Sun",
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
};

/**
 * Both shops are in Massachusetts.
 *
 * Clover's merchant endpoint returns no timezone, and reading the server's own
 * clock breaks the moment this deploys — a Lambda in us-east-1 is on UTC and
 * would call the shop closed at 8pm. Stated per-location, because §8.6 commits
 * to two stores and a third need not be in MA.
 */
export const SHOP_TIMEZONE = "America/New_York";

/** A range in Clover's four-digit local clock. 1200–1930 is noon to 7:30pm. */
export interface Range {
  start: number;
  end: number;
}

export interface DayHours {
  /** Clover's own key, so `openAt` can match without a lookup table. */
  key: Day;
  /** "Mon" — short enough for a column of seven. */
  label: string;
  ranges: Range[];
  /** "12pm–7:30pm", or null when closed that day. */
  hours: string | null;
}

export interface HoursPayload {
  /** Empty when the shop has published none. Never guess from emptiness. */
  week: DayHours[];
  /** The shop's local day and clock at the moment this was served. */
  anchor: { day: Day; clock: number } | null;
  timeZone: string;
}

/** "1930" -> "7:30pm", the way it is written on a door. */
export function formatClock(value: number): string {
  const hour24 = Math.floor(value / 100);
  const minute = value % 100;
  const suffix = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0
    ? `${hour12}${suffix}`
    : `${hour12}:${String(minute).padStart(2, "0")}${suffix}`;
}

/** Local wall-clock at the shop, as Clover's four-digit integer. */
export function nowAtShop(timeZone = SHOP_TIMEZONE): { day: Day; clock: number } {
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
  const weekday = get("weekday").toLowerCase();
  const day = (DAYS as readonly string[]).includes(weekday) ? (weekday as Day) : "sunday";

  return { day, clock: hour * 100 + minute };
}

export interface OpenState {
  /** null when we could not find out. NOT a synonym for closed. */
  open: boolean | null;
  /** "Opens 12pm" / "Closes 7:30pm" — the useful half of the answer. */
  detail: string | null;
}

/**
 * Pure: given a week and a moment, is the shop open?
 *
 * No clock, no network, no imports. The browser calls this against a locally
 * advanced anchor, which is why the badge flips exactly at closing time
 * without another request.
 */
export function openAt(week: DayHours[], day: Day, clock: number): OpenState {
  if (week.length === 0) return { open: null, detail: null };

  const today = week.find((d) => d.key === day);
  const ranges = today?.ranges ?? [];
  if (ranges.length === 0) return { open: false, detail: "Closed today" };

  const current = ranges.find((r) => clock >= r.start && clock < r.end);
  if (current) return { open: true, detail: `Closes ${formatClock(current.end)}` };

  const later = ranges.find((r) => clock < r.start);
  return {
    open: false,
    detail: later ? `Opens ${formatClock(later.start)}` : "Closed for today",
  };
}

/** Advance an anchor by whole minutes, rolling past midnight into the next day. */
export function advance(
  anchor: { day: Day; clock: number },
  minutes: number,
): { day: Day; clock: number } {
  const total = Math.floor(anchor.clock / 100) * 60 + (anchor.clock % 100) + minutes;
  const dayShift = Math.floor(total / (24 * 60));
  const withinDay = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  // + 7*52 keeps the index non-negative for a backwards anchor without a branch.
  const index = (DAYS.indexOf(anchor.day) + dayShift + 7 * 52) % 7;
  return {
    day: DAYS[index],
    clock: Math.floor(withinDay / 60) * 100 + (withinDay % 60),
  };
}

interface CloverRange {
  start?: number;
  end?: number;
}
type CloverSet = { id?: string } & Partial<Record<Day, { elements?: CloverRange[] }>>;

/** An hour. The schedule changes twice a year; this is already generous. */
const WEEK_TTL_MS = 60 * 60 * 1000;
let memo: { at: number; week: DayHours[] } | null = null;

/**
 * THE ONLY FUNCTION HERE THAT TALKS TO CLOVER.
 *
 * Swap its body for a DynamoDB read and nothing above or below changes.
 * Returns the week ordered Monday-first for display; `DAYS` stays Sunday-first
 * because that is how Clover indexes it.
 *
 * ── WHY THE CACHE IS HERE AND NOT ON THE ROUTE ───────────────────────────────
 *
 * Caching the whole HTTP response would cache the ANCHOR with it, and an
 * hour-old anchor is an hour-wrong badge. Correcting for that in the browser
 * does not work either: the drift would be `Date.now() - servedAt`, which mixes
 * the visitor's absolute clock with ours, so a device three hours out is three
 * hours wrong. So the route stays dynamic and reads the clock every time — free
 * — while the Clover call is memoised here.
 *
 * In-process, so each server instance holds its own copy and a cold start pays
 * for one call. That is the right shape for now and exactly what a DynamoDB
 * read replaces: same seam, same signature, shared across instances.
 */
export async function fetchWeek(): Promise<DayHours[]> {
  if (memo && Date.now() - memo.at < WEEK_TTL_MS) return memo.week;

  const response = await platform<{ elements?: CloverSet[] }>(
    `/v3/merchants/${merchantId()}/opening_hours` +
      "?expand=sunday,monday,tuesday,wednesday,thursday,friday,saturday",
  );

  const set = response.elements?.[0];
  if (!set) {
    // Cache the empty answer too, or an unconfigured merchant means a Clover
    // call on every single page load.
    memo = { at: Date.now(), week: [] };
    return [];
  }

  const order: Day[] = [...DAYS.slice(1), DAYS[0]];
  const week = order.map((key) => {
    const ranges = (set[key]?.elements ?? []).filter(
      (r): r is Range => typeof r.start === "number" && typeof r.end === "number",
    );
    return {
      key,
      label: SHORT[key],
      ranges,
      hours:
        ranges.length === 0
          ? null
          : ranges.map((r) => `${formatClock(r.start)}–${formatClock(r.end)}`).join(", "),
    };
  });

  memo = { at: Date.now(), week };
  return week;
}
