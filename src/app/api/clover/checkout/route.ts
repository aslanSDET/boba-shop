import { notThisDeployment } from "@/pos/clover/client";
/**
 * POST /api/checkout — price the cart by building the order in Clover.
 *
 * Request (the browser sends ids and counts, and nothing else):
 *
 *   {
 *     "items": [
 *       { "menuItemId": "1GHW6643ZCN74",
 *         "quantity": 2,
 *         "modifiers": { "<modifierGroupId>": ["<optionId>", "<optionId>"] } }
 *     ],
 *     "promoCode": "NEWCUSTOMER",       // optional
 *     "idempotencyKey": "<uuid>"        // optional, but send one
 *   }
 *
 * `idempotencyKey` names one checkout attempt — a UUID the browser mints once
 * and keeps in sessionStorage. Repeats bearing it get the order the first call
 * created rather than a second one on the merchant's account: a double tap, a
 * retry on a stalled connection, a reload after a lost reply, and React's
 * Strict Mode double-invoke all land here.
 *
 * Omit it and the request is NOT deduplicated. That is deliberate. Hashing the
 * cart instead looks equivalent and is not — two strangers ordering one Thai
 * Milk Tea a minute apart hash the same, and the second would be handed the
 * first one's order to pay for.
 *
 * Response 200 — every figure integer cents, read back from the created order:
 *
 *   {
 *     "cloverOrderId": "ZZH7YY3PREYP8",
 *     "currency": "USD",
 *     "subtotal": 1650, "discount": 165, "tax": 104, "total": 1589,
 *     "formatted": { "subtotal": "$16.50", ... },
 *     "promo": { "code": "NEWCUSTOMER", "label": "…", "percentOff": 0.1 },
 *     "lines": [ { "name": "Snow - Small", "price": 775,
 *                  "modifiers": [ { "name": "Caramel Drizzle", "amount": 50 } ],
 *                  "lineTotal": 825 } ],
 *     "warnings": []
 *   }
 *
 * `total` is the amount to charge. It is Clover's own number: the order is built
 * from inventory-linked line items, so Clover applies the merchant's tax rates
 * itself. We never compute tax and hand Clover a figure.
 *
 * The order comes back OPEN / paymentState OPEN. Nothing is charged here — POST
 * the returned id and a `clv_` card token to /api/checkout/pay.
 */
import { CloverError, formatCents } from "@/pos/clover/client";
import { optional } from "@/pos/clover/client";
import {
  CatalogMismatchError,
  CheckoutRequestError,
  createPricedOrder,
  deleteUnpaidOrder,
} from "@/pos/clover/order";

export async function POST(request: Request) {
  const wrongShop = notThisDeployment();
  if (wrongShop) return wrongShop;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  try {
    const order = await createPricedOrder(body);

    /*
     * The customer re-priced — they applied or removed a discount code — so the
     * order this one replaces is now litter on the merchant's account.
     *
     * AFTER the new order exists, never before: if creation fails we still want
     * the old order, because it is the one the customer is looking at. And
     * through `optional()`, because tidying up must never fail a checkout —
     * `deleteUnpaidOrder` refuses to touch anything with a payment on it.
     */
    const replaces = (body as { replaces?: unknown } | null)?.replaces;
    if (typeof replaces === "string" && /^[A-Z0-9]{8,32}$/.test(replaces) && replaces !== order.cloverOrderId) {
      await optional("abandon_order", () => deleteUnpaidOrder(replaces));
    }

    return Response.json(
      {
        ...order,
        formatted: {
          subtotal: formatCents(order.subtotal),
          discount: formatCents(order.discount),
          tax: formatCents(order.tax),
          total: formatCents(order.total),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof CheckoutRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CatalogMismatchError) {
      // 409, not 500: the request was fine, our mirror and the merchant's
      // catalog disagree. Refusing is the point — the alternative is charging
      // for the wrong product.
      console.error(`[checkout] ${error.message}`);
      return Response.json(
        { error: "That item is out of sync with the shop's menu. Please try again shortly.", detail: error.detail },
        { status: 409 },
      );
    }
    if (error instanceof CloverError) {
      console.error(`[checkout] ${error.message}: ${error.body.slice(0, 300)}`);
      return Response.json({ error: error.customerMessage }, { status: error.status === 429 ? 429 : 502 });
    }
    console.error("[checkout] unexpected", error);
    return Response.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
