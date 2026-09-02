/**
 * Building the order, and reading the money back out of it.
 *
 * ── THE RULE THIS FILE ENFORCES ──────────────────────────────────────────────
 *
 * Clover is the calculator. We do not compute tax and hand Clover a number; we
 * build the right order out of the merchant's own inventory and read Clover's
 * total back. Measured: two $6.45 items came back at $13.81, exactly x1.07,
 * with MA 6.25% + local 0.75% applied by Clover without being asked, purely
 * because the line items reference real inventory ids (findings.md, step 07).
 *
 * The browser sends ids and quantities. It never sends a price, so there is no
 * price for it to lie about — `curl` cannot buy a Thai Dye for a penny because
 * there is nowhere in the request to put a penny.
 */
/*
 * ── A LAYERING PROBLEM THE PHASE 1 MOVE MADE VISIBLE ────────────────────────
 *
 * This is `pos/clover/` and it imports from `restaurants/snowdaes/`. A POS
 * integration should not know which restaurant it is serving; the dependency
 * points the wrong way, and a second Clover restaurant would have nowhere to go.
 *
 * Left as-is on purpose. PLATFORM.md §3 says the interface gets extracted once
 * Square actually works, and inverting this now — passing the catalog in rather
 * than importing it — is that redesign, done early against one example. Recorded
 * rather than fixed, so it is a decision instead of an oversight.
 */
import { createHash } from "node:crypto";
import { MENU_ITEMS } from "@/restaurants/snowdaes/menu";
import { findPromo, type Promo } from "@/restaurants/snowdaes/promos";
import type { MenuItem, ModifierGroup, ModifierOption } from "@/restaurants/snowdaes/types";
import { merchantId, optional, platform } from "@/pos/clover/client";
import { once } from "@/pos/clover/idempotency";
import {
  CatalogMismatchError,
  getCloverCatalog,
  resolveItem,
  resolveModifier,
  type CloverCatalog,
} from "@/pos/clover/catalog";

/* ── request shape ────────────────────────────────────────────────────────── */

export interface CheckoutLineRequest {
  menuItemId: string;
  quantity: number;
  /** `ModifierGroup.id` → chosen `ModifierOption.id`s, exactly as the cart holds it. */
  modifiers?: Record<string, string[]>;
}

export interface CheckoutRequest {
  items: CheckoutLineRequest[];
  promoCode?: string | null;
  /**
   * A value stable for one checkout attempt, minted and stored by the browser.
   * Without it the request is NOT deduplicated — there is deliberately no
   * cart-derived fallback. See `createPricedOrder`.
   */
  idempotencyKey?: string;
}

export class CheckoutRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutRequestError";
  }
}

/** Bounds, so a malformed or hostile body cannot turn into 4,000 Clover writes. */
const MAX_LINES = 25;
const MAX_QUANTITY = 20;
const MAX_UNITS = 50;

/* ── validation: our catalog is the only source of prices ─────────────────── */

interface ValidatedLine {
  menuItem: MenuItem;
  quantity: number;
  selections: Array<{ group: ModifierGroup; option: ModifierOption }>;
}

