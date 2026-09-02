import type { Metadata, Viewport } from "next";
import { ACTIVE_RESTAURANT } from "@/restaurants/active";
import { SnowdaesRoot, snowdaesMetadata } from "@/restaurants/snowdaes/root";
import {
  AsianKitchenRoot,
  asianKitchenMetadata,
  asianKitchenViewport,
} from "@/restaurants/asian-kitchen/root";

/**
 * `/` — the only page. It serves whichever restaurant this deployment is for.
 *
 * Deliberately the whole of it: a switch and nothing else. Every fact about a
 * restaurant — fonts, metadata, palette, menu — lives under
 * `src/restaurants/<name>/`, so this file never needs editing when a shop
 * changes and never grows a second shop's details.
 *
 *   RESTAURANT=snowdaes      npm run dev
 *   RESTAURANT=asian-kitchen npm run dev
 *
 * Both roots are imported so the switch is statically checkable, which does mean
 * both restaurants' fonts are in the bundle during development. Harmless, and it
 * disappears once each restaurant deploys on its own (PLATFORM.md §2).
 */
export const metadata: Metadata =
  ACTIVE_RESTAURANT === "snowdaes" ? snowdaesMetadata : asianKitchenMetadata;

/* Same switch as the metadata: the browser bar is part of a restaurant's
   colour, so it belongs to the restaurant, not to this shim. Snowdaes has not
   declared one yet and keeps Next's default. */
export const viewport: Viewport | undefined =
  ACTIVE_RESTAURANT === "snowdaes" ? undefined : asianKitchenViewport;

export default function Page() {
  return ACTIVE_RESTAURANT === "snowdaes" ? <SnowdaesRoot /> : <AsianKitchenRoot />;
}
