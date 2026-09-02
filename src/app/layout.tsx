import type { Metadata } from "next";
import "./globals.css";

/**
 * The only thing the two restaurants share.
 *
 * Next allows exactly one root layout, so this exists whether we want it or not.
 * It is kept deliberately empty of personality: **no fonts, no palette, no
 * theme colour, no shop name.** Snowdaes and Asian Kitchen have nothing in
 * common, and anything set here would leak from one into the other — which it
 * did, until the body background was moved out of here (PLATFORM.md §2).
 *
 * Each restaurant's own route supplies its fonts, its metadata and its ground:
 * `app/page.tsx` for Snowdaes, `app/asian-kitchen/page.tsx` for Asian Kitchen.
 *
 * `globals.css` stays because it carries Tailwind's preflight, which the
 * vendored shadcn primitives in `components/ui/` need. It is not a shared theme.
 */
export const metadata: Metadata = {
  title: "Order for pickup",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
