"use client";

import { useMemo, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MENU_CATEGORIES, MENU_ITEMS } from "@/config/menu";
import { formatPrice } from "@/lib/format";
import { ModifierDrawer } from "@/components/modifier-drawer";
import { CartSheet } from "@/components/cart-sheet";
import { useCart } from "@/store/useCart";
import type { MenuItem } from "@/types/boba";

export default function Home() {
  const [activeCategory, setActiveCategory] = useState(MENU_CATEGORIES[0].id);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const totalItemCount = useCart((s) => s.totalItemCount());
  const total = useCart((s) => s.total());

  const itemsForCategory = useMemo(
    () => MENU_ITEMS.filter((item) => item.categoryId === activeCategory),
    [activeCategory],
  );

  function openDrawerFor(item: MenuItem) {
    setSelectedItem(item);
    setDrawerOpen(true);
  }

  return (
    <div className="flex min-h-screen flex-col pb-24">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="font-heading text-lg font-semibold tracking-tight">Boba Shop</h1>
            <Badge variant="secondary" className="mt-1">
              Open &bull; Pickup in 15-20 min
            </Badge>
          </div>
          <Button variant="outline" size="icon" onClick={() => setCartOpen(true)}>
            <ShoppingBag className="size-4" />
          </Button>
        </div>

        <div className="mx-auto max-w-2xl px-4 pb-3">
          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList className="w-full justify-start overflow-x-auto">
              {MENU_CATEGORIES.map((category) => (
                <TabsTrigger key={category.id} value={category.id}>
                  {category.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {itemsForCategory.map((item) => (
            <Card
              key={item.id}
              className="cursor-pointer overflow-hidden py-0 transition-colors hover:border-primary/50"
              onClick={() => openDrawerFor(item)}
            >
              <div className="flex h-24 items-center justify-center bg-gradient-to-br from-secondary to-muted text-2xl">
                🧋
              </div>
              <CardContent className="flex flex-col gap-1 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-tight">{item.name}</p>
                  {item.isPopular && (
                    <Badge className="shrink-0" variant="secondary">
                      Popular
                    </Badge>
                  )}
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                <p className="mt-1 text-sm font-semibold text-primary">
                  {formatPrice(item.basePrice)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      {totalItemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <Button size="lg" className="w-full" onClick={() => setCartOpen(true)}>
              View Cart &bull; {totalItemCount} item{totalItemCount > 1 ? "s" : ""} &bull;{" "}
              {formatPrice(total)}
            </Button>
          </div>
        </div>
      )}

      <ModifierDrawer
        key={selectedItem?.id ?? "none"}
        item={selectedItem}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
      <CartSheet open={cartOpen} onOpenChange={setCartOpen} />
    </div>
  );
}
