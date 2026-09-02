import { notThisDeployment, SquareError } from "@/pos/square/client";
import { calculateOrder, CheckoutRequestError, type CheckoutRequest } from "@/pos/square/order";

/**
 * POST /api/square/checkout — price the cart. Creates nothing.
 *
 * This route is safe to call on every keystroke of the tip selector, which is
 * the whole point: `CalculateOrder` returns Square's own totals without
 * persisting an order. The Clover equivalent had to create one, and every
 * orphaned OPEN order this project has swept up came from that.
 *
 * The browser sends ids and counts. It does not send prices, and prices in the
 * request would be ignored if it did.
 */
export async function POST(request: Request) {
  const wrongShop = notThisDeployment();
  if (wrongShop) return wrongShop;

  let body: CheckoutRequest;
  try {
    body = (await request.json()) as CheckoutRequest;
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  try {
    return Response.json(await calculateOrder(body));
  } catch (error) {
    if (error instanceof CheckoutRequestError) {
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
