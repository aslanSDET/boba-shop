/**
 * Turning Asian Kitchen's cart into a Square order, and taking the money.
 *
 * ── THE ASSUMPTION THIS FILE IS BUILT ON, STATED PLAINLY ─────────────────────
 *
 * **Line items are ad hoc, not catalog-linked.** Asian Kitchen's menu was
 * transcribed by hand from their public ordering listing
 * (`docs/ASIAN-KITCHEN.md` §3) — it has never been synced from a Square
 * catalog, so there are no `catalog_object_id`s to reference. We send `name`
 * and `base_price_money` instead.
 *
 * That is a real weakening of `AGENTS.md` invariant 4, and worth being precise
 * about rather than glossing:
 *
 *   - **Still true:** Square computes tax, discounts, service charges and the
 *     order total. We never add up tax. `CalculateOrder` is the calculator and
 *     the cart is a labelled preview, exactly as on the Clover side.
 *   - **No longer true:** the UNIT PRICE is ours, not the merchant's. If their
 *     Square catalog says a Combination Lo Mein is $12.99 and our transcription
 *     says $12.49, Square will cheerfully charge $12.49 and never object.
 *
 * That is acceptable for a demo against a sandbox and NOT acceptable against a
 * real till. The fix is a catalog sync — read `ITEM`/`ITEM_VARIATION` and key
 * our menu by `catalog_object_id`, the way `scripts/import-menu.mjs` does for
 * Clover. `docs/SQUARE-PAYMENTS.md` §9 and §10 cover why that is also where the
 * `ITEM_VARIATION` data-model change lands.
 *
 * ── WHAT IS MEASURED AND WHAT IS NOT ─────────────────────────────────────────
 *
 * `calculateOrder()` is **measured** against the sandbox merchant: a Pick Any
 * Three Items plate with three Sesame Chicken and a Fried Rice priced at
 * $10.99 with the four choices itemised as modifiers, which is what a kitchen
 * ticket needs.
 *
 * `createOrderAndPay()` is **not**. No order has been created and no card
 * charged, so the fulfillment shape, the two-key idempotency split and the tip
 * handling are all from documentation.
 *
 * Also measured, and worth knowing before the demo: the sandbox merchant has
 * **zero TAX objects in its catalog**, so Square returns `taxCents: 0`. That is
 * the sandbox being empty, not our arithmetic — a real merchant carries tax on
 * the location. Do not "fix" it by computing tax here.
 */

import { itemById, optionById } from "@/restaurants/asian-kitchen/menu";
import { credential } from "./creds";
import { money, square, SquareError, toCents } from "./client";

/** What the browser is allowed to send. Ids and counts, never prices. */
export interface CartLineInput {
  itemId: string;
  /** Modifier option ids, in the order they were chosen. */
  picks: string[];
  quantity?: number;
}

export interface CheckoutRequest {
  lines: CartLineInput[];
  /** Whole cents. Square wants the tip as a separate money field, not a rate. */
  tipCents?: number;
}

export class CheckoutRequestError extends Error {}

/**
 * The location every order belongs to.
 *
 * Square requires one and there is no sensible default. Taken from the
 * environment when set, otherwise the first active location on the merchant —
 * which is right for a single-location restaurant and wrong the moment there
 * are two, so it logs rather than silently picking.
 */
let cachedLocation: string | null = null;

export async function locationId(): Promise<string> {
  if (cachedLocation) return cachedLocation;

  try {
    cachedLocation = await credential("SQUARE_LOCATION_ID");
    return cachedLocation;
  } catch {
    // Not configured — fall through and ask Square.
  }

  const res = await square<{ locations?: Array<{ id: string; status?: string; name?: string }> }>(
    "/v2/locations",
  );
  const active = (res.locations ?? []).filter((l) => l.status !== "INACTIVE");
  if (active.length === 0) throw new CheckoutRequestError("This Square merchant has no active location.");
  if (active.length > 1) {
    console.warn(
      `[square] ${active.length} active locations; using "${active[0].name}". ` +
        `Set SQUARE_LOCATION_ID to choose deliberately.`,
    );
  }
  cachedLocation = active[0].id;
  return cachedLocation;
}

/**
 * Cart → Square line items.
 *
 * Modifiers are sent as Square modifiers rather than folded into the name, so
 * the receipt and the kitchen ticket both break the plate down into its
 * choices. On a menu where the modifiers ARE the product — three entrées and a
 * side (`docs/ASIAN-KITCHEN.md` §8) — a ticket reading only "Pick Any Three
 * Items" would tell the kitchen nothing about what to cook.
 */
function buildLineItems(lines: CartLineInput[]) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new CheckoutRequestError("The cart is empty.");
  }

  return lines.map((line) => {
    const item = itemById(line.itemId);
    if (!item) throw new CheckoutRequestError(`No such item: ${line.itemId}`);

    const quantity = Math.max(1, Math.floor(line.quantity ?? 1));

    const modifiers = (line.picks ?? []).map((pickId) => {
      const option = optionById(pickId);
      if (!option) throw new CheckoutRequestError(`No such option: ${pickId}`);
      return {
        name: option.name,
        base_price_money: money(toCents(option.priceDelta)),
        quantity: "1",
      };
    });

    return {
      name: item.name,
      quantity: String(quantity),
      base_price_money: money(toCents(item.price)),
      ...(modifiers.length > 0 ? { modifiers } : {}),
    };
  });
}

