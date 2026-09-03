import { advance, formatClock, type Day, type DayHours } from "@/pos/clover/hours";

/**
 * When can this order be collected?
 *
 * ── CLOVER HAS NOWHERE TO PUT A PICKUP TIME ──────────────────────────────────
 *
 * Measured against the sandbox (`scripts/spike/09-tip-note-pickup.mjs`): a
 * read-back order carries `clientCreatedTime`, `createdTime` and
 * `modifiedTime`, and nothing else time-shaped. There is no scheduled-order
 * field, no due time, no fulfilment window. So a chosen pickup time cannot be
 * structured data on the order — it rides in the order NOTE, which the same
 * spike proved survives creation and stays writable afterwards.
 *
 * That is a real limitation and worth stating plainly rather than dressing up:
 * the time reaches the shop as a line of text a human reads off the ticket. It
 * does not schedule anything, it does not delay the ticket, and Clover will not
 * remind anyone.
 *
 * Which is exactly why the horizon below is TWO OPEN DAYS and not a week. Every
 * extra day is a promise the mechanism cannot keep, and a shop that finds a
 * ticket for Thursday sitting in Monday's queue is worse served than one that
 * was never offered Thursday.
 *
 * ── WHY THE SLOTS COME FROM THE SHOP'S OWN HOURS ─────────────────────────────
 *
 * The alternative is a fixed list, and a fixed list offers 7:30pm on a day the
 * shop shuts at 6. The hours already arrive for the OPEN/CLOSED badge, from
 * Clover, through one request — so the picker costs nothing extra and cannot
 * disagree with the badge sitting a few inches above it.
 *
 * Everything here is PURE. No clock, no network. The caller passes the anchor
 * it already has, which is the shop's local time rather than the visitor's, so
 * a phone with the wrong time cannot be offered a slot the shop is closed for.
 */

/**
 * The soonest anything can be collected.
 *
 * Thirty minutes, not the fifteen the menu quotes as a wait: a quoted wait
 * starts when the counter picks the ticket up, and this starts when the
 * customer presses Pay. Promising the quoted wait as a pickup TIME is how an
 * order gets collected before it is made.
 */
export const LEAD_MINUTES = 30;

/** Quarter-hour slots: fine enough to be useful, coarse enough to scan. */
export const STEP_MINUTES = 15;

/**
 * How many days that are actually OPEN to offer, counting the current one.
 *
 * Days, not hours, because the interesting case is a shop that is shut: at
 * 9pm on a Monday the useful answer is Tuesday morning, and an hours-based
 * horizon would return nothing at all. See the note above on why this is small.
 */
export const OPEN_DAYS_AHEAD = 2;

/** How far to search for those open days before giving up. */
const SEARCH_DAYS = 8;

/**
 * The last slot sits this far before closing.
 *
 * Offering the exact closing minute is offering a locked door: the staff are
 * cashing out, and an order placed for 7:45 when the shop shuts at 7:45 is one
 * nobody can hand over.
 */
export const CLOSING_BUFFER_MINUTES = 15;

export interface PickupOption {
  /** Goes in the order note and into sessionStorage: "asap", or "1:1100". */
  value: string;
  /** "4:15pm" — the time alone. The day is carried by `groupLabel`. */
  label: string;
  /** "Today" / "Tomorrow" / "Wednesday" — the heading this slot sits under. */
  groupLabel: string;
  /** Whole days ahead of the anchor. 0 is today. */
  dayOffset: number;
  /** Four-digit local clock. */
  clock: number;
}

export const ASAP = { value: "asap", label: "As soon as possible" } as const;

const WEEKDAY: Record<Day, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

/** Round a four-digit clock up to the next `step`-minute boundary. */
function roundUpToStep(clock: number, step: number): number {
  const minutes = Math.floor(clock / 100) * 60 + (clock % 100);
  const rounded = Math.ceil(minutes / step) * step;
  return Math.floor(rounded / 60) * 100 + (rounded % 60);
}

function groupLabelFor(offset: number, day: Day): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  return WEEKDAY[day];
}

/**
 * Every time the customer may pick, in order, starting with the soonest.
 *
 * Empty when the hours are unknown — the caller then falls back to ASAP alone,
 * which is the same rule the badge follows: a shop whose hours we cannot read
 * is not a closed shop, so we offer the option that is always valid rather than
 * none at all.
 */
