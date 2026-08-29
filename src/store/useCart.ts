import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { CartItem, MenuItem, SelectedModifiers } from "@/types/boba";
import { calculateCartItemPrice } from "@/config/menu";
import { discountFor, findPromo, type Promo } from "@/config/promos";

/**
 * ── THESE NUMBERS ARE A PREVIEW. CLOVER IS THE CALCULATOR. ───────────────────
 *
 * Everything below exists so the cart can update the instant somebody taps a
 * topping. It is NOT what gets charged.
 *
 * At checkout the order is built in Clover with inventory-linked lines and the
 * discount as a real discount, and CLOVER works out tax and total — measured:
 * two $6.45 items came back at $13.81, which is x1.07, applied by Clover
 * without being asked (scripts/spike/findings.md). The amount charged is the
 * one Clover returns, and the confirmation shows Clover's figure, not this one.
 *
 * That is deliberate. Two calculators that agree today drift apart the first
 * time the shop changes a tax rate in their dashboard, and the disagreement
 * shows up as pennies missing from a deposit rather than as an error anyone
 * would notice. One authority, and it is the one that owns the money.
 *
 * The rate here mirrors what the shop's account actually carries — MA state
 * meals tax 6.25% + local option meals tax 0.75% — so the preview is honest.
 * The previous 8.75% was a placeholder from before the catalog existed and
 * overstated every order by 1.75 points.
 */
const TAX_RATE = 0.07;

interface CartState {
  items: CartItem[];
  /** The applied code, or null. One at a time — stacking is a policy question. */
  promo: Promo | null;
  addItem: (menuItem: MenuItem, modifiers: SelectedModifiers, quantity?: number) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, delta: number) => void;
  clearCart: () => void;
  /** Returns false when the code is not recognised, so the UI can say so. */
  applyPromo: (code: string) => boolean;
  removePromo: () => void;
  subtotal: () => number;
  discount: () => number;
  /** Preview only — Clover computes the tax that is actually charged. */
  tax: () => number;
  /** Preview only — the charged total comes back from Clover at checkout. */
  total: () => number;
  totalItemCount: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  items: [],
  promo: null,

  addItem: (menuItem, modifiers, quantity = 1) => {
    const unitPrice = calculateCartItemPrice(menuItem, modifiers);
    const newItem: CartItem = {
      cartItemId: uuid(),
      menuItem,
      modifiers,
      unitPrice,
      quantity,
    };
    set((state) => ({ items: [...state.items, newItem] }));
  },

  removeItem: (cartItemId) => {
    set((state) => ({
      items: state.items.filter((i) => i.cartItemId !== cartItemId),
    }));
  },

  updateQuantity: (cartItemId, delta) => {
    set((state) => ({
      items: state.items
        .map((i) =>
          i.cartItemId === cartItemId
            ? { ...i, quantity: i.quantity + delta }
            : i,
        )
        .filter((i) => i.quantity > 0),
    }));
  },

  clearCart: () => set({ items: [], promo: null }),

  applyPromo: (code) => {
    const promo = findPromo(code);
    if (!promo) return false;
    set({ promo });
    return true;
  },

  removePromo: () => set({ promo: null }),

  subtotal: () =>
    get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),

  discount: () => discountFor(get().promo, get().subtotal()),

  // Discount before tax — measured against Clover, and matching their ordering
  // is what keeps a discounted order from reconciling cents out every time.
  tax: () => (get().subtotal() - get().discount()) * TAX_RATE,

  total: () => get().subtotal() - get().discount() + get().tax(),

  totalItemCount: () =>
    get().items.reduce((sum, i) => sum + i.quantity, 0),
}));
