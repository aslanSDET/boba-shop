import { notThisDeployment, SquareError } from "@/pos/square/client";
import { createOrderAndPay, CheckoutRequestError, type CheckoutRequest } from "@/pos/square/order";

/**
 * POST /api/square/pay — create the order, then charge the card.
 *
 * `idempotencyKey` is required, not optional. Square rejects a write without
 * one, which is a real improvement on Clover where it was accepted and could
 * never be confirmed as honoured. One key per checkout attempt, minted once by
 * the browser and kept in sessionStorage.
 *
 * Do NOT hash the cart to derive it. Two strangers ordering the same plate a
 * minute apart hash identically, and the second would be handed the first
 * one's order to pay for — the trap already written up in the Clover checkout
 * route.
 */
export async function POST(request: Request) {
  const wrongShop = notThisDeployment();
  if (wrongShop) return wrongShop;

  let body: CheckoutRequest & { sourceId?: string; idempotencyKey?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!body.sourceId) {
    return Response.json({ error: "Missing the card token." }, { status: 400 });
  }
  if (!body.idempotencyKey) {
    return Response.json({ error: "Missing idempotencyKey." }, { status: 400 });
  }

  try {
    const result = await createOrderAndPay({
      request: { lines: body.lines, tipCents: body.tipCents },
      sourceId: body.sourceId,
      idempotencyKey: body.idempotencyKey,
      note: body.note,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof CheckoutRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SquareError) {
      // A decline is a 402 with a code, not a server fault. Reporting it as a
      // 500 tells the customer the shop is broken when their card was refused.
      return Response.json({ error: error.customerMessage, code: error.code }, { status: error.status });
    }
    return Response.json(
      { error: "Square is not configured on this deployment." },
      { status: 503 },
    );
  }
}
