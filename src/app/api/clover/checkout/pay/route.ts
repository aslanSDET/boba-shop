import { notThisDeployment } from "@/pos/clover/client";
/**
 * POST /api/checkout/pay — charge the order that /api/checkout created.
 *
 * Request:
 *
 *   {
 *     "cloverOrderId": "<cloverOrderId>",
 *     "source": "clv_XXXXXXXXXXXXXXXXXXXXXXXX",     // single-use card token
 *     "email": "someone@example.com"              // optional, goes on the receipt
 *   }
 *
 * Response 200:
 *
 *   {
 *     "paid": true,
 *     "cloverOrderId": "<cloverOrderId>",
 *     "chargeId": "<paymentId>",
 *     "amount": 2398, "tax": 157,
 *     "formattedAmount": "$23.98",
 *     "card": { "brand": "VISA", "last4": "1111" },
 *     "authCode": "OK4231", "refNum": "<refNum>",
 *     "printEventId": null, "printed": false
 *   }
 *
 * ── THE ENDPOINT ─────────────────────────────────────────────────────────────
 *
 * `POST /v1/orders/{orderId}/pay` on the ECOMMERCE host, with the Ecommerce
 * private key. There is exactly one working combination: the same path on the
 * platform host answers 405, and the ecomm host with a platform token answers
 * 401 (findings.md, step 07).
 *
 * ── WHY WE DO NOT RE-READ THE ORDER AFTERWARDS ───────────────────────────────
 *
 * Measured: `GET /v3/…/orders/{id}` immediately after a successful charge still
 * reports `paymentState: OPEN`, and only flips to `PAID` about two seconds
 * later. An immediate re-read is a race that reports a paid order as unpaid on
 * the customer's own confirmation page.
 *
 * The `/pay` response does not need one. It states `status: "paid"`, the
 * payment id in `charge`, `amount_paid`, `tax_amount`, the auth code and the
 * masked card. That is the authority, and it arrives in the same round trip.
 *
 * ── THE AMOUNT ───────────────────────────────────────────────────────────────
 *
 * Measured: `amount` is NOT required — omitting it produces the same "provide a
 * valid source" refusal, and an empty body fails earlier on "Either payment
 * instrument or customer has to be present". Clover will charge the order's own
 * total. We send it anyway, but we send CLOVER'S number, re-read from the order
 * at pay time. The request body has no field a caller could put a price in.
 */
import { createHash } from "node:crypto";
import { CloverError, ecomm, formatCents, merchantId, optional, platform } from "@/pos/clover/client";
import { readOrderTotal, writeOrderNote } from "@/pos/clover/order";

interface PayRequest {
  cloverOrderId?: string;
  source?: string;
  email?: string;
  idempotencyKey?: string;
  /** Integer cents, chosen by the customer. Charged BESIDE the order total. */
  tipCents?: number;
  /** What the customer typed for the kitchen. Goes on the order note. */
  note?: string;
  /** The chosen pickup time, already phrased: "Tomorrow at 11:00am". */
  pickup?: string;
}

/** The `/pay` response. `object: "order"`, but `charge` is the payment id. */
interface CloverPayResponse {
  id: string;
  charge?: string;
  amount?: number;
  amount_paid?: number;
  tip_amount?: number;
  tax_amount?: number;
  status?: string;
  auth_code?: string;
  ref_num?: string;
  source?: { brand?: string; last4?: string };
}

const ORDER_ID = /^[A-Z0-9]{8,32}$/;

