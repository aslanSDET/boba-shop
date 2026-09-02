/**
 * Constructed once, not per call: this runs for every price on every render of
 * the menu grid, the drawer and the cart.
 */
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatPrice(amount: number): string {
  return usd.format(amount);
}
