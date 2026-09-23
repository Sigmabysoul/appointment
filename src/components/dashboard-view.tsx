"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { OrderTable, matchesSubsection } from "@/components/order-table";
import type { Consignment, CourierSubsection, Source } from "@/lib/domain";

export function DashboardView({
  initialOrders,
  sources,
}: {
  initialOrders: Consignment[];
  initialStats?: {
    total: number;
    today: number;
    tomorrow: number;
    inTransit: number;
    outForDelivery: number;
    reachedDestination: number;
    delivered: number;
    rto: number;
  };
  sources: Source[];
}) {
  const [orders, setOrders] = useState<Consignment[]>(initialOrders);
  const [activeSubsection, setActiveSubsection] = useState<CourierSubsection>("all");
  const activeSources = sources.filter((s) => s.isActive).length;

  // Reactively calculate live KPI metrics whenever orders change (via polling or instant webhook)
  const stats = useMemo(() => {
    let today = 0;
    let tomorrow = 0;
    let inTransit = 0;
    let outForDelivery = 0;
    let reachedDestination = 0;
    let delivered = 0;
    let rto = 0;

    for (const o of orders) {
      if (matchesSubsection(o, "today")) today++;
      if (matchesSubsection(o, "tomorrow")) tomorrow++;
      if (matchesSubsection(o, "delivered")) delivered++;
      else if (matchesSubsection(o, "rto")) rto++;
      else if (matchesSubsection(o, "reached_destination")) reachedDestination++;
      else if (matchesSubsection(o, "out_for_delivery")) outForDelivery++;
      else if (matchesSubsection(o, "in_transit")) inTransit++;
    }

    return {
      total: orders.length,
      today,
      tomorrow,
      inTransit,
      outForDelivery,
      reachedDestination,
      delivered,
      rto,
    };
  }, [orders]);

  const deliveryRate = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0;
  const transitRate = stats.total > 0 ? Math.round(((stats.inTransit + stats.outForDelivery) / stats.total) * 100) : 0;
  const hubRate = stats.total > 0 ? Math.round((stats.reachedDestination / stats.total) * 100) : 0;

  return (
    <>
      {/* Streamlined Executive Header with Minimal Summary Strip */}
      <header className="page-header" style={{ marginBottom: 4 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1>Logistics Dispatch Center</h1>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                color: "#10b981",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              <span className="live-dot" />
              Live Sync
            </span>
          </div>
          <p className="eyebrow">
            Multi-carrier dispatch tracking across Blinkit, Flipkart Minute, and Swiggy
          </p>
        </div>

        {/* Compact, Zero-Clutter Header Summary Strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="quick-summary-strip">
            <span className="summary-stat-pill">
              <strong>{stats.total}</strong> Total
            </span>
            <span className="summary-stat-pill today">
              <strong>{stats.today}</strong> Today
            </span>
            <span className="summary-stat-pill transit">
              <strong>{stats.inTransit + stats.outForDelivery}</strong> In-Transit
            </span>
            <span className="summary-stat-pill destination">
              <strong>{stats.reachedDestination}</strong> At Hub
            </span>
            <span className="summary-stat-pill delivered">
              <strong>{stats.delivered}</strong> Delivered
            </span>
            {stats.rto > 0 && (
              <span className="summary-stat-pill rto">
                <strong>{stats.rto}</strong> RTO
              </span>
            )}
          </div>
          <Link
            className="button button-secondary"
            href="/settings"
            style={{ fontSize: 12, padding: "5px 10px" }}
          >
            ⚙️ Sources ({activeSources})
          </Link>
        </div>
      </header>

      {/* Main Unified Dispatch Station */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Dispatch Operations Queue</h2>
            <p className="eyebrow">
              {orders.length} consignments actively monitored across {activeSources} connected sheet source
              {activeSources === 1 ? "" : "s"}.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {activeSubsection !== "all" && (
              <button
                type="button"
                className="button button-secondary"
                style={{ fontSize: 12 }}
                onClick={() => setActiveSubsection("all")}
              >
                Clear Filter (Show All {orders.length})
              </button>
            )}
          </div>
        </div>

        <OrderTable
          orders={orders}
          activeSubsection={activeSubsection}
          onSubsectionChange={setActiveSubsection}
          onOrdersChange={setOrders}
        />
      </section>

      {/* Connected Sheet Sources & Health */}
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header" style={{ padding: "12px 18px" }}>
          <div>
            <h2 style={{ fontSize: 14 }}>Connected Data Sources</h2>
            <p className="eyebrow" style={{ fontSize: 11.5 }}>
              {activeSources} of {sources.length} sources actively synchronized.
            </p>
          </div>
          <Link className="button button-secondary" href="/settings" style={{ fontSize: 11.5, padding: "4px 10px" }}>
            ⚙️ Manage Sources
          </Link>
        </div>
        <div className="panel-body" style={{ padding: "12px 18px" }}>
          {sources.length === 0 ? (
            <div className="notice">
              No sources configured yet. Add your Google Sheets link to begin tracking orders.
            </div>
          ) : (
            <div className="source-list">
              {sources.map((source) => {
                const lowerName = source.displayName.toLowerCase();
                const vendorDotClass = lowerName.includes("blinkit")
                  ? "blinkit"
                  : lowerName.includes("flipkart")
                    ? "flipkart"
                    : lowerName.includes("swiggy")
                      ? "swiggy"
                      : "";
                return (
                  <div className="source-row" key={source.id} style={{ padding: "10px 0" }}>
                    <div>
                      <div className="source-row-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className={`vendor-dot ${vendorDotClass}`} />
                        <span>{source.displayName}</span>
                      </div>
                      <div className="source-row-detail">
                        Upcoming: {source.upcomingTab} · In Transit: {source.inTransitTab}
                      </div>
                    </div>
                    <div>
                      {source.isActive ? (
                        <span className="courier-badge delivered">Active</span>
                      ) : (
                        <span className="courier-badge rto">Paused</span>
                      )}
                    </div>
                    <div className="source-row-detail">
                      {source.lastSyncedAt
                        ? `Synced ${new Date(source.lastSyncedAt).toLocaleTimeString()}`
                        : "Not synced"}
                    </div>
                    <div className="source-row-detail">
                      {source.lastSyncError ? (
                        <span style={{ color: "var(--danger)" }}>Needs attention</span>
                      ) : (
                        <span style={{ color: "var(--success)" }}>Sync healthy</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <Link
                        className="button button-secondary"
                        href={`/settings?source=${source.id}`}
                        style={{ fontSize: 11.5, padding: "4px 8px" }}
                        title="Edit source settings"
                      >
                        ✏️ Edit
                      </Link>
                      <Link
                        className="button button-danger-ghost"
                        href={`/settings?source=${source.id}`}
                        style={{ fontSize: 11.5, padding: "4px 8px" }}
                        title="Remove source"
                      >
                        🗑️ Remove
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
