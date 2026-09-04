import type { Metadata, Viewport } from "next";
import { ActiveRoot, activeMetadata, activeViewport } from "@/restaurants/active-root";

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
 * There is no switch left in this file. It used to import both roots and pick
 * with a ternary, and the comment here claimed the unused one "disappears once
 * each restaurant deploys on its own" — it did not. Measured in a browser on
 * the Snowdaes build: 297KB of the 739KB downloaded was Asian Kitchen. An
 * import is not a runtime decision, so both were always in the bundle.
 *
 * `@/restaurants/active-root` is resolved to one restaurant by the bundler
 * (`next.config.ts`), so the other is never in the graph. That file has the
 * long version.
 */
export const metadata: Metadata = activeMetadata;

/* The browser bar is part of a restaurant's colour, so it belongs to the
   restaurant, not to this shim. Snowdaes has not declared one and keeps Next's
   default, which is what `undefined` means here. */
export const viewport: Viewport | undefined = activeViewport;

export default function Page() {
  return <ActiveRoot />;
}