/** Square's own numbers, read back. Never computed here. */
export interface PricedOrder {
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  lines: Array<{ name: string; quantity: string; totalCents: number; modifiers: string[] }>;
}

function readTotals(order: {
  total_money?: { amount?: number };
  total_tax_money?: { amount?: number };
  total_tip_money?: { amount?: number };
  net_amounts?: { total_money?: { amount?: number } };
  line_items?: Array<{
    name?: string;
    quantity?: string;
    total_money?: { amount?: number };
    modifiers?: Array<{ name?: string }>;
  }>;
}): PricedOrder {
  const total = order.total_money?.amount ?? 0;
  const tax = order.total_tax_money?.amount ?? 0;
  const tip = order.total_tip_money?.amount ?? 0;
  return {
    subtotalCents: total - tax - tip,
    taxCents: tax,
    tipCents: tip,
    totalCents: total,
    lines: (order.line_items ?? []).map((l) => ({
      name: l.name ?? "",
      quantity: l.quantity ?? "1",
      totalCents: l.total_money?.amount ?? 0,
      modifiers: (l.modifiers ?? []).map((m) => m.name ?? "").filter(Boolean),
    })),
  };
}

/**
 * Price the cart WITHOUT creating anything.
 *
 * This is the endpoint that does not exist on Clover, and its absence is the
 * cause of every orphaned OPEN order this project has cleaned up. Calling it is
 * free of consequence, so the checkout page may call it on every change.
 */
export async function calculateOrder(request: CheckoutRequest): Promise<PricedOrder> {
  const body = {
    order: {
      location_id: await locationId(),
      line_items: buildLineItems(request.lines),
    },
  };

  const res = await square<{ order?: Parameters<typeof readTotals>[0] }>("/v2/orders/calculate", {
    method: "POST",
    body,
  });
  if (!res.order) throw new CheckoutRequestError("Square returned no order to price.");

  const priced = readTotals(res.order);
  // CalculateOrder does not carry a tip; it is a payment-time concept. Show it
  // in the preview so the customer sees the number they are about to authorise.
  const tip = request.tipCents ?? 0;
  return { ...priced, tipCents: tip, totalCents: priced.totalCents + tip };
}

/**
 * Create the order and take the money, in that order.
 *
 * `idempotencyKey` is REQUIRED by Square on both writes, which is the opposite
 * of Clover where it was optional and unverifiable. One key per checkout
 * attempt, minted by the browser and kept in sessionStorage, covers a double
 * tap, a retry on a stalled connection, a reload after a lost reply, and
 * React's Strict Mode double-invoke.
 *
 * The two calls take DIFFERENT keys derived from the same attempt: replaying
 * one must not be mistaken for the other.
 */
export async function createOrderAndPay(args: {
  request: CheckoutRequest;
  sourceId: string;
  idempotencyKey: string;
  note?: string;
}): Promise<{ orderId: string; paymentId: string; priced: PricedOrder; receiptUrl?: string }> {
  const location = await locationId();

  const created = await square<{ order?: { id?: string } & Parameters<typeof readTotals>[0] }>(
    "/v2/orders",
    {
      method: "POST",
      timeoutMs: 20_000,
      body: {
        idempotency_key: `${args.idempotencyKey}-order`,
        order: {
          location_id: location,
          line_items: buildLineItems(args.request.lines),
          ...(args.note ? { note: args.note.slice(0, 500) } : {}),
          fulfillments: [
            {
              type: "PICKUP",
              state: "PROPOSED",
              pickup_details: {
                // Square wants a recipient; the name is collected at checkout.
                recipient: { display_name: args.note?.slice(0, 100) || "Online order" },
                schedule_type: "ASAP",
                // Documented as required with ASAP. 20 minutes matches the
                // "Ready in 15-20 mins" the page promises.
                pickup_at: new Date(Date.now() + 20 * 60_000).toISOString(),
              },
            },
          ],
        },
      },
    },
  );

  const orderId = created.order?.id;
  if (!orderId) throw new CheckoutRequestError("Square created no order.");

  const priced = readTotals(created.order!);
  const amountToCharge = priced.totalCents + (args.request.tipCents ?? 0);

  const paid = await square<{ payment?: { id?: string; receipt_url?: string } }>("/v2/payments", {
    method: "POST",
    timeoutMs: 20_000,
    body: {
      idempotency_key: `${args.idempotencyKey}-payment`,
      source_id: args.sourceId,
      order_id: orderId,
      location_id: location,
      amount_money: money(priced.totalCents),
      ...(args.request.tipCents ? { tip_money: money(args.request.tipCents) } : {}),
      autocomplete: true,
    },
  });

  const paymentId = paid.payment?.id;
  if (!paymentId) throw new CheckoutRequestError("Square took no payment.");

  return {
    orderId,
    paymentId,
    priced: { ...priced, tipCents: args.request.tipCents ?? 0, totalCents: amountToCharge },
    receiptUrl: paid.payment?.receipt_url,
  };
}

export { SquareError };
