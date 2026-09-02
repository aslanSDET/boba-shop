"use client";

import * as React from "react";

/**
 * The element the palette and the fonts are actually declared on.
 *
 * ── THE BUG THIS EXISTS TO PREVENT ───────────────────────────────────────────
 *
 * Radix and vaul render overlay content through a **portal**, which mounts to
 * `document.body` by default. `.snowdaes` is a `<div>` *inside* `<body>`
 * (`root.tsx`), so portalled content is a SIBLING of the theme scope, not a
 * descendant, and inherits nothing from it.
 *
 * Measured on a real page rather than reasoned about, with the modifier dialog
 * open:
 *
 *   computedBackgroundColor : rgba(0, 0, 0, 0)      ← fully transparent
 *   --background            : (EMPTY)
 *   --card / --popover      : (EMPTY)
 *   --border                : (EMPTY)
 *   fontFamily              : -apple-system, system-ui, Segoe UI, Roboto…
 *   insideSnowdaesScope     : false
 *
 * So `bg-background` resolved to nothing and the panel was see-through over the
 * menu grid, and the copy fell back to the system stack instead of DM Sans.
 * Both symptoms, one cause — the wrapper carries the colour tokens AND the
 * `next/font` variables, and a portal escapes both at once.
 *
 * This is a regression from `009c26b`, the restructure that gave each
 * restaurant its own folder. It moved the palette out of `:root` in
 * `globals.css` and into `.snowdaes` in `theme.css`, which was the right call
 * — `:root` made one shop's orange a property of the whole application — but
 * `:root` had been quietly covering the portals, and a class on a `<div>` does
 * not. `theme.css` states the assumption that fails: the primitives "resolve
 * `--background`, `--border`, `--radius` and friends from whatever ancestor
 * defines them". True, and a portal has no such ancestor.
 *
 * ── WHY `useSyncExternalStore` AND NOT AN EFFECT ─────────────────────────────
 *
 * `document` does not exist while rendering on the server, so the lookup cannot
 * happen during render. The obvious shape — `useState` plus a `useEffect` that
 * sets it — is what React 19 added the `react-hooks/set-state-in-effect` rule
 * to discourage, and it is the wrong tool anyway: this is not state we own, it
 * is a value read out of the DOM.
 *
 * `useSyncExternalStore` says exactly that. The server snapshot is `undefined`,
 * the client snapshot is the element, and React reconciles the two across
 * hydration without a render-then-correct pass.
 *
 * The empty `subscribe` is deliberate. The theme wrapper is rendered once by
 * `SnowdaesRoot` and never moves, so there is no change to subscribe to. And
 * `querySelector` returns the same node by reference on every call, which is
 * what `getSnapshot` requires — returning a fresh object here would spin React
 * in a re-render loop.
 *
 * `container={undefined}` is Radix's own default, so the server case degrades
 * to exactly the current behaviour rather than to an error.
 *
 * ── IF YOU ADD ANOTHER PORTALLING PRIMITIVE ──────────────────────────────────
 *
 * Popover, tooltip, select, combobox, context menu and dropdown all portal too.
 * Any of them vendored into `components/ui/` needs this same `container`, or it
 * arrives transparent and in the wrong typeface for the same reason. That
 * repetition is the known cost of fixing this here rather than moving the theme
 * scope up to `<body>`; the trade was taken deliberately, to keep `app/` free
 * of either restaurant's identity (AGENTS.md invariants 2 and 3).
 */
/** Nothing to subscribe to: the wrapper is mounted once and never replaced. */
const subscribe = () => () => {};

const getSnapshot = () =>
  document.querySelector<HTMLElement>(".snowdaes") ?? undefined;

/** No DOM on the server, so there is no scope to hand back yet. */
const getServerSnapshot = () => undefined;

export function useThemeScope(): HTMLElement | undefined {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
