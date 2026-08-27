"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatIceLevel, formatPrice } from "@/lib/format";
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Your Order</SheetTitle>
          <SheetDescription>
            {items.length === 0 ? "Your cart is empty." : "Review your items before checkout."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <div className="flex flex-col gap-4">
            {items.map((cartItem) => (
              <div key={cartItem.cartItemId} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{cartItem.menuItem.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cartItem.modifiers.size === "LARGE" ? "Large" : "Medium"} &middot;{" "}
                      {cartItem.modifiers.sugarLevel} sugar &middot;{" "}
                      {formatIceLevel(cartItem.modifiers.iceLevel)}
                      {cartItem.modifiers.toppings.length > 0
                        ? ` · ${cartItem.modifiers.toppings.map((t) => t.name).join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(cartItem.cartItemId)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove item"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-7"
                      onClick={() => updateQuantity(cartItem.cartItemId, -1)}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-4 text-center text-sm">{cartItem.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-7"
                      onClick={() => updateQuantity(cartItem.cartItemId, 1)}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                  <span className="font-medium">
                    {formatPrice(cartItem.unitPrice * cartItem.quantity)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {items.length > 0 && (
          <SheetFooter className="border-t border-border pt-4">
            <div className="flex w-full flex-col gap-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span>{formatPrice(tax)}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>
            <Button size="lg" disabled>
              Checkout (coming soon)
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
