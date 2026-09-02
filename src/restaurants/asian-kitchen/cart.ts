/**
 * The cart, and the one job it has beyond holding lines: surviving a
 * navigation to `/checkout`.
 *
 * `MenuScreen` keeps the cart in React state, which is right — it is the
 * screen's own working set. But checkout is a separate route, and a `useState`
 * does not cross a navigation. Rather than lift the whole thing into a store
 * that only two screens read, the cart is mirrored into `sessionStorage` on
 * change and read back once on the checkout page.
 *
 * **sessionStorage, not localStorage, deliberately.** A cart is a thing you are
 * in the middle of, not a preference. It should not still be sitting there in a
 * week, and it should not follow you into a second tab where you are ordering
 * something else. "Your usual" is the opposite — that one belongs in
 * localStorage, and lives elsewhere.
 *
 * Every read is defensive. A cart is regenerable — the worst case is an empty
 * checkout page and a walk back to the menu — so nothing here is worth throwing
 * over. Storage can be absent (private windows, blocked site data), the JSON
 * can be from an older shape, and item ids can refer to a menu that has been
 * re-transcribed since. All three are treated the same way: drop it.
 */

import { useMemo, useSyncExternalStore } from "react";
import { itemById, optionById } from "./menu";

/** One line of the cart: an item plus the options chosen for it. */
export interface Line {
  itemId: string;
  picks: string[];
  /** Dollars, and a PREVIEW ONLY — Square is the calculator (AGENTS.md §4). */
  price: number;
  label: string;
}

const KEY = "ak.cart.v1";

export function saveCart(lines: Line[]): void {
  try {
    if (lines.length === 0) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // Storage unavailable. The cart still works for this screen; it just will
    // not survive the hop to checkout, which is a degradation and not a fault.
  }
}

/**
 * Read the cart as a React value.
 *
 * `useSyncExternalStore`, not `useState` + `useEffect`. The effect form is what
 * React 19's `react-hooks/set-state-in-effect` rule exists to discourage, and it
 * is the wrong tool anyway: this is a value read out of the DOM's storage, not
 * state we own. Same reasoning, same shape as
 * `snowdaes/lib/use-theme-scope.ts`.
 *
 * The snapshot is the raw STRING rather than the parsed array, because
 * `getSnapshot` must be referentially stable — returning a fresh array on every
 * call spins React in a re-render loop. Parsing happens in a `useMemo` keyed on
 * that string.
 *
 * Three states, and they are not the same: `null` means the page has not
 * hydrated yet (render nothing, not "empty"), `""` means the cart is genuinely
 * empty, and anything else is JSON.
 */
const subscribe = () => () => {};

const readRaw = (): string => {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

const serverSnapshot = (): null => null;

export function useStoredCart(): Line[] | null {
  const raw = useSyncExternalStore(subscribe, readRaw, serverSnapshot);
  return useMemo(() => (raw === null ? null : parseCart(raw)), [raw]);
}

export function loadCart(): Line[] {
  return parseCart(readRaw());
}

function parseCart(raw: string): Line[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  // Validate against the live menu rather than trusting the stored shape. A
  // line naming an item or option that no longer exists would be rejected by
  // /api/square/checkout anyway; dropping it here means the customer sees a
  // shorter cart instead of an error they cannot act on.
  return parsed.filter((line): line is Line => {
    if (!line || typeof line !== "object") return false;
    const l = line as Partial<Line>;
    if (typeof l.itemId !== "string" || !itemById(l.itemId)) return false;
    if (typeof l.price !== "number" || typeof l.label !== "string") return false;
    if (!Array.isArray(l.picks)) return false;
    return l.picks.every((p) => typeof p === "string" && optionById(p));
  });
}

export function clearCart(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** What `/api/square/*` accepts. Ids and counts only — never prices. */
export function toRequestLines(lines: Line[]) {
  return lines.map((l) => ({ itemId: l.itemId, picks: l.picks }));
}
