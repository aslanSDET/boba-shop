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

export function AsianKitchenRoot() {
  return (
    <div className={`ak-page ${display.variable} ${body.variable} ${mono.variable}`}>
      <MenuScreen />
    </div>
  );
}
