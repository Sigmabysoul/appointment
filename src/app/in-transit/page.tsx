import { AppShell } from "@/components/app-shell";
import { OrderTable } from "@/components/order-table";
import { listConsignments } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function InTransitPage() {
  const orders = await listConsignments({ limit: 2000 });

  return (
    <AppShell currentPath="/in-transit">
      <header className="page-header">
        <div>
          <h1>In-Transit Queue</h1>
          <p className="eyebrow">
            Real-time tracking of active shipments in-transit and out for delivery across all sheets.
          </p>
        </div>
        <span className="desktop-hint">Viewer-Only Queue</span>
      </header>
      <section className="panel">
        <OrderTable orders={orders} initialSubsection="in_transit" />
      </section>
    </AppShell>
  );
}
