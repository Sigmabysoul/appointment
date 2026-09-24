import { AppShell } from "@/components/app-shell";
import { OrderTable } from "@/components/order-table";
import { listConsignments } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function UpcomingPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const orders = await listConsignments({ queue: "upcoming", status: "active", query: q });
  return (
    <AppShell currentPath="/upcoming">
      <header className="page-header">
        <div>
          <h1>Upcoming</h1>
          <p className="eyebrow">All mapped upcoming orders from every active source.</p>
        </div>
      </header>
      <section className="panel">
        <div className="panel-header">
          <h2>{orders.length} order{orders.length === 1 ? "" : "s"}</h2>
          <form className="toolbar">
            <input className="input search" defaultValue={q} name="q" placeholder="Search RO, PO, SO, tracking, source" />
            <button className="button" type="submit">Search</button>
          </form>
        </div>
        <OrderTable orders={orders} />
      </section>
    </AppShell>
  );
}
