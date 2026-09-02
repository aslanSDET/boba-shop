import { notFound } from "next/navigation";
import { ACTIVE_RESTAURANT } from "@/restaurants/active";
import { Checkout } from "@/restaurants/asian-kitchen/checkout";
import { AsianKitchenShell } from "@/restaurants/asian-kitchen/root";

/**
 * `/checkout` — Asian Kitchen only.
 *
 * A shim, like every other file in `app/` (AGENTS.md invariant 2). Snowdaes has
 * its own checkout inside the cart sheet rather than on a route, so on a
 * Snowdaes deployment this URL does not exist — `notFound()` rather than an
 * empty page, because a checkout that renders nothing looks broken.
 */
export default function Page() {
  if (ACTIVE_RESTAURANT !== "asian-kitchen") notFound();
  return (
    <AsianKitchenShell>
      <Checkout />
    </AsianKitchenShell>
  );
}
