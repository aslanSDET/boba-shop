import type { Metadata, Viewport } from "next";
import { Saira_Condensed, Public_Sans, JetBrains_Mono } from "next/font/google";
import { MenuScreen } from "./components/menu-screen";
import { BRAND_GREEN, RESTAURANT } from "./config";
import "./theme.css";

/**
 * Everything that makes a page Asian Kitchen: its fonts, its metadata, its
 * ground. Mirrors `restaurants/snowdaes/root.tsx` exactly.
 *
 * The wrapper paints its own background because `globals.css` is shared and one
 * restaurant's ground must never show behind another's page.
 */
const display = Saira_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-ak-display",
  display: "swap",
});
const body = Public_Sans({ subsets: ["latin"], variable: "--font-ak-body", display: "swap" });
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-ak-mono",
  display: "swap",
});

export const asianKitchenMetadata: Metadata = {
  title: `${RESTAURANT.name} · Order Pickup`,
  description: `${RESTAURANT.tagline}. Order pickup direct from ${RESTAURANT.name}, ${RESTAURANT.address}.`,
  /* Saved to a home screen this opens without browser chrome, which is how a
     shop's regulars will use it. */
  appleWebApp: { capable: true, title: RESTAURANT.name, statusBarStyle: "black-translucent" },
};

/**
 * On a phone the browser paints its own bar above and below the page, and by
 * default that bar is white — so the green sign stops dead at the top of the
 * viewport and the whole thing reads as a web page in a browser rather than as
 * the shop. Matching it to the header is the single cheapest thing that makes
 * this feel like the restaurant's own app.
 *
 * `interactiveWidget` keeps the layout from being shoved upward when a keyboard
 * appears. Zoom is deliberately left enabled: disabling it is an accessibility
 * failure and this menu has 10px calorie counts on it.
 */
export const asianKitchenViewport: Viewport = {
  themeColor: BRAND_GREEN,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

/**
 * The wrapper every Asian Kitchen route needs: fonts, and the ground.
 *
 * Extracted when `/checkout` and `/order/[id]` arrived. Without it those routes
 * render outside `.ak-page`, and since the palette and the font variables both
 * live on this element they would come out unstyled in a system typeface — the
 * exact failure the Snowdaes portals hit, for the exact same reason
 * (`snowdaes/lib/use-theme-scope.ts`).
 */
export function AsianKitchenShell({ children }: { children: React.ReactNode }) {
  return (
    /*
     * `ak` as well as `ak-page`, and they are not the same thing: `ak-page`
     * paints the ground, `ak` is where theme.css declares every colour and
     * spacing token. That declaration used to sit on a div inside MenuScreen,
     * which was fine while the menu was the only screen — /checkout and
     * /order/[id] rendered inside `ak-page` but outside `ak`, so their rules
     * matched and every var() resolved to nothing: a transparent pill,
     * borderless cards, invisible inputs.
     *
     * Exactly the Snowdaes portal bug in a different costume — a token scope
     * sitting lower in the tree than the things that need it. MenuScreen keeps
     * its own `ak` div; a nested redeclaration of identical values is harmless,
     * and removing it risks the menu for no gain.
     */
    <div className={`ak ak-page ${display.variable} ${body.variable} ${mono.variable}`}>
      {children}
    </div>
  );
}

export function AsianKitchenRoot() {
  return (
    <AsianKitchenShell>
      <MenuScreen />
    </AsianKitchenShell>
  );
}
