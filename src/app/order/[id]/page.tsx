import { notFound } from "next/navigation";
import { ACTIVE_RESTAURANT } from "@/restaurants/active";
import { OrderConfirmation } from "@/restaurants/asian-kitchen/order-confirmation";
import { AsianKitchenShell } from "@/restaurants/asian-kitchen/root";
import { SnowdaesOrderConfirmation } from "@/restaurants/snowdaes/order-confirmation";
import { SnowdaesShell } from "@/restaurants/snowdaes/root";

/** `/order/[id]` — the confirmation. Same reasoning as `/checkout`. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (ACTIVE_RESTAURANT === "snowdaes") {
    return (
      <SnowdaesShell>
        <SnowdaesOrderConfirmation orderId={id} />
      </SnowdaesShell>
    );
  }
  if (ACTIVE_RESTAURANT === "asian-kitchen") {
    return (
      <AsianKitchenShell>
        <OrderConfirmation orderId={id} />
      </AsianKitchenShell>
    );
  }
  notFound();
}
