import { create } from "zustand";

/**
 * Whether the cart sheet is open.
 *
 * ── WHY THIS IS A STORE AND NOT `useState` IN A PARENT ───────────────────────
 *
 * It was `useState` in `home.tsx`, which worked only because `home.tsx` was one
 * enormous `"use client"` component — and that is precisely what cost 844ms of
 * dead taps on a mid-range phone: the hero, the menu grid, the testimonials and
 * the footer all had to hydrate before anything responded.
 *
 * Once the page became a server component there is no common client parent
 * left. Three separate islands need this one boolean: the bag button in the
 * utility bar, the bar pinned to the bottom of the page, and the sheet itself.
 * Lifting the state back up to hold them together would mean making the whole
 * page client again, which is the thing being fixed.
 *
 * Deliberately NOT part of `use-cart`: that store is persisted to
 * localStorage, and "the sheet was open when you closed the tab" is not a fact
 * worth restoring.
 */
export const useCartUi = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