export function validate(body: unknown): { lines: ValidatedLine[]; promo: Promo | null } {
  if (!body || typeof body !== "object") throw new CheckoutRequestError("Body must be a JSON object.");
  const { items, promoCode } = body as CheckoutRequest;

  if (!Array.isArray(items) || items.length === 0) {
    throw new CheckoutRequestError("`items` must be a non-empty array.");
  }
  if (items.length > MAX_LINES) {
    throw new CheckoutRequestError(`Too many lines (${items.length} > ${MAX_LINES}).`);
  }

  const lines: ValidatedLine[] = [];
  let units = 0;

  for (const [index, raw] of items.entries()) {
    const where = `items[${index}]`;
    if (!raw || typeof raw !== "object") throw new CheckoutRequestError(`${where} must be an object.`);

    const menuItem = MENU_ITEMS.find((m) => m.id === raw.menuItemId);
    if (!menuItem) throw new CheckoutRequestError(`${where}.menuItemId "${raw.menuItemId}" is not on the menu.`);
    if (!menuItem.isAvailable) throw new CheckoutRequestError(`"${menuItem.name}" is not available.`);

    const quantity = raw.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new CheckoutRequestError(`${where}.quantity must be a whole number between 1 and ${MAX_QUANTITY}.`);
    }
    units += quantity;
    if (units > MAX_UNITS) throw new CheckoutRequestError(`Too many items in one order (over ${MAX_UNITS}).`);

    const chosen = raw.modifiers ?? {};
    if (typeof chosen !== "object" || Array.isArray(chosen)) {
      throw new CheckoutRequestError(`${where}.modifiers must be an object keyed by modifier group id.`);
    }

    const selections: ValidatedLine["selections"] = [];

    for (const groupId of Object.keys(chosen)) {
      const group = menuItem.modifierGroups.find((g) => g.id === groupId);
      if (!group) {
        throw new CheckoutRequestError(`${where}: "${menuItem.name}" has no modifier group ${groupId}.`);
      }
      const optionIds = chosen[groupId] ?? [];
      if (!Array.isArray(optionIds)) {
        throw new CheckoutRequestError(`${where}.modifiers["${groupId}"] must be an array of option ids.`);
      }
      if (new Set(optionIds).size !== optionIds.length) {
        throw new CheckoutRequestError(`${where}: "${group.label}" has the same option selected twice.`);
      }
      if (group.max !== undefined && optionIds.length > group.max) {
        throw new CheckoutRequestError(`${where}: "${group.label}" allows at most ${group.max} choices.`);
      }
      for (const optionId of optionIds) {
        const option = group.options.find((o) => o.id === optionId);
        if (!option) {
          throw new CheckoutRequestError(`${where}: "${optionId}" is not an option in "${group.label}".`);
        }
        selections.push({ group, option });
      }
    }

    // Required groups are checked against what actually arrived, not against
    // whatever the UI thinks it sent.
    for (const group of menuItem.modifierGroups) {
      const count = (chosen[group.id] ?? []).length;
      if (count < group.min) {
        throw new CheckoutRequestError(
          `"${menuItem.name}" needs at least ${group.min} choice(s) from "${group.label}".`,
        );
      }
    }

    lines.push({ menuItem, quantity, selections });
  }

  const promo = promoCode ? (findPromo(String(promoCode)) ?? null) : null;
  if (promoCode && !promo) throw new CheckoutRequestError(`"${promoCode}" is not a valid promo code.`);

  return { lines, promo };
}

/* ── building the Clover order ────────────────────────────────────────────── */

interface CloverModification {
  modifier: { id: string };
  name: string;
  amount: number;
}

interface CloverLineItem {
  item: { id: string };
  printed: boolean;
  modifications?: CloverModification[];
}

interface CloverDiscount {
  name: string;
  amount?: number;
  percentage?: number;
}

/**
 * `printed: false` matches the spike and means "the kitchen has not seen this".
 * It is also the lever for the open question in findings.md: if the shop has
 * auto-print on, an OPEN unpaid order may print the moment it is created, and
 * sending `printed: true` is how that would be suppressed until payment lands.
 * Sandbox test merchants have no device, so this cannot be settled here.
 */
const PRINTED_ON_CREATE = false;

export interface PricedOrder {
  cloverOrderId: string;
  currency: string;
  /** Every figure is integer cents, read back from Clover. */
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  promo: { code: string; label: string; percentOff: number } | null;
  lines: Array<{
    name: string;
    price: number;
    modifiers: Array<{ name: string; amount: number }>;
    lineTotal: number;
  }>;
  /** Non-fatal disagreements between our mirror and the merchant's catalog. */
  warnings: string[];
}

/**
 * Ten minutes — comfortably longer than anyone spends typing a card in.
 *
 * The window can be generous precisely because the key is per-attempt rather
 * than per-cart: a long TTL cannot collapse two different customers, only two
 * submissions of the same attempt. It exists to bound memory, not to bound
 * correctness.
 */
const CREATE_DEDUPE_MS = 600_000;

/**
 * Price the cart, creating at most one Clover order per checkout attempt.
 *
 * ── WHY THE KEY COMES FROM THE BROWSER AND NOT FROM THE CART ─────────────────
 *
 * Deriving it by hashing the cart is the obvious idea and it is WRONG, because
 * a cart is not unique to a customer. "One Thai Milk Tea, no modifiers" is the
 * most orderable thing on this menu; two strangers submitting it a minute apart
 * would hash identically and the second would be handed the first one's order.
 * Whoever paid first would pay for both, and the other would meet
 * `order_already_paid`. That is a worse failure than the duplicates this exists
 * to prevent, so there is no cart-derived fallback: a request with no key is
 * simply not deduplicated.
 *
 * The browser's key is minted once per checkout attempt and kept in
 * sessionStorage, so it survives a remount, a reload, and a reply that never
 * arrived — which is the case that actually strands an order on the merchant.
 *
 * Validation runs FIRST and outside the deduplication, so a malformed body
 * always gets its own error rather than being handed a cached success, and a
 * rejected request never occupies a key.
 */
