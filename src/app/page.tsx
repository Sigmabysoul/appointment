import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/dashboard-view";
import { getDashboardStats, listConsignments, listSources } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, sources, allOrders] = await Promise.all([
    getDashboardStats(),
    listSources(),
    listConsignments({ limit: 2000 }),
  ]);

  return (
    <AppShell currentPath="/">
      <DashboardView initialOrders={allOrders} initialStats={stats} sources={sources} />
    </AppShell>
  );
}
