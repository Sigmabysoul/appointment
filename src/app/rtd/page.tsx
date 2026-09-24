import { AppShell } from "@/components/app-shell";
import { OrderTable } from "@/components/order-table";
import { listConsignments } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RtdPage() {
  const orders = await listConsignments({ limit: 2000 });

  return (
    <AppShell currentPath="/rtd">
      <header className="page-header">
        <div>
          <h1>RTO &amp; Undelivered</h1>
          <p className="eyebrow">
            Shipments with return-to-origin, rejection, or undelivered courier status in Google Sheets.
          </p>
        </div>
        <span className="desktop-hint">Exception &amp; RTO Audit</span>
      </header>
      <section className="panel">
        <OrderTable orders={orders} initialSubsection="rto" />
      </section>
    </AppShell>
  );
}