export async function createPricedOrder(body: unknown): Promise<PricedOrder> {
  const { lines, promo } = validate(body);

  const supplied = (body as CheckoutRequest | null)?.idempotencyKey;
  const key =
    typeof supplied === "string" && supplied.trim()
      ? // Truncated and hashed: it reaches a Map key and an HTTP header, and the
        // browser is not a trusted source of either length or character set.
        createHash("sha256").update(supplied.trim().slice(0, 200)).digest("hex").slice(0, 32)
      : null;

  if (!key) return buildAndPrice(lines, promo, null);
  return once(`checkout:${key}`, CREATE_DEDUPE_MS, () => buildAndPrice(lines, promo, key));
}

async function buildAndPrice(
  lines: ValidatedLine[],
  promo: Promo | null,
  idempotencyKey: string | null,
): Promise<PricedOrder> {
  const mId = merchantId();
  const catalog: CloverCatalog = await getCloverCatalog();
  const warnings: string[] = [];

  const lineItems: CloverLineItem[] = [];
  /**
   * Built from Clover's OWN prices, not our mirror's, and used only for the
   * whole-percent fallback below. Clover restates it on the read-back and that
   * restatement is what the customer is shown.
   */
  let resolvedSubtotal = 0;

  for (const line of lines) {
    const resolved = resolveItem(catalog, line.menuItem);
    if (resolved.matchedBy === "id" && resolved.clover.price !== Math.round(line.menuItem.basePrice * 100)) {
      warnings.push(
        `"${line.menuItem.name}" is ${resolved.clover.price}c on Clover but ${Math.round(
          line.menuItem.basePrice * 100,
        )}c in our catalog — Clover's price was charged. Re-run the menu import.`,
      );
    }

    const modifications: CloverModification[] = [];
    for (const { group, option } of line.selections) {
      const modifier = resolveModifier(catalog, resolved.clover, group, option);
      if (modifier.drift) {
        warnings.push(
          `"${option.name}" is ${modifier.drift.cloverCents}c on Clover but ` +
            `${modifier.drift.previewCents}c in our catalog — Clover's price was charged.`,
        );
      }
      // name and amount are both REQUIRED here, and Clover takes them on trust
      // rather than checking them against the modifier — see clover-catalog.ts.
      modifications.push({ modifier: { id: modifier.id }, name: modifier.name, amount: modifier.price });
    }

    // Clover expresses quantity by repeating the line. Measured: two identical
    // lines were taxed as one aggregate ($16.50 → $17.65), not taxed twice and
    // summed ($17.66), so this is also the arrangement whose maths we can trust.
    const unitCents = resolved.clover.price + modifications.reduce((sum, m) => sum + m.amount, 0);
    for (let n = 0; n < line.quantity; n++) {
      resolvedSubtotal += unitCents;
      lineItems.push({
        item: { id: resolved.clover.id },
        printed: PRINTED_ON_CREATE,
        ...(modifications.length ? { modifications: modifications.map((m) => ({ ...m })) } : {}),
      });
    }
  }

  const orderCart: {
    lineItems: CloverLineItem[];
    discounts?: CloverDiscount[];
    orderType?: { id: string };
  } = { lineItems };

  if (promo) orderCart.discounts = [discountFor(promo, resolvedSubtotal)];

  // An order type is what makes this look like an online order on the POS
  // rather than an untyped one. It is cosmetic, so it must never fail a sale
  // (design rule 5) — the sandbox merchant has none at all.
  const orderType = await optional("order_types", () =>
    platform<{ elements?: Array<{ id: string; label?: string }> }>(
      `/v3/merchants/${mId}/order_types?limit=20`,
      { timeoutMs: 3_000 },
    ),
  );
  const online =
    orderType?.elements?.find((t) => /online|web|pickup|to.?go/i.test(t.label ?? "")) ?? orderType?.elements?.[0];
  if (online) orderCart.orderType = { id: online.id };

  // The header is sent as a belt to `once()`'s braces. Clover documents
  // Idempotency-Key on the Ecommerce host, where the pay route relies on it;
  // whether the platform host honours it on `atomic_order` is UNVERIFIED, and
  // an ignored header costs nothing. Do not treat it as the guarantee — the
  // guarantee is `once()`.
  const created = await platform<{ id: string }>(`/v3/merchants/${mId}/atomic_order/orders`, {
    method: "POST",
    body: { orderCart },
    timeoutMs: 15_000,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });

  const priced = await readBack(mId, created.id, promo);
  return { ...priced, warnings };
}

