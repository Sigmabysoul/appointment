import { AppShell } from "@/components/app-shell";
import { OrderTable } from "@/components/order-table";
import { listConsignments } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TodayOrdersPage() {
  const allOrders = await listConsignments({ limit: 2000 });

  return (
    <AppShell currentPath="/today">
      <header className="page-header">
        <div>
          <h1>Today&apos;s Orders</h1>
          <p className="eyebrow">
            All shipments scheduled for pickup or delivery today across all connected sheets.
          </p>
        </div>
        <span className="desktop-hint">Immediate Priority Queue</span>
      </header>
      <section className="panel">
        <OrderTable orders={allOrders} initialSubsection="today" />
      </section>
    </AppShell>
  );
}
