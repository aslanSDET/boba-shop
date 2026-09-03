"use client";

import { useEffect } from "react";
import { useCart } from "@/restaurants/snowdaes/lib/use-cart";

/**
 * Reads the persisted cart out of sessionStorage, once, after the first paint.
 *
 * The store is configured `skipHydration` (see use-cart.ts). Without that, the
 * cart is read while the module initialises, so the server renders "0 items"
 * and the browser's very first render says "3 items" — a hydration mismatch on
 * the cart badge, the bar total, and every line on /checkout.
 *
 * Doing it in an effect means both sides start empty and agree, and the real
 * cart arrives on the next tick. The cost is one frame where a returning
 * customer sees an empty cart; the alternative is React discarding the server
 * HTML and re-rendering the whole tree, which is both slower and visible.
 *
 * Renders nothing. It exists for its effect, and it sits in the shell so that
 * every route — menu, checkout, confirmation — is hydrated the same way.
 */
export function CartHydrator() {
  useEffect(() => {
    void useCart.persist.rehydrate();
  }, []);
  return null;
}