/**
 * Percentages, because they were proven to work and they remove a rounding step.
 *
 * MEASURED: `{"name":"NEWCUSTOMER","percentage":10}` is accepted on an atomic
 * order and stored as a real percentage discount, so the shop's reporting shows
 * "NEWCUSTOMER 10%" rather than an opaque dollar figure that only made sense
 * against one cart.
 *
 * The catch, also measured: `percentage` is an INTEGER. Sending 12.5 was
 * silently truncated to 12 — no error, a 0.5% difference in the customer's
 * favour and a discount record that does not say what we meant. So anything
 * that is not a whole percent falls back to an explicit cents amount, which is
 * exact by construction. NEWCUSTOMER is 10%, so today that branch is unused —
 * it exists so the first 7.5% code does not quietly become 7%.
 *
 * `amount` is negative on the way in and comes back negative; the read-back
 * takes its absolute value for display. Proven in the spike as
 * `{"name":"SPIKE10","amount":-100}`.
 */
function discountFor(promo: Promo, subtotalCents: number): CloverDiscount {
  const percent = promo.percentOff * 100;
  if (Number.isInteger(percent) && percent > 0 && percent <= 100) {
    return { name: promo.code, percentage: percent };
  }
  return { name: promo.code, amount: -Math.round(subtotalCents * promo.percentOff) };
}

interface CloverOrderReadBack {
  id: string;
  currency?: string;
  total: number;
  discounts?: { elements?: Array<{ name: string; amount?: number; percentage?: number }> };
  lineItems?: {
    elements?: Array<{
      name: string;
      price: number;
      modifications?: { elements?: Array<{ name: string; amount: number }> };
    }>;
  };
}

/**
 * Read the money back out of the order Clover just built.
 *
 * `total` is the only figure Clover states outright, and it is the one that
 * gets charged. `taxAmount` is NOT usable — measured reading 0 on an order that
 * was taxed, and absent entirely on others (findings.md). So the breakdown is
 * derived, with tax as the remainder:
 *
 *     subtotal - discount + tax === total,   always, by construction.
 *
 * Clover computes the discount on the exact fraction rather than on whole
 * cents (a 10% discount on $7.75 is 77.5c, and the tax is charged on $6.975),
 * so a half-cent can land in the displayed tax. The charged total is exact
 * either way, which is the number that matters.
 */
async function readBack(
  mId: string,
  orderId: string,
  promo: Promo | null,
): Promise<Omit<PricedOrder, "warnings">> {
  const order = await platform<CloverOrderReadBack>(
    `/v3/merchants/${mId}/orders/${orderId}?expand=lineItems,discounts,lineItems.modifications`,
    { timeoutMs: 10_000 },
  );

  const lines = (order.lineItems?.elements ?? []).map((l) => {
    const modifiers = (l.modifications?.elements ?? []).map((m) => ({ name: m.name, amount: m.amount ?? 0 }));
    const lineTotal = (l.price ?? 0) + modifiers.reduce((sum, m) => sum + m.amount, 0);
    return { name: l.name, price: l.price ?? 0, modifiers, lineTotal };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  const discountRecord = order.discounts?.elements?.[0];
  let discount = 0;
  if (discountRecord?.percentage) {
    discount = Math.round((subtotal * discountRecord.percentage) / 100);
  } else if (discountRecord?.amount) {
    discount = Math.abs(discountRecord.amount);
  }

  const total = order.total ?? 0;

  return {
    cloverOrderId: order.id,
    currency: order.currency ?? "USD",
    subtotal,
    discount,
    tax: total - (subtotal - discount),
    total,
    promo: promo ? { code: promo.code, label: promo.label, percentOff: promo.percentOff } : null,
    lines,
  };
}

/** Re-reads an order's authoritative total, for the pay route. */
export async function readOrderTotal(orderId: string): Promise<{ total: number; paymentState?: string; state?: string }> {
  const mId = merchantId();
  const order = await platform<{ total: number; paymentState?: string; state?: string }>(
    `/v3/merchants/${mId}/orders/${orderId}`,
    { timeoutMs: 10_000 },
  );
  return order;
}

export { CatalogMismatchError };
