"use client";

import { ShoppingBag } from "lucide-react";
import { useCart } from "@/restaurants/snowdaes/lib/use-cart";
import { useCartUi } from "@/restaurants/snowdaes/lib/use-cart-ui";

/**
 * The bag in the utility bar. Its own island so the bar's text — which never
 * changes — can stay server-rendered HTML.
 */
export function CartButton() {
  const itemCount = useCart((s) => s.totalItemCount());
  const setOpen = useCartUi((s) => s.setOpen);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`Open order, ${itemCount} items`}
      className="relative grid size-11 shrink-0 place-items-center rounded-full border border-border bg-card transition-colors hover:border-primary"
    >
      <ShoppingBag className="size-[18px]" />
      {itemCount > 0 && (
        <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 font-mono text-[11px] leading-5 font-semibold text-primary-foreground tabular-nums">
          {itemCount}
        </span>
      )}
    </button>
  );
}
