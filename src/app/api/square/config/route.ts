import { notThisDeployment, SQUARE_ENV } from "@/pos/square/client";
import { credential } from "@/pos/square/creds";
import { locationId } from "@/pos/square/order";

/**
 * The two values the browser needs to render Square's payment form.
 *
 * Both are safe to hand out. The application id identifies the app, not the
 * merchant's money, and the location id is on every receipt the shop prints.
 * The access token — the thing that can actually move money — stays server-side
 * and is not in this response. Same division as the Clover PAKMS route.
 *
 * Not cached: once this serves more than one location, a cached location id
 * would take a payment against the wrong shop.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const wrongShop = notThisDeployment();
  if (wrongShop) return wrongShop;

  let applicationId: string;
  try {
    applicationId = await credential("SQUARE_APPLICATION_ID");
  } catch {
    return Response.json(
      { error: "Square is not configured on this deployment." },
      { status: 503 },
    );
  }

  let location: string;
  try {
    location = await locationId();
  } catch {
    // Deliberately vague to the browser; the detail is in the server log.
    return Response.json({ error: "Could not reach Square." }, { status: 502 });
  }

  return Response.json({
    applicationId,
    locationId: location,
    environment: SQUARE_ENV,
  });
}
