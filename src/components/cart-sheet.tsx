"use client";

import { Minus, Plus, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ItemVisual } from "@/components/item-visual";
import { describeModifiers } from "@/config/menu";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/store/useCart";

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CartSheet({ open, onOpenChange }: CartSheetProps) {
  const items = useCart((s) => s.items);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const subtotal = useCart((s) => s.subtotal());
  const tax = useCart((s) => s.tax());
  const total = useCart((s) => s.total());
  const count = useCart((s) => s.totalItemCount());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="gap-1 border-b border-border px-5 pt-5 pb-4">
          <SheetTitle className="font-display text-[26px] font-semibold">
            Your order
          </SheetTitle>
          <SheetDescription className="font-mono text-[11px] tracking-wide uppercase">
            {count === 0
              ? "Nothing added yet"
              : `${count} ${count === 1 ? "item" : "items"} · Pickup in Billerica`}
          </SheetDescription>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-base text-muted-foreground">
              Pick a drink from the menu and it will show up here.
            </p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
            >
              Browse the menu
            </button>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto overscroll-contain px-5">
              {items.map((cartItem) => {
                return (
                  <li
                    key={cartItem.cartItemId}
                    className="flex gap-3.5 border-b border-border py-4"
                  >
                    <ItemVisual item={cartItem.menuItem} className="size-[68px] rounded-full" px={96} sizes="68px" />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-display text-[17px] leading-snug font-semibold">
                          {cartItem.menuItem.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeItem(cartItem.cartItemId)}
                          aria-label={`Remove ${cartItem.menuItem.name}`}
                          className="-mt-0.5 shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
                        {describeModifiers(cartItem.menuItem, cartItem.modifiers)}
                      </p>

                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 rounded-full border border-border p-0.5">
                          <button
                            type="button"
                            onClick={() => updateQuantity(cartItem.cartItemId, -1)}
                            aria-label="Decrease quantity"
                            className="grid size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <span className="w-6 text-center font-mono text-[13px] tabular-nums">
                            {cartItem.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(cartItem.cartItemId, 1)}
                            aria-label="Increase quantity"
                            className="grid size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>
                        <span className="font-mono text-[15px] font-medium tabular-nums">
                          {formatPrice(cartItem.unitPrice * cartItem.quantity)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-border px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <dl className="flex flex-col gap-2 font-mono text-[15px] tabular-nums">
                <div className="flex justify-between text-muted-foreground">
                  <dt>Subtotal</dt>
                  <dd>{formatPrice(subtotal)}</dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>Tax</dt>
                  <dd>{formatPrice(tax)}</dd>
                </div>
                <div className="mt-2 flex justify-between border-t border-border pt-3 text-[17px] font-semibold text-foreground">
                  <dt>Total</dt>
                  <dd>{formatPrice(total)}</dd>
                </div>
              </dl>

              {/* describedby so the disabled state is announced with its reason,
                  not as a dead control */}
              <button
                type="button"
                disabled
                aria-describedby="checkout-status"
                className="mt-5 w-full rounded-full bg-primary px-6 py-4 text-[15px] font-semibold text-primary-foreground disabled:opacity-40"
              >
                Checkout
              </button>
              <p
                id="checkout-status"
                className="mt-2.5 text-center font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase"
              >
                Card and Apple Pay coming soon
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
