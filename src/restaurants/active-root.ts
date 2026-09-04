/**
 * The one restaurant this build serves — resolved by the BUNDLER, not at
 * runtime.
 *
 * ── WHY A MODULE ALIAS AND NOT A TERNARY ─────────────────────────────────────
 *
 * All three routes — `/`, `/checkout`, `/order/[id]` — used to import both
 * restaurants and pick between them with `ACTIVE_RESTAURANT === "snowdaes"`.
 * The condition picks correctly, but an import is not a runtime decision: both
 * subtrees were in the module graph, so both were in the browser bundle.
 *
 * MEASURED on the Snowdaes build, in a browser: of 739KB of JavaScript actually
 * downloaded, 297KB was a chunk containing Asian Kitchen — "Center Point",
 * their menu screen, their components. Forty per cent of the payload was a
 * restaurant this deployment does not serve and cannot navigate to.
 *
 * The file comment in `page.tsx` said this "disappears once each restaurant
 * deploys on its own". It does not, and never did: the import is unconditional
 * and `RESTAURANT` is read at runtime, so there is nothing for the bundler to
 * fold away. Both restaurants ARE deployed on their own today, and both
 * deployments still carried both.
 *
 * ── AND WHY IT MATTERS MORE AT FORTY RESTAURANTS THAN AT TWO ─────────────────
 *
 * The cost is not a fixed 297KB, it is every restaurant in the repo. At two
 * shops each customer downloads one shop they will never see; at forty they
 * would download thirty-nine. `PLATFORM.md` §4b argues that restaurants share
 * nothing at any N — this is that invariant reaching the bundle, where it had
 * quietly stopped being true.
 *
 * This file is the DEFAULT, and it is Snowdaes for the same reason
 * `active.ts` defaults there. `next.config.ts` aliases this specifier to
 * `asian-kitchen/active-root.tsx` when `RESTAURANT` says so, so the other
 * restaurant is never resolved at all.
 */
export {
  ActiveRoot,
  ActiveShell,
  ActiveCheckout,
  ActiveOrderConfirmation,
  activeMetadata,
  activeViewport,
} from "./snowdaes/active-root";
