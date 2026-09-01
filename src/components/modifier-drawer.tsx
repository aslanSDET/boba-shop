"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Minus, Plus, Search, X } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ItemVisual } from "@/components/item-visual";
import {
  calculateCartItemPrice,
  defaultSelection,
  startingPrice,
  unmetGroups,
} from "@/config/menu";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/store/useCart";
import type { MenuItem, ModifierGroup, SelectedModifiers } from "@/types/boba";
import { cn } from "@/lib/utils";
import {
  FILTERABLE,
  shapeItemGroups,
  type ShapedGroup,
} from "@/lib/modifier-shape";

interface ModifierDrawerProps {
  item: MenuItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "Required", "2 of 6", "3 added" — whatever the group needs said. */
function groupHint(group: ModifierGroup, chosen: number): string {
  if (group.kind === "single") return group.min > 0 ? "Required" : "Optional";
  if (group.max !== undefined) return `${chosen} of ${group.max}`;
  if (group.min > 0) return chosen > 0 ? `${chosen} added` : "Required";
  return chosen > 0 ? `${chosen} added` : "Optional";
}

/**
 * An ingredient the drink comes with. Reads as present by default; tapping
 * removes it — which in Clover's model means SELECTING the "No X" option, so
 * the visual state is the inverse of the selection. A customer thinks "take the
 * pebbles off", never "add No Pebbles", and the control should match the
 * thought rather than the data.
 */
function IncludedChip({
  label,
  removed,
  extraActive,
  extraDelta,
  onToggle,
  onExtra,
}: {
  label: string;
  removed: boolean;
  extraActive: boolean;
  extraDelta?: number;
  onToggle: () => void;
  onExtra?: () => void;
}) {
  return (
    <span className="inline-flex items-stretch overflow-hidden rounded-full border border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={!removed}
        className={cn(
          "px-4 py-3 text-base transition-colors",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-ink",
          removed
            ? "text-muted-foreground line-through decoration-from-font"
            : "bg-card font-medium text-foreground",
        )}
      >
        {label}
      </button>
      {onExtra && (
        <button
          type="button"
          onClick={onExtra}
          aria-pressed={extraActive}
          disabled={removed}
          aria-label={`Extra ${label}`}
          className={cn(
            "border-l border-border px-3 text-[13px] font-mono tabular-nums transition-colors",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-ink",
            extraActive
              ? "bg-primary font-medium text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
            removed && "cursor-not-allowed opacity-35",
          )}
        >
          Extra{extraDelta ? ` +${formatPrice(extraDelta)}` : ""}
        </button>
      )}
    </span>
  );
}

function OptionPill({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "rounded-full border px-4 py-3 text-base transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink",
        active
          ? "border-primary bg-primary font-medium text-primary-foreground"
          : "border-border bg-card text-foreground hover:border-primary",
        disabled && !active && "cursor-not-allowed opacity-40 hover:border-border",
      )}
    >
      {children}
    </button>
  );
}

