"use client";

import { CartBarButton } from "@/restaurants/snowdaes/components/cart-bar-button";
import dynamic from "next/dynamic";
import { useCart } from "@/restaurants/snowdaes/lib/use-cart";
import { useCartUi } from "@/restaurants/snowdaes/lib/use-cart-ui";

/* Same reasoning as the modifier drawer in `menu-section.tsx`: a closed sheet
   is not on screen, so it does not need to be in the bundle that decides how
   soon the page answers a tap. */
const CartSheet = dynamic(
  () => import("@/restaurants/snowdaes/components/cart-sheet").then((m) => m.CartSheet),
  { ssr: false },
);

/**
 * The bar pinned to the bottom of the page once there is an order, plus the
 * sheet both it and the utility-bar bag open.
 *
 * The spacer is why this renders after the footer rather than wrapping it: the
 * bar is `fixed`, so it covers the last 24 units of the page, and the footer
 * used to be wrapped in a `pb-24` that depended on cart state. Wrapping a
 * server-rendered footer in a client component would have pulled the footer
 * back into the browser bundle for nothing. An empty spacer beside it reserves
 * exactly the same space and keeps the footer on the server.
 */
export function CartDock() {
  const itemCount = useCart((s) => s.totalItemCount());
  const { open, setOpen } = useCartUi();

  return (
    <>
      {itemCount > 0 && (
        <>
          <div aria-hidden className="h-24" />
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/92 px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] backdrop-blur-md">
            <div className="mx-auto max-w-2xl">
              <CartBarButton onClick={() => setOpen(true)} />
            </div>
          </div>
        </>
      )}
      <CartSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
