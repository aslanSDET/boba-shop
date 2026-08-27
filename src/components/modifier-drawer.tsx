"use client";

import { useMemo, useState } from "react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { calculateCartItemPrice } from "@/config/menu";
import { formatIceLevel, formatPrice } from "@/lib/format";
import { useCart } from "@/store/useCart";
import type { DrinkSize, MenuItem, SelectedModifiers, SugarLevel } from "@/types/boba";
import { cn } from "@/lib/utils";

interface ModifierDrawerProps {
  item: MenuItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function OptionPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-secondary text-secondary-foreground hover:border-primary/50",
      )}
    >
      {children}
    </button>
  );
}

export function ModifierDrawer({ item, open, onOpenChange }: ModifierDrawerProps) {
  const addItem = useCart((s) => s.addItem);

  const [size, setSize] = useState<DrinkSize>("MEDIUM");
  const [sugarLevel, setSugarLevel] = useState<SugarLevel>("100%");
  const [iceLevel, setIceLevel] = useState(item?.availableIceLevels[0] ?? "REGULAR_ICE");
  const [toppingIds, setToppingIds] = useState<Set<string>>(new Set());

  const modifiers: SelectedModifiers = useMemo(
    () => ({
      size,
      sugarLevel,
      iceLevel,
      toppings: item?.availableToppings.filter((t) => toppingIds.has(t.id)) ?? [],
    }),
    [size, sugarLevel, iceLevel, toppingIds, item],
  );

  const unitPrice = item ? calculateCartItemPrice(item, modifiers) : 0;

  function resetAndClose() {
    setSize("MEDIUM");
    setSugarLevel("100%");
    setToppingIds(new Set());
    onOpenChange(false);
  }

  function toggleTopping(id: string) {
    setToppingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!item) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{item.name}</DrawerTitle>
          <DrawerDescription>{item.description}</DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-4">
          <div className="flex flex-col gap-2">
            <Label>Size</Label>
            <div className="flex gap-2">
              {(Object.keys(item.availableSizes) as DrinkSize[]).map((s) => (
                <OptionPill key={s} active={size === s} onClick={() => setSize(s)}>
                  {s === "MEDIUM" ? "Medium" : "Large"}
                  {item.availableSizes[s] ? ` (+${formatPrice(item.availableSizes[s]!)})` : ""}
                </OptionPill>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Sugar Level</Label>
            <div className="flex flex-wrap gap-2">
              {item.availableSugarLevels.map((s) => (
                <OptionPill key={s} active={sugarLevel === s} onClick={() => setSugarLevel(s)}>
                  {s}
                </OptionPill>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Ice Level</Label>
            <div className="flex flex-wrap gap-2">
              {item.availableIceLevels.map((l) => (
                <OptionPill key={l} active={iceLevel === l} onClick={() => setIceLevel(l)}>
                  {formatIceLevel(l)}
                </OptionPill>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Toppings</Label>
            <div className="flex flex-wrap gap-2">
              {item.availableToppings.map((t) => (
                <OptionPill
                  key={t.id}
                  active={toppingIds.has(t.id)}
                  onClick={() => toggleTopping(t.id)}
                >
                  {t.name} (+{formatPrice(t.price)})
                </OptionPill>
              ))}
            </div>
          </div>
        </div>

        <DrawerFooter>
          <Button
            size="lg"
            onClick={() => {
              addItem(item, modifiers);
              resetAndClose();
            }}
          >
            Add to Order &bull; {formatPrice(unitPrice)}
          </Button>
          <DrawerClose asChild>
            <Button variant="ghost" onClick={resetAndClose}>
              Cancel
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
