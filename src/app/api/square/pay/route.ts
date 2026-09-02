import { notThisDeployment, SquareError } from "@/pos/square/client";
import { createOrderAndPay } from "@/pos/square/order";
import { parseCheckoutRequest, parseCustomer, RequestError, ticketLabel } from "@/pos/square/request";

/**
 * POST /api/square/pay — create the order, then charge the card.
 *
 * ── EVERYTHING FROM THE BROWSER IS PARSED, NOT TRUSTED ───────────────────────
 *
 * This route is unauthenticated and creates real objects on a real merchant's
 * account. `request.ts` holds every bound and the reasoning; the one that
 * mattered is that `tipCents` used to travel straight into Square's `tip_money`
 * unchecked, so a negative tip reduced the charge below the price of the food.
 *
 * The food price itself was never at risk — it comes back from Square and the
 * browser only ever sends item ids — but a client-supplied number was being
 * added to it without a second look.
 *
 * `idempotencyKey` is required. Square rejects a write without one, which is a
 * real improvement on Clover where it was accepted and could never be confirmed
 * as honoured. One key per checkout attempt, minted once by the browser.
 *
 * Do NOT hash the cart to derive it: two strangers ordering the same plate a
 * minute apart hash identically, and the second would be handed the first one's
 * order to pay for.
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

  const body = raw as Record<string, unknown>;

  try {
    const checkout = parseCheckoutRequest(body);
    const customer = parseCustomer(body.customer);

    if (typeof body.sourceId !== "string" || !body.sourceId) {
      return Response.json({ error: "Missing the card token." }, { status: 400 });
    }
    if (typeof body.idempotencyKey !== "string" || !body.idempotencyKey) {
      return Response.json({ error: "Missing idempotencyKey." }, { status: 400 });
    }

    const result = await createOrderAndPay({
      request: checkout,
      sourceId: body.sourceId,
      idempotencyKey: body.idempotencyKey,
      note: ticketLabel(customer),
      buyerEmail: customer.email,
      buyerPhone: customer.phone,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof RequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SquareError) {
      /* A decline is a 402 with a code, not a server fault. Reporting it as a
         500 tells the customer the shop is broken when their card was refused. */
      return Response.json(
        { error: error.customerMessage, code: error.code },
        { status: error.status },
      );
    }
    return Response.json(
      { error: "Square is not configured on this deployment." },
      { status: 503 },
    );
  }
}
