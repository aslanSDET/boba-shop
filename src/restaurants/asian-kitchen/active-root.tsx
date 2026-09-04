import type { Metadata, Viewport } from "next";
import { AsianKitchenRoot, AsianKitchenShell, asianKitchenMetadata, asianKitchenViewport } from "./root";
import { Checkout } from "./checkout";
import { OrderConfirmation } from "./order-confirmation";

/**
 * Asian Kitchen, under the names every route in `app/` imports.
 *
 * Must present the same exports, with the same types, as
 * `src/restaurants/snowdaes/active-root.tsx`: the bundler swaps one file for
 * the other, so `tsc` only ever checks the one the current `RESTAURANT`
 * resolves to. Drift here is caught by building this restaurant, which is why
 * both builds have to run.
 */
export const activeMetadata: Metadata = asianKitchenMetadata;
export const activeViewport: Viewport | undefined = asianKitchenViewport;
export const ActiveRoot = AsianKitchenRoot;
export const ActiveShell = AsianKitchenShell;
export const ActiveCheckout = Checkout;
export const ActiveOrderConfirmation = OrderConfirmation;
