import type { Metadata } from "next";
import { DM_Sans, Fraunces, Geist_Mono } from "next/font/google";
import { SnowdaesHome } from "./home";
import { CartHydrator } from "./components/cart-hydrator";
import "./theme.css";

/**
 * Everything that makes a page Snowdaes: its fonts, its metadata, its ground.
 *
 * This lives with the restaurant rather than in `app/` because none of it is
 * true of the other shop. `app/page.tsx` only decides *which* restaurant to
 * render; it does not describe either of them.
 *
 * `snowdaes` and `font-sans` on the wrapper are both load-bearing. The palette
 * is scoped to `.snowdaes` (see theme.css), and `globals.css` applies
 * `font-sans` to `body` — a level ABOVE where the font variables are declared,
 * so without `font-sans` here every word falls back to a serif.
 */
const fraunces = Fraunces({ variable: "--font-display", subsets: ["latin"], display: "swap" });
const dmSans = DM_Sans({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"], display: "swap" });

export const snowdaesMetadata: Metadata = {
  title: "Snowdaes | Order for pickup",
  description:
    "Shaved snow, egg puffs, and milk tea from Snowdaes in Billerica, MA. Order ahead for pickup.",
};

/**
 * The ground every Snowdaes route stands on.
 *
 * Extracted when checkout stopped being a panel inside the cart drawer and
 * became `/checkout` and `/order/[id]` of its own. Those routes need the same
 * fonts, the same scoped palette and the same cart hydration as the menu, and
 * the alternative — each route re-declaring them — is how two pages drift into
 * looking like two different shops.
 *
 * Mirrors `AsianKitchenShell`. The two are deliberately not shared: no import
 * may cross between restaurants (AGENTS.md invariant 1).
 */
export function SnowdaesShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${fraunces.variable} ${dmSans.variable} ${geistMono.variable} snowdaes font-sans flex min-h-dvh flex-col bg-background text-foreground antialiased`}
    >
      <CartHydrator />
      {children}
    </div>
  );
}

export function SnowdaesRoot() {
  return (
    <SnowdaesShell>
      <SnowdaesHome />
    </SnowdaesShell>
  );
}
