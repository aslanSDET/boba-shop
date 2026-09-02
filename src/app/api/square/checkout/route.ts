import { notThisDeployment, SquareError } from "@/pos/square/client";
import { calculateOrder } from "@/pos/square/order";
import { parseCheckoutRequest, RequestError } from "@/pos/square/request";

/**
 * POST /api/square/checkout — price the cart. Creates nothing.
 *
 * Safe to call on every tip change, which is the point: `CalculateOrder`
 * returns Square's own totals without persisting an order. The Clover
 * equivalent had to create one, and every orphaned OPEN order this project has
 * swept up came from that.
 *
 * The browser sends ids and counts. Prices in the request would be ignored, and
 * the bounds in `request.ts` apply here too — pricing is cheap but it is not
 * free, and an unbounded cart is still an unbounded API call.
 */
export async function POST(request: Request) {
  const wrongShop = notThisDeployment();
  if (wrongShop) return wrongShop;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  try {
    return Response.json(await calculateOrder(parseCheckoutRequest(raw)));
  } catch (error) {
    if (error instanceof RequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SquareError) {
      return Response.json({ error: error.customerMessage }, { status: error.status });
    }
    return Response.json(
      { error: "Square is not configured on this deployment." },
      { status: 503 },
    );
  }
}
