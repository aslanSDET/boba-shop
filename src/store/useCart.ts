import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { CartItem, MenuItem, SelectedModifiers } from "@/types/boba";
import { calculateCartItemPrice } from "@/config/menu";

const TAX_RATE = 0.0875;

interface CartState {
  items: CartItem[];
  addItem: (menuItem: MenuItem, modifiers: SelectedModifiers, quantity?: number) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, delta: number) => void;
  clearCart: () => void;
  subtotal: () => number;
  tax: () => number;
  total: () => number;
  totalItemCount: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  items: [],

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

  clearCart: () => set({ items: [] }),

  subtotal: () =>
    get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),

  tax: () => get().subtotal() * TAX_RATE,

  total: () => get().subtotal() + get().tax(),

  totalItemCount: () =>
    get().items.reduce((sum, i) => sum + i.quantity, 0),
}));
