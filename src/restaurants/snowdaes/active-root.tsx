import type { Metadata, Viewport } from "next";
import { SnowdaesRoot, SnowdaesShell, snowdaesMetadata } from "./root";
import { SnowdaesCheckout } from "./checkout";
import { SnowdaesOrderConfirmation } from "./order-confirmation";

/**
 * Snowdaes, under the names every route in `app/` imports.
 *
 * See `src/restaurants/active-root.ts` for why this indirection exists. Asian
 * Kitchen has a file of exactly this shape; the bundler resolves one of them
 * and the other is never in the graph.
 */
export const activeMetadata: Metadata = snowdaesMetadata;
export const activeViewport: Viewport | undefined = undefined;
export const ActiveRoot = SnowdaesRoot;
export const ActiveShell = SnowdaesShell;
export const ActiveCheckout = SnowdaesCheckout;
export const ActiveOrderConfirmation = SnowdaesOrderConfirmation;
