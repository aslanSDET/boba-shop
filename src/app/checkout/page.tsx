import { notFound } from "next/navigation";
import { ACTIVE_RESTAURANT } from "@/restaurants/active";
import { Checkout } from "@/restaurants/asian-kitchen/checkout";
import { AsianKitchenShell } from "@/restaurants/asian-kitchen/root";
import { SnowdaesCheckout } from "@/restaurants/snowdaes/checkout";
import { SnowdaesShell } from "@/restaurants/snowdaes/root";

/**
 * `/checkout` — whichever restaurant this deployment is for.
 *
 * A shim, like every other file in `app/` (AGENTS.md invariant 2): it names a
 * URL and renders something from `src/restaurants/`. The two checkouts share no
 * code and are not meant to — one talks to Clover, the other to Square, and
 * PLATFORM.md §3 is explicit that the interface is not extracted until both
 * work end to end.
 *
 * `notFound()` for anything else rather than an empty page, because a checkout
 * that renders nothing looks broken.
 */
export default function Page() {
  if (ACTIVE_RESTAURANT === "snowdaes") {
    return (
      <SnowdaesShell>
        <SnowdaesCheckout />
      </SnowdaesShell>
    );
  }
  if (ACTIVE_RESTAURANT === "asian-kitchen") {
    return (
      <AsianKitchenShell>
        <Checkout />
      </AsianKitchenShell>
    );
  }
  notFound();
}
