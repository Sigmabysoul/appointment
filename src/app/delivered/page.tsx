import { AppShell } from "@/components/app-shell";
import { OrderTable } from "@/components/order-table";
import { listConsignments } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DeliveredPage() {
  const orders = await listConsignments({ limit: 2000 });

  return (
    <AppShell currentPath="/delivered">
      <header className="page-header">
        <div>
          <h1>Delivered Shipments</h1>
          <p className="eyebrow">
            Shipments marked as Delivered directly in the source Google Sheets.
          </p>
        </div>
        <span className="desktop-hint">Verified Delivered</span>
      </header>
      <section className="panel">
        <OrderTable orders={orders} initialSubsection="delivered" />
      </section>
    </AppShell>
  );
}
