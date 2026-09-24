import { AppShell } from "@/components/app-shell";
import { OrderTable } from "@/components/order-table";
import { listConsignments } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TomorrowOrdersPage() {
  const allOrders = await listConsignments({ limit: 2000 });

  return (
    <AppShell currentPath="/tomorrow">
      <header className="page-header">
        <div>
          <h1>Tomorrow&apos;s Orders</h1>
          <p className="eyebrow">
            All shipments scheduled for pickup or dispatch tomorrow across all connected sheets.
          </p>
        </div>
        <span className="desktop-hint">Next Day Planning Queue</span>
      </header>
      <section className="panel">
        <OrderTable orders={allOrders} initialSubsection="tomorrow" />
      </section>
    </AppShell>
  );
}
