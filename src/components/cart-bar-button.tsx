"use client";

import { ShoppingBag } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/store/useCart";
import { cn } from "@/lib/utils";

/**
 * The one control that follows you through the whole menu. Rendered fixed to
 * the bottom on phones, and parked in the brand rail on desktop.
 */
export function CartBarButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  const count = useCart((s) => s.totalItemCount());
  const total = useCart((s) => s.total());

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-full bg-primary px-6 py-4 text-primary-foreground",
        "transition-transform duration-150 active:scale-[0.985]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className,
      )}
    >
      <ShoppingBag className="size-4 shrink-0" />
      <span className="flex-1 text-left text-[15px] font-semibold">
        View order
        <span className="ml-2 font-mono text-[13px] font-normal opacity-70 tabular-nums">
          {count} {count === 1 ? "item" : "items"}
        </span>
      </span>
      <span className="font-mono text-[15px] font-semibold tabular-nums">
        {formatPrice(total)}
      </span>
    </button>
  );
}
