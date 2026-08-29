import { openState } from "@/lib/clover-hours";

/**
 * GET /api/hours — is the shop open right now, per its own Clover account.
 *
 * Cached for a minute at the edge. Hours change about twice a year, but "open"
 * flips on a minute boundary, and a stale badge saying OPEN NOW ninety seconds
 * after closing sends somebody to a locked door.
 *
 * A failure returns `open: null`, not `false`. If Clover is unreachable we do
 * not know whether the shop is open, and claiming it is shut costs real orders.
 */
export const revalidate = 60;

export async function GET() {
  try {
    return Response.json(await openState());
  } catch {
    return Response.json({ open: null, todayLabel: null, detail: null });
  }
}
