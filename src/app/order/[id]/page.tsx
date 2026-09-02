import { notFound } from "next/navigation";
import { ACTIVE_RESTAURANT } from "@/restaurants/active";
import { OrderConfirmation } from "@/restaurants/asian-kitchen/order-confirmation";
import { AsianKitchenShell } from "@/restaurants/asian-kitchen/root";

/** `/order/[id]` — Asian Kitchen only. Same reasoning as `/checkout`. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (ACTIVE_RESTAURANT !== "asian-kitchen") notFound();
  const { id } = await params;
  return (
    <AsianKitchenShell>
      <OrderConfirmation orderId={id} />
    </AsianKitchenShell>
  );
}