export async function POST(request: Request) {
  const wrongShop = notThisDeployment();
  if (wrongShop) return wrongShop;

  let body: PayRequest;
  try {
    body = (await request.json()) as PayRequest;
  } catch {
    return Response.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const orderId = body.cloverOrderId?.trim() ?? "";
  const source = body.source?.trim() ?? "";

  if (!ORDER_ID.test(orderId)) {
    return Response.json({ error: "`cloverOrderId` is missing or malformed." }, { status: 400 });
  }
  if (!source.startsWith("clv_")) {
    // Shape check only. Never log, echo, or store the token itself.
    return Response.json({ error: "`source` must be a Clover card token (clv_…)." }, { status: 400 });
  }

  // ── 1. Ask Clover what this order costs. It is the only authority. ─────────
  let order;
  try {
    order = await readOrderTotal(orderId);
  } catch (error) {
    if (error instanceof CloverError && error.status === 404) {
      return Response.json({ error: "That order no longer exists." }, { status: 404 });
    }
    console.error(`[pay] could not read order ${orderId}`, error);
    return Response.json({ error: "Could not reach Clover." }, { status: 502 });
  }

  if (order.paymentState === "PAID") {
    // A double-submit lands here. Not an error worth alarming anyone about —
    // and note this check only catches submits more than ~2s apart, because
    // paymentState lags. The single-use card token is what stops the rest.
    return Response.json(
      { paid: true, alreadyPaid: true, cloverOrderId: orderId, amount: order.total },
      { status: 200 },
    );
  }
  if (!order.total || order.total <= 0) {
    return Response.json({ error: "That order has nothing to charge." }, { status: 409 });
  }

  // ── 1b. The tip. Bounded here because the server is the only real boundary. ─
  //
  // MEASURED (findings.md, step 09): `/pay` charges `amount` PLUS `tip_amount`,
  // and refuses outright if `amount` alone exceeds the order total. So the tip
  // must travel beside the total, never folded into it — and it must never ALSO
  // appear as a line item on the order, which charges it twice.
  const rawTip = body.tipCents;
  let tipCents = 0;
  if (rawTip !== undefined && rawTip !== null) {
    if (!Number.isInteger(rawTip) || rawTip < 0) {
      return Response.json({ error: "`tipCents` must be a whole number of cents." }, { status: 400 });
    }
    // A ceiling, not a policy: generous tipping is fine, a 100x fat-finger or a
    // bug multiplying by the wrong thing is not. $20 keeps small orders able to
    // tip freely; beyond that the order's own total is the yardstick.
    const ceiling = Math.max(order.total, 2_000);
    if (rawTip > ceiling) {
      return Response.json(
        { error: "That tip is larger than we can accept online. Please tip at the counter." },
        { status: 400 },
      );
    }
    tipCents = rawTip;
  }

  // ── 1c. The note. Secondary, so it must never fail the sale (design rule 5).
  //
  // The pickup time is written FIRST and in capitals because it is the only
  // part of the note that changes what the kitchen does. Clover has no
  // scheduled-order field at all (findings.md), so this line of text is the
  // entire mechanism — it schedules nothing and nobody is reminded.
  const kitchenNote = typeof body.note === "string" ? body.note.trim().slice(0, 400) : "";

  /*
   * The pickup phrase is resolved in the browser, because that is where the
   * shop's hours are. It is therefore untrusted text on its way to a printer:
   * newlines are stripped so it cannot forge extra lines on the ticket, and it
   * is length-bounded like everything else that reaches Clover.
   */
  const pickupPhrase =
    typeof body.pickup === "string" && body.pickup.trim()
      ? body.pickup.replace(/\s+/g, " ").trim().slice(0, 60)
      : "as soon as possible";
  const note = [`PICKUP: ${pickupPhrase}`, kitchenNote].filter(Boolean).join(" — ");
  await optional("order_note", () => writeOrderNote(orderId, note));

  // A `clv_` token is single-use, so a double-submit fails on the card anyway —
  // but keying on the order plus the token means an accidental retry replays
  // one attempt instead of racing a second, while a genuine retry with a fresh
  // token after a decline is correctly treated as new.
  const idempotencyKey =
    body.idempotencyKey ?? `pay-${orderId}-${createHash("sha256").update(source).digest("hex").slice(0, 16)}`;

  // ── 2. The one call that moves money. No retries, no wrapper, no swallowing.
  let charge: CloverPayResponse;
  try {
    charge = await ecomm<CloverPayResponse>(`/v1/orders/${orderId}/pay`, {
      method: "POST",
      body: {
        source,
        // CLOVER'S number, re-read at pay time. Never one we worked out.
        amount: order.total,
        // Beside the total, not inside it. See the note above.
        ...(tipCents > 0 ? { tip_amount: tipCents } : {}),
        currency: "usd",
        ...(body.email ? { email: body.email } : {}),
      },
      timeoutMs: 30_000,
      idempotencyKey,
    });
  } catch (error) {
    if (error instanceof CloverError) {
      // ── A paid order must NEVER be reported as a failure ──────────────────
      // Measured: charging an order twice returns 409 `order_already_paid`.
      // The customer's money has already moved, so this is a success from
      // their side; returning an error here is an invitation to pay twice.
      // This is the real double-submit guard — the paymentState pre-check
      // above misses anything inside the ~2s lag before it flips to PAID.
      if (error.status === 409 && error.code === "order_already_paid") {
        console.warn(`[pay] order ${orderId} was already paid — reporting success`);
        return Response.json(
          { paid: true, alreadyPaid: true, cloverOrderId: orderId, amount: order.total },
          { status: 200 },
        );
      }
      // A decline is HTTP 402 and carries no `error.type`. Handlers that only
      // branch on the type turn a declined card into a 500 (prior-art.md).
      const status = error.status === 402 ? 402 : error.status === 429 ? 429 : 400;
      console.error(`[pay] charge refused for order ${orderId}: HTTP ${error.status} ${error.code ?? ""}`);
      return Response.json({ paid: false, error: error.customerMessage }, { status });
    }
    // Ambiguous: the charge may or may not have landed. Say so rather than
    // inviting a second attempt — a sale reported as failed that actually
    // succeeded is how a customer gets charged twice.
    console.error(`[pay] charge outcome unknown for order ${orderId}`, error);
    return Response.json(
      {
        paid: false,
        indeterminate: true,
        cloverOrderId: orderId,
        error: "We could not confirm whether that payment went through. Check with the shop before retrying.",
      },
      { status: 504 },
    );
  }

  // ── 3. Everything past here is secondary and must never fail the sale.
  //      Design rule 5. The money has moved; nothing below may throw.
  //
  // Fire the kitchen ticket. On a sandbox test merchant this returns 400 "The
  // default printing device is missing" and comes back null — which is the
  // right shape, because a missing ticket is a nuisance and a failed sale is
  // not. Whether a real order prints closes only against the shop's own
  // merchant, with the owner watching (PLAN.md §8.7).
  const printEvent = await optional("print_event", async () =>
    platform<{ id?: string }>(`/v3/merchants/${await merchantId()}/print_event`, {
      method: "POST",
      body: { orderRef: { id: orderId } },
      timeoutMs: 5_000,
    }),
  );

  // What the customer was actually charged. `amount_paid` is the ORDER's share
  // and excludes the tip — measured — so the tip has to be added back to state
  // the figure that will appear on their statement.
  const orderAmount = charge.amount_paid ?? charge.amount ?? order.total;
  const tipCharged = charge.tip_amount ?? tipCents;
  const amount = orderAmount + tipCharged;

  return Response.json(
    {
      paid: charge.status === "paid",
      cloverOrderId: orderId,
      // `charge` is the payment id; `id` on this response is the ORDER id.
      chargeId: charge.charge ?? null,
      /** The full amount charged to the card, tip included. */
      amount,
      orderAmount,
      tip: tipCharged,
      note: note || null,
      tax: charge.tax_amount ?? null,
      formattedAmount: formatCents(amount),
      card: charge.source ? { brand: charge.source.brand ?? null, last4: charge.source.last4 ?? null } : null,
      authCode: charge.auth_code ?? null,
      refNum: charge.ref_num ?? null,
      // The only real proof the kitchen was told. Null means we do not know,
      // not that it failed to print.
      printEventId: printEvent?.id ?? null,
      printed: Boolean(printEvent?.id),
    },
    { status: 200 },
  );
}
