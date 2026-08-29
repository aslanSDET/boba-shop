import { fetchWeek, nowAtShop, SHOP_TIMEZONE, type HoursPayload } from "@/lib/clover-hours";

/**
 * GET /api/hours — the schedule, plus the shop's local time as an anchor.
 *
 * The response deliberately does NOT say whether the shop is open. That answer
 * changes every minute; the schedule changes twice a year. Sending the schedule
 * and letting the browser decide means one Clover call an hour instead of one a
 * minute, and a badge that flips exactly on the minute rather than up to a
 * cache window late.
 *
 * The anchor is our clock, not the visitor's, so a device with the wrong time
 * cannot send somebody to a locked door.
 *
 * `week: []` means we could not find out — no hours published, or Clover
 * unreachable. The badge renders nothing. A shop whose hours we cannot read is
 * not a closed shop, and a wrong CLOSED costs real orders.
 */
// Dynamic on purpose: the anchor must be read fresh on every request. The
// expensive half — the Clover call — is memoised inside `fetchWeek`.
export const dynamic = "force-dynamic";

export async function GET() {
  const timeZone = SHOP_TIMEZONE;
  try {
    const week = await fetchWeek();
    const payload: HoursPayload = {
      week,
      anchor: nowAtShop(timeZone),
      timeZone,
    };
    return Response.json(payload);
  } catch {
    return Response.json({ week: [], anchor: null, timeZone } satisfies HoursPayload);
  }
}
