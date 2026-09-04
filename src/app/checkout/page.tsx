import { ActiveCheckout, ActiveShell } from "@/restaurants/active-root";

/**
 * `/checkout` — whichever restaurant this deployment is for.
 *
 * A shim, like every other file in `app/` (AGENTS.md invariant 2): it names a
 * URL and renders something from `src/restaurants/`. The two checkouts share no
 * code and are not meant to — one talks to Clover, the other to Square, and
 * PLATFORM.md §3 is explicit that the interface is not extracted until both
 * work end to end.
 *
 * There is no `ACTIVE_RESTAURANT` branch and no `notFound()` fallback left:
 * `@/restaurants/active-root` resolves to exactly one restaurant at build time,
 * so there is no "anything else" case to guard. See that file — the branch used
 * to put both restaurants in every customer's bundle.
 */
export default function Page() {
  return (
    <ActiveShell>
      <ActiveCheckout />
    </ActiveShell>
  );
}
