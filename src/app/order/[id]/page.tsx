import { ActiveOrderConfirmation, ActiveShell } from "@/restaurants/active-root";

/** `/order/[id]` — the confirmation. Same reasoning as `/checkout`. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ActiveShell>
      <ActiveOrderConfirmation orderId={id} />
    </ActiveShell>
  );
}
