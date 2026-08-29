/**
 * Discount codes — the thing Clover Online Ordering cannot do at all.
 *
 * Not "has limited support for": none. A shop on Clover's own ordering page has
 * no way to run a code, which is why this file is the point of the project
 * rather than a feature of it (PLAN.md §2.5, §8.7).
 *
 * Kept as a hand-edited list on purpose for now. A real campaign engine wants
 * per-code budgets, expiry, first-order-only enforcement and redemption
 * records, and all of that needs a database we have deliberately not built yet.
 * One code in a config file demonstrates the idea to the owner without pulling
 * AWS into a proof of concept.
 */
export interface Promo {
  /** Matched case-insensitively; stored and sent to Clover in this casing. */
  code: string;
  /** Shown on the cart line once applied. */
  label: string;
  /** 0.1 = 10% off the subtotal. */
  percentOff: number;
}

export const PROMOS: Promo[] = [
  {
    code: "NEWCUSTOMER",
    label: "New customer — 10% off",
    percentOff: 0.1,
  },
];

export function findPromo(code: string): Promo | undefined {
  const wanted = code.trim().toLowerCase();
  return PROMOS.find((p) => p.code.toLowerCase() === wanted);
}

/**
 * Discount in dollars, rounded to whole cents.
 *
 * MEASURED against Clover, and the ordering is not a matter of taste: a
 * discount applies BEFORE tax. Our arithmetic has to match theirs or every
 * discounted order reconciles a few cents out, forever
 * (scripts/spike/findings.md).
 */
export function discountFor(promo: Promo | null, subtotal: number): number {
  if (!promo) return 0;
  return Math.round(subtotal * promo.percentOff * 100) / 100;
}