export function ModifierDrawer({ item, open, onOpenChange }: ModifierDrawerProps) {
  const addItem = useCart((s) => s.addItem);

  const [selection, setSelection] = useState<SelectedModifiers>(() =>
    item ? defaultSelection(item) : {},
  );
  const [quantity, setQuantity] = useState(1);
  /** Group ids the customer has opened, and the filter text inside each. */
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  // Bottom sheet sits in the thumb zone on a phone; on a desktop the customiser
  // becomes a centred modal so it does not mimic the cart, which owns the right edge.
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const unitPrice = item ? calculateCartItemPrice(item, selection) : 0;
  const unmet = useMemo(
    () => (item ? unmetGroups(item, selection) : []),
    [item, selection],
  );

  const shaped = useMemo(
    () => (item ? shapeItemGroups(item.modifierGroups) : []),
    [item],
  );

  function reset() {
    setSelection(item ? defaultSelection(item) : {});
    setQuantity(1);
    setOpened({});
    setFilters({});
  }

  function toggle(group: ModifierGroup, optionId: string) {
    setSelection((prev) => {
      const current = prev[group.id] ?? [];
      if (group.kind === "single") {
        // Re-tapping a required choice keeps it; the group always holds one.
        return { ...prev, [group.id]: [optionId] };
      }
      if (current.includes(optionId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }
      if (group.max !== undefined && current.length >= group.max) return prev;
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  if (!item) return null;

  const Title = isDesktop ? DialogTitle : DrawerTitle;
  const Description = isDesktop ? DialogDescription : DrawerDescription;

  const start = startingPrice(item);
  /**
   * Radix warns when a dialog advertises a description that is not on the
   * page, and 42 items have no description to render. Passing the attribute
   * as an explicit `undefined` is the documented way to say "there is no
   * description", which is why this is a spread: passing `undefined` in the
   * other branch would also clear the id Radix sets for itself.
   */
  const describedBy: { "aria-describedby"?: undefined } = item.description
    ? {}
    : { "aria-describedby": undefined };

  const heading = (
    <div className="flex items-start gap-4">
      <ItemVisual item={item} className="size-[104px] rounded-full" px={208} sizes="104px" />
      <div className="min-w-0 flex-1">
        <Title className="font-display text-[26px] leading-tight font-semibold">
          {item.name}
        </Title>
        {/* 42 of 93 items carry `description: ""`. Rendering the element anyway
            left a blank line under the name and pointed the sheet's
            `aria-describedby` at an empty node, so it is dropped entirely and
            the describedby link is cleared with it below. */}
        {item.description && (
          <Description className="mt-2 text-base leading-relaxed">
            {item.description}
          </Description>
        )}
        <p className="mt-2.5 font-mono text-[15px] tabular-nums">
          {/* "$0.00 base" on the eight snow items whose price lives in the
              required Snow Size group. `startingPrice` reads that group. */}
          {start.from && (
            <span className="mr-1.5 font-sans text-muted-foreground">from</span>
          )}
          {formatPrice(start.amount)}
          {!start.from && <span className="ml-1.5 text-muted-foreground">base</span>}
        </p>
      </div>
    </div>
  );

  const options = (
    <div className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-5 pb-5">
      {shaped.map((sg: ShapedGroup) => {
        const group = sg.group;
        const chosen = selection[group.id] ?? [];
        const atMax =
          group.kind === "multi" &&
          group.max !== undefined &&
          chosen.length >= group.max;
        const needsChoice = unmet.includes(group);
        const isOpen = opened[group.id] ?? !sg.startClosed;
        const filter = (filters[group.id] ?? "").trim().toLowerCase();
        const visibleAdds = filter
          ? sg.adds.filter((o) => o.name.toLowerCase().includes(filter))
          : sg.adds;
        const addsChosen = sg.adds.filter((o) => chosen.includes(o.id)).length;

        return (
          <section key={group.id} className="border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-mono text-[11px] tracking-[0.18em] uppercase">
                {group.label}
              </h3>
              <span
                className={cn(
                  "font-mono text-[11px] tracking-wide uppercase",
                  needsChoice ? "text-brand-ink" : "text-muted-foreground",
                )}
              >
                {groupHint(group, chosen.length)}
              </span>
            </div>

            {sg.included.length > 0 && (
              <>
                <p className="mt-3 text-[13px] text-muted-foreground">Comes with</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sg.included.map((inc) => (
                    <IncludedChip
                      key={inc.remove.id}
                      label={inc.label}
                      removed={chosen.includes(inc.remove.id)}
                      extraActive={!!inc.extra && chosen.includes(inc.extra.id)}
                      extraDelta={inc.extra?.priceDelta}
                      onToggle={() => {
                        // Removing an ingredient must drop "Extra" with it, or
                        // the order says "no almonds" and "extra almonds" at
                        // once and the customer is charged for the extra.
                        if (inc.extra && !chosen.includes(inc.remove.id)) {
                          setSelection((prev) => ({
                            ...prev,
                            [group.id]: [
                              ...(prev[group.id] ?? []).filter(
                                (id) => id !== inc.extra!.id,
                              ),
                              inc.remove.id,
                            ],
                          }));
                          return;
                        }
                        toggle(group, inc.remove.id);
                      }}
                      onExtra={
                        inc.extra ? () => toggle(group, inc.extra!.id) : undefined
                      }
                    />
                  ))}
                </div>
              </>
            )}

            {sg.adds.length > 0 && sg.startClosed && !isOpen && (
              <button
                type="button"
                onClick={() => setOpened((o) => ({ ...o, [group.id]: true }))}
                className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3 text-left text-base transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
              >
                <span>
                  {addsChosen > 0
                    ? `${addsChosen} added`
                    : `Add ${group.label.toLowerCase().replace(/ \(optional\)\d*$/, "")}`}
                  <span className="ml-2 text-muted-foreground">{sg.adds.length}</span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </button>
            )}

            {sg.adds.length > 0 && isOpen && (
              <>
                {sg.adds.length > FILTERABLE && (
                  /* The icon is the only thing next to the field, and lucide
                     hides it from assistive tech, so the input would otherwise
                     be an unnamed control. The ring moves to the wrapper
                     because the input's own outline is suppressed. */
                  <label className="mt-3 flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-ink">
                    <Search className="size-4 shrink-0 text-muted-foreground" />
                    <span className="sr-only">Search {group.label}</span>
                    <input
                      type="search"
                      value={filters[group.id] ?? ""}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, [group.id]: e.target.value }))
                      }
                      autoComplete="off"
                      spellCheck={false}
                      enterKeyHint="search"
                      placeholder={`Search ${sg.adds.length} options…`}
                      className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                    />
                  </label>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {visibleAdds.map((option) => {
                    const active = chosen.includes(option.id);
                    return (
                      <OptionPill
                        key={option.id}
                        active={active}
                        disabled={atMax && !active}
                        onClick={() => toggle(group, option.id)}
                      >
                        {option.shortName ?? option.name}
                        {option.priceDelta > 0 && (
                          <span className="ml-2 font-mono text-[12px] tabular-nums opacity-70">
                            +{formatPrice(option.priceDelta)}
                          </span>
                        )}
                      </OptionPill>
                    );
                  })}
                  {visibleAdds.length === 0 && (
                    <p className="py-2 text-[15px] text-muted-foreground">
                      Nothing matches “{filters[group.id]}”.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );

  const actions = (
    <div className="flex w-full items-center gap-3">
      <div className="flex items-center gap-1 rounded-full border border-border p-1">
        <button
          type="button"
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          disabled={quantity === 1}
          aria-label="Decrease quantity"
          className="grid size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-35"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-7 text-center font-mono text-[15px] tabular-nums">
          {quantity}
        </span>
        <button
          type="button"
          onClick={() => setQuantity((q) => Math.min(20, q + 1))}
          aria-label="Increase quantity"
          className="grid size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <button
        type="button"
        disabled={unmet.length > 0}
        onClick={() => {
          addItem(item, selection, quantity);
          reset();
          onOpenChange(false);
        }}
        className="flex flex-1 items-center justify-between gap-3 rounded-full bg-primary px-6 py-4 text-[15px] font-semibold text-primary-foreground transition-transform duration-150 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
      >
        <span>
          {unmet.length > 0 ? `Choose ${unmet[0].label.toLowerCase()}` : "Add to order"}
        </span>
        {/* While a required group is unmet the running total can still be
            $0.00 — the snow items keep their whole price in "Snow Size". A
            disabled button reading "$0.00" looks like the bug it is describing,
            so the price appears once there is one. */}
        {unitPrice > 0 && (
          <span className="font-mono tabular-nums">
            {formatPrice(unitPrice * quantity)}
          </span>
        )}
      </button>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          {...describedBy}
          className="flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogHeader className="px-5 pt-6 pb-4 text-left">{heading}</DialogHeader>
          {options}
          <DialogFooter className="mx-0 mt-auto mb-0 w-full rounded-none border-t border-border bg-card px-5 py-4 sm:flex-row sm:justify-stretch">
            {actions}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent {...describedBy} className="mx-auto max-w-xl">
        {/* Dialog and Sheet both ship a close X; the drawer had only the drag
            handle, leaving a gesture as the only discoverable way out. */}
        <DrawerClose className="absolute top-3 right-4 z-10 grid size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink">
          <X className="size-[18px]" />
          <span className="sr-only">Close</span>
        </DrawerClose>
        <DrawerHeader className="px-5 pt-2 pb-4 text-left!">{heading}</DrawerHeader>
        {options}
        <DrawerFooter className="gap-3 border-t border-border bg-card px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {actions}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