export function pickupSlots(
  week: DayHours[],
  anchor: { day: Day; clock: number } | null,
): PickupOption[] {
  if (!anchor || week.length === 0) return [];

  /* The earliest the counter could realistically have it ready. Rolling past
     midnight is handled by `advance`, and the resulting day is respected — an
     order placed at 11:50pm cannot be collected at 12:20am "today". */
  const earliest = advance(anchor, LEAD_MINUTES);
  /* 0 while the lead time lands on the same day, 1 once it crosses midnight.
     Days BEFORE this one are entirely in the past and must be skipped outright,
     not merely floored — otherwise an order at 11:50pm on Monday is offered
     Monday lunchtime. */
  const earliestOffset = earliest.day === anchor.day ? 0 : 1;

  const options: PickupOption[] = [];
  let openDaysFound = 0;

  for (let offset = 0; offset < SEARCH_DAYS && openDaysFound < OPEN_DAYS_AHEAD; offset++) {
    if (offset < earliestOffset) continue;

    const at = advance(anchor, offset * 24 * 60);
    const ranges = week.find((d) => d.key === at.day)?.ranges ?? [];
    if (ranges.length === 0) continue;

    /* The lead time constrains only the day it lands on. Every later day opens
       from its own opening time. */
    const floor = offset === earliestOffset ? earliest.clock : 0;

    const before = options.length;

    for (const range of ranges) {
      const lastUsable = advance(
        { day: at.day, clock: range.end },
        -CLOSING_BUFFER_MINUTES,
      ).clock;

      let clock = roundUpToStep(Math.max(floor, range.start), STEP_MINUTES);

      while (clock <= lastUsable) {
        options.push({
          value: `${offset}:${String(clock).padStart(4, "0")}`,
          label: formatClock(clock),
          groupLabel: groupLabelFor(offset, at.day),
          dayOffset: offset,
          clock,
        });
        const next = advance({ day: at.day, clock }, STEP_MINUTES);
        /* Past midnight is past this day's remit, and without this a range
           ending at 2400 would loop forever on a clock that wraps to 0000. */
        if (next.day !== at.day) break;
        clock = next.clock;
      }
    }

    /* A day only counts against the horizon if it actually yielded something.
       Today, late in the evening, contributes nothing and must not consume the
       budget that tomorrow needs. */
    if (options.length > before) openDaysFound++;
  }

  return options;
}

/**
 * The soonest slot, which is what a closed shop should default to.
 *
 * When the shop is shut, "as soon as possible" is not an answer — it is a
 * promise nobody is in the building to keep. The honest default is the first
 * moment they could actually hand it over.
 */
export function nextAvailable(slots: PickupOption[]): PickupOption | null {
  return slots[0] ?? null;
}

/** Slots grouped under their day, ready for `<optgroup>`s. */
export function groupByDay(slots: PickupOption[]): Array<{ label: string; slots: PickupOption[] }> {
  const groups: Array<{ label: string; slots: PickupOption[] }> = [];
  for (const slot of slots) {
    const last = groups[groups.length - 1];
    if (last && last.label === slot.groupLabel) last.slots.push(slot);
    else groups.push({ label: slot.groupLabel, slots: [slot] });
  }
  return groups;
}

function find(slots: PickupOption[], value: string): PickupOption | undefined {
  return slots.find((s) => s.value === value);
}

/**
 * The choice as a person would say it: "4:15pm", "Tomorrow at 11:00am".
 *
 * The DAY is spelled out whenever it is not today. "4:15pm" on a ticket printed
 * on Monday night does not say Tuesday, and the kitchen note is the only place
 * this information exists at all — Clover has no scheduled-order field.
 *
 * Resolved here, on the client, because this is where the shop's hours are. The
 * server receives the finished phrase and only decides how to frame it on the
 * ticket.
 */
export function pickupLabel(value: string, slots: PickupOption[]): string {
  if (value === ASAP.value) return ASAP.label;
  const slot = find(slots, value);
  if (!slot) return ASAP.label;
  return slot.dayOffset === 0 ? slot.label : `${slot.groupLabel} at ${slot.label}`;
}
