import { AppShell } from "@/components/app-shell";
import { SourceManager } from "@/components/source-manager";
import { getSourceOrderCounts, listSources } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source: sourceId } = await searchParams;
  const [sources, orderCounts] = await Promise.all([
    listSources(),
    getSourceOrderCounts(),
  ]);

  return (
    <AppShell currentPath="/settings">
      <header className="page-header">
        <div>
          <h1>Sheet Sources &amp; Configuration</h1>
          <p className="eyebrow">
            Configure Google Sheet sources, tab names, and column mappings for multi-carrier logistics tracking.
          </p>
        </div>
      </header>

      <SourceManager
        initialSources={sources}
        initialSelectedSourceId={sourceId ?? null}
        orderCounts={orderCounts}
      />
    </AppShell>
  );
}
