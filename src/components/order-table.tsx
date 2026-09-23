"use client";

import { useEffect, useMemo, useState } from "react";
import type { Consignment, CourierSubsection } from "@/lib/domain";
import {
  formatFriendlyDate,
  getLocalTodayISO,
  getLocalTomorrowISO,
  isDateToday,
  isDateTomorrow,
  isWithinDateRange,
  parseSheetDate,
} from "@/lib/date-utils";
import { ShipmentDrawer } from "@/components/shipment-drawer";
import { KanbanBoard } from "@/components/kanban-board";

function displayReference(order: Consignment) {
  const parts: string[] = [];
  if (order.ro) parts.push(`RO ${order.ro}`);
  if (order.po) parts.push(`PO ${order.po}`);
  if (order.so) parts.push(`SO ${order.so}`);
  return parts.length > 0 ? parts.join(" · ") : "No identifier";
}

function getVendorClass(sourceName: string | null | undefined): string {
  if (!sourceName) return "default";
  const s = sourceName.toLowerCase();
  if (s.includes("blinkit")) return "blinkit";
  if (s.includes("flipkart")) return "flipkart";
  if (s.includes("swiggy")) return "swiggy";
  return "default";
}

function getCourierBadgeClass(status: string | null | undefined): string {
  if (!status) return "pending";
  const s = status.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (s.includes("delivered") && !s.includes("undelivered")) return "delivered";
  if (s.includes("destination") || s.includes("reached")) return "destination";
  if (s.includes("outfordelivery") || s === "ofd") return "ofd";
  if (
    s.includes("rto") ||
    s.includes("undelivered") ||
    s.includes("missed") ||
    s.includes("rejected")
  ) {
    return "rto";
  }
  if (s.includes("transit") || s.includes("pending")) return "transit";
  return "unknown";
}

export function matchesSubsection(order: Consignment, sub: CourierSubsection): boolean {
  if (sub === "all") return true;
  if (sub === "today") return isDateToday(order.orderDate);
  if (sub === "tomorrow") return isDateTomorrow(order.orderDate);

  const status = (order.courierStatus ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (sub === "delivered") {
    return status.includes("delivered") && !status.includes("undelivered");
  }
  if (sub === "reached_destination") {
    return status.includes("destination") || status.includes("reached");
  }
  if (sub === "out_for_delivery") {
    return status.includes("outfordelivery") || status === "ofd";
  }
  if (sub === "rto") {
    return (
      status.includes("rto") ||
      status.includes("undelivered") ||
      status.includes("missed") ||
      status.includes("rejected")
    );
  }
  if (sub === "in_transit") {
    return (
      status.includes("transit") ||
      status.includes("pending") ||
      (!status && order.queue === "in_transit")
    );
  }
  return true;
}

const SUBSECTIONS: Array<{ id: CourierSubsection; label: string; icon: string; styleClass: string }> = [
  { id: "all", label: "All Orders", icon: "📦", styleClass: "all" },
  { id: "today", label: "Today", icon: "📅", styleClass: "today" },
  { id: "tomorrow", label: "Tomorrow", icon: "⏳", styleClass: "tomorrow" },
  { id: "in_transit", label: "In-Transit", icon: "🚚", styleClass: "transit" },
  { id: "out_for_delivery", label: "Out for Delivery", icon: "🛵", styleClass: "transit" },
  { id: "reached_destination", label: "At Hub", icon: "🏢", styleClass: "destination" },
  { id: "delivered", label: "Delivered", icon: "✅", styleClass: "delivered" },
  { id: "rto", label: "RTO / Issues", icon: "⚠️", styleClass: "rto" },
];

type SortField = "date" | "ref" | "warehouse" | "courier" | "status";
type SortOrder = "asc" | "desc";

export function OrderTable({
  orders: initialOrders,
  initialSubsection = "all",
  activeSubsection: externalSubsection,
  onSubsectionChange,
  onOrdersChange,
}: {
  orders: Consignment[];
  initialSubsection?: CourierSubsection;
  activeSubsection?: CourierSubsection;
  onSubsectionChange?: (sub: CourierSubsection) => void;
  onOrdersChange?: (orders: Consignment[]) => void;
}) {
  // Live dataset state for instant client-side updates
  const [orders, setOrders] = useState<Consignment[]>(initialOrders);
  useEffect(() => {
    setOrders(initialOrders);
    onOrdersChange?.(initialOrders);
  }, [initialOrders, onOrdersChange]);

  // Subsection State (internal or externally controlled)
  const [internalSubsection, setInternalSubsection] = useState<CourierSubsection>(initialSubsection);
  const activeSubsection = externalSubsection ?? internalSubsection;

  function handleSetSubsection(sub: CourierSubsection) {
    if (onSubsectionChange) {
      onSubsectionChange(sub);
    } else {
      setInternalSubsection(sub);
    }
  }

  // Workstation View & Layout Mode
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [isCompact, setIsCompact] = useState<boolean>(false);

  // Selected Order for Slide-over Drawer
  const [selectedOrder, setSelectedOrder] = useState<Consignment | null>(null);

  // Sorting State
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  }

  // Real-Time Sync States
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());
  const [syncIntervalSec, setSyncIntervalSec] = useState<number>(15);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter States
  const [textFilter, setTextFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<"all" | "today" | "tomorrow" | "custom">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [courierFilter, setCourierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Quick Date Preset Handler
  function handleDatePresetChange(preset: "all" | "today" | "tomorrow" | "custom") {
    setDatePreset(preset);
    if (preset === "all") {
      setFromDate("");
      setToDate("");
    } else if (preset === "today") {
      const today = getLocalTodayISO();
      setFromDate(today);
      setToDate(today);
    } else if (preset === "tomorrow") {
      const tomorrow = getLocalTomorrowISO();
      setFromDate(tomorrow);
      setToDate(tomorrow);
    } else if (preset === "custom") {
      setShowFilters(true);
    }
  }

  // Reusable Live Fetcher
  async function refreshData(forceSync = false) {
    setIsSyncing(true);
    try {
      const url = forceSync ? "/api/consignments?sync=true" : "/api/consignments";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.consignments)) {
          setOrders(data.consignments);
          setLastSyncedAt(new Date());
          onOrdersChange?.(data.consignments);
        }
      }
    } catch {
      // Background fetch error - retain current orders
    } finally {
      setIsSyncing(false);
    }
  }

  // Automatic Background Polling & Visibility Revalidation
  useEffect(() => {
    if (syncIntervalSec <= 0) return;

    const interval = setInterval(() => {
      refreshData(false);
    }, syncIntervalSec * 1000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshData(false);
      }
    };
    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
    };
  }, [syncIntervalSec]);

  // Formatted Relative Last-Synced Time
  const [relativeTime, setRelativeTime] = useState("just now");
  useEffect(() => {
    const timer = setInterval(() => {
      const diffSec = Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000);
      if (diffSec < 5) setRelativeTime("just now");
      else if (diffSec < 60) setRelativeTime(`${diffSec}s ago`);
      else setRelativeTime(`${Math.floor(diffSec / 60)}m ago`);
    }, 3000);
    return () => clearInterval(timer);
  }, [lastSyncedAt]);

  // Copy to clipboard helper
  function copyText(e: React.MouseEvent, text: string, id: string) {
    e.stopPropagation();
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((curr) => (curr === id ? null : curr));
    }, 2000);
  }

  // Export filtered rows to CSV
  function exportCSV() {
    if (sortedAndFilteredOrders.length === 0) return;
    const headers = [
      "RO Number",
      "PO Number",
      "SO Number",
      "Source Sheet",
      "Warehouse",
      "Pickup Date",
      "Courier Partner",
      "Tracking ID",
      "Appointment ID",
      "Total Boxes",
      "Courier Status",
    ];

    const csvRows = sortedAndFilteredOrders.map((o) => [
      `"${o.ro || ""}"`,
      `"${o.po || ""}"`,
      `"${o.so || ""}"`,
      `"${o.sourceName || ""}"`,
      `"${o.warehouse || ""}"`,
      `"${o.orderDate || ""}"`,
      `"${o.courierPartner || ""}"`,
      `"${o.trackingId || ""}"`,
      `"${o.appointmentId || ""}"`,
      `"${o.totalBoxes || ""}"`,
      `"${o.courierStatus || ""}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...csvRows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `dispatch_manifest_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Unique Sources with live counts
  const sourceOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      const name = o.sourceName || "Unknown";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [orders]);

  // Live count per subsection
  const subsectionCounts = useMemo(() => {
    return {
      all: orders.length,
      today: orders.filter((o) => isDateToday(o.orderDate)).length,
      tomorrow: orders.filter((o) => isDateTomorrow(o.orderDate)).length,
      in_transit: orders.filter((o) => matchesSubsection(o, "in_transit")).length,
      out_for_delivery: orders.filter((o) => matchesSubsection(o, "out_for_delivery")).length,
      reached_destination: orders.filter((o) => matchesSubsection(o, "reached_destination")).length,
      delivered: orders.filter((o) => matchesSubsection(o, "delivered")).length,
      rto: orders.filter((o) => matchesSubsection(o, "rto")).length,
    };
  }, [orders]);

  // Distinct options for dropdown filters
  const uniqueWarehouses = useMemo(() => {
    return [...new Set(orders.map((o) => o.warehouse?.trim()).filter((w): w is string => Boolean(w)))].sort();
  }, [orders]);

  const uniqueCouriers = useMemo(() => {
    return [...new Set(orders.map((o) => o.courierPartner?.trim()).filter((c): c is string => Boolean(c)))].sort();
  }, [orders]);

  const uniqueStatuses = useMemo(() => {
    return [
      ...new Set(orders.map((o) => o.courierStatus?.trim()).filter((s): s is string => Boolean(s))),
    ].sort();
  }, [orders]);

  // Quick Date Setters
  function setQuickToday() {
    const today = getLocalTodayISO();
    setFromDate(today);
    setToDate(today);
  }

  function setQuickTomorrow() {
    const tomorrow = getLocalTomorrowISO();
    setFromDate(tomorrow);
    setToDate(tomorrow);
  }

  function clearDateRange() {
    setFromDate("");
    setToDate("");
  }

  // Filter computation
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Dynamic Subsection Check
      if (!matchesSubsection(order, activeSubsection)) {
        return false;
      }

      // 2. Source Filter
      if (sourceFilter !== "all" && order.sourceName !== sourceFilter) {
        return false;
      }

      // 3. Text Search (RO, PO, SO, Tracking, Appointment, Notes)
      // 3. Text Search (RO, PO, SO, Tracking, Appointment, Warehouse, Courier)
      if (textFilter.trim()) {
        const query = textFilter.toLowerCase().trim();
        const matchesRef = displayReference(order).toLowerCase().includes(query);
        const matchesTrack = (order.trackingId ?? "").toLowerCase().includes(query);
        const matchesAppt = (order.appointmentId ?? "").toLowerCase().includes(query);
        const matchesWH = (order.warehouse ?? "").toLowerCase().includes(query);
        const matchesCourier = (order.courierPartner ?? "").toLowerCase().includes(query);
        const matchesSource = (order.sourceName ?? "").toLowerCase().includes(query);
        if (!matchesRef && !matchesTrack && !matchesAppt && !matchesWH && !matchesCourier && !matchesSource) {
          return false;
        }
      }

      // 4. Date Range Filter
      if (fromDate || toDate) {
        if (!isWithinDateRange(order.orderDate, fromDate, toDate)) {
          return false;
        }
      }

      // 5. Warehouse Filter
      if (warehouseFilter && order.warehouse !== warehouseFilter) {
        return false;
      }

      // 6. Courier Filter
      if (courierFilter && order.courierPartner !== courierFilter) {
        return false;
      }

      // 7. Courier Status Dropdown Filter
      if (statusFilter && order.courierStatus !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [orders, activeSubsection, sourceFilter, textFilter, fromDate, toDate, warehouseFilter, courierFilter, statusFilter]);

  // Sorting
  const sortedAndFilteredOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      let comparison = 0;
      if (sortField === "date") {
        const dateA = parseSheetDate(a.orderDate) || "";
        const dateB = parseSheetDate(b.orderDate) || "";
        comparison = dateA.localeCompare(dateB);
      } else if (sortField === "ref") {
        const refA = displayReference(a);
        const refB = displayReference(b);
        comparison = refA.localeCompare(refB);
      } else if (sortField === "warehouse") {
        comparison = (a.warehouse || "").localeCompare(b.warehouse || "");
      } else if (sortField === "courier") {
        comparison = (a.courierPartner || "").localeCompare(b.courierPartner || "");
      } else if (sortField === "status") {
        comparison = (a.courierStatus || "").localeCompare(b.courierStatus || "");
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [filteredOrders, sortField, sortOrder]);

  function resetAllFilters() {
    handleSetSubsection("all");
    setSourceFilter("all");
    setTextFilter("");
    setDatePreset("all");
    setFromDate("");
    setToDate("");
    setWarehouseFilter("");
    setCourierFilter("");
    setStatusFilter("");
  }

  const activeAdvancedCount =
    (warehouseFilter ? 1 : 0) +
    (courierFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (datePreset === "custom" && (fromDate || toDate) ? 1 : 0);

  const hasActiveFilters = Boolean(
    textFilter ||
      sourceFilter !== "all" ||
      datePreset !== "all" ||
      fromDate ||
      toDate ||
      warehouseFilter ||
      courierFilter ||
      statusFilter ||
      activeSubsection !== "all",
  );

  return (
    <>
      {/* 1. Integrated Status Pipeline Stage Rail */}
      <div className="pipeline-rail" role="tablist" aria-label="Operations pipeline stages">
        {SUBSECTIONS.map((sub) => {
          const count = subsectionCounts[sub.id];
          const isActive = activeSubsection === sub.id;
          return (
            <button
              key={sub.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`pipeline-chip ${isActive ? `active ${sub.styleClass}` : ""}`}
              onClick={() => handleSetSubsection(sub.id)}
            >
              <span>{sub.icon}</span>
              <span>{sub.label}</span>
              <span className="count-badge">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Unified Operations Command Toolbar */}
      <div className="command-toolbar">
        <div className="toolbar-left">
          {/* Omni Search Box */}
          <div className="search-box-wrap">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search reference, tracking, warehouse..."
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
            />
            {textFilter && (
              <button
                type="button"
                className="clear-btn"
                onClick={() => setTextFilter("")}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Vendor Source Dropdown */}
          <select
            className="filter-pill-select"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            title="Filter by connected source sheet"
          >
            <option value="all">All Vendors ({orders.length})</option>
            {sourceOptions.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.count})
              </option>
            ))}
          </select>

          {/* Quick Date Preset Selector */}
          <select
            className="filter-pill-select"
            value={datePreset}
            onChange={(e) =>
              handleDatePresetChange(e.target.value as "all" | "today" | "tomorrow" | "custom")
            }
            title="Filter by date range"
          >
            <option value="all">Any Date</option>
            <option value="today">📅 Today</option>
            <option value="tomorrow">⏳ Tomorrow</option>
            <option value="custom">Custom Range...</option>
          </select>

          {/* Advanced Filter Shelf Toggle */}
          <button
            type="button"
            className={`filter-shelf-toggle ${showFilters || activeAdvancedCount > 0 ? "active" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Toggle advanced filters for Warehouse, Courier, and Status"
          >
            <span>⚡ Filters</span>
            {activeAdvancedCount > 0 && (
              <span
                style={{
                  fontSize: 10.5,
                  padding: "1px 6px",
                  background: "var(--brand)",
                  color: "#fff",
                  borderRadius: 10,
                  fontWeight: 700,
                }}
              >
                {activeAdvancedCount}
              </span>
            )}
          </button>

          {/* Reset Filters Link if active */}
          {hasActiveFilters && (
            <button
              type="button"
              className="button button-secondary"
              style={{ padding: "3px 8px", fontSize: 11.5, height: 32 }}
              onClick={resetAllFilters}
            >
              Reset
            </button>
          )}
        </div>

        <div className="toolbar-right">
          {/* Density Toggle (for Table View) */}
          {viewMode === "table" && (
            <button
              type="button"
              className={`button button-secondary ${isCompact ? "active" : ""}`}
              style={{ fontSize: 11.5, padding: "3px 8px", height: 32 }}
              onClick={() => setIsCompact(!isCompact)}
              title="Toggle high-density compact rows"
            >
              {isCompact ? "Dense ✓" : "Comfortable"}
            </button>
          )}

          {/* View Mode Switcher */}
          <div className="view-mode-toggle" style={{ height: 32 }}>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
            >
              📊 Grid
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "kanban" ? "active" : ""}`}
              onClick={() => setViewMode("kanban")}
            >
              📋 Kanban
            </button>
          </div>

          {/* Export CSV */}
          <button
            type="button"
            className="button button-secondary"
            style={{ fontSize: 11.5, padding: "3px 9px", height: 32 }}
            onClick={exportCSV}
            title="Export active filtered manifest to CSV"
          >
            📥 CSV
          </button>

          {/* Polling Interval Selector */}
          <select
            id="poll-interval"
            className="select"
            style={{ padding: "3px 8px", fontSize: 11.5, height: 32 }}
            value={syncIntervalSec}
            onChange={(e) => setSyncIntervalSec(Number(e.target.value))}
            title="Auto-refresh polling interval"
          >
            <option value="10">Auto: 10s</option>
            <option value="15">Auto: 15s</option>
            <option value="30">Auto: 30s</option>
            <option value="60">Auto: 1m</option>
            <option value="0">Manual</option>
          </select>

          {/* Live Sync Beacon & Trigger */}
          <button
            type="button"
            className="live-indicator"
            style={{ cursor: "pointer", height: 32, border: "1px solid var(--line)" }}
            onClick={() => refreshData(true)}
            disabled={isSyncing}
            title="Real-time Google Sheets sync active. Click to refresh now."
          >
            <span className={`live-dot ${syncIntervalSec === 0 ? "paused" : ""}`} />
            <span style={{ fontSize: 11 }}>{relativeTime}</span>
            <span className={isSyncing ? "spinning" : ""}>🔄</span>
          </button>
        </div>
      </div>

      {/* 3. Secondary Filter Shelf (Collapsible) */}
      {showFilters && (
        <div className="filter-shelf">
          {/* Custom Date Pickers */}
          {datePreset === "custom" && (
            <div className="filter-shelf-item">
              <label>From:</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <label>To:</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          )}

          {/* Warehouse Dropdown */}
          <div className="filter-shelf-item">
            <label htmlFor="filter-wh">Warehouse:</label>
            <select
              id="filter-wh"
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
            >
              <option value="">All Warehouses</option>
              {uniqueWarehouses.map((wh) => (
                <option key={wh} value={wh}>
                  {wh}
                </option>
              ))}
            </select>
          </div>

          {/* Courier Dropdown */}
          <div className="filter-shelf-item">
            <label htmlFor="filter-courier">Courier:</label>
            <select
              id="filter-courier"
              value={courierFilter}
              onChange={(e) => setCourierFilter(e.target.value)}
            >
              <option value="">All Couriers</option>
              {uniqueCouriers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Courier Status Dropdown */}
          {uniqueStatuses.length > 0 && (
            <div className="filter-shelf-item">
              <label htmlFor="filter-status">Status:</label>
              <select
                id="filter-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                {uniqueStatuses.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)" }}>
            Showing <strong>{sortedAndFilteredOrders.length}</strong> of {orders.length}
          </div>
        </div>
      )}

      {/* 4. Main Workstation Body: Kanban vs Table Grid */}
      {sortedAndFilteredOrders.length === 0 ? (
        <div className="empty">
          No consignments match your selected subsection or filters.{" "}
          {hasActiveFilters ? (
            <button
              type="button"
              className="button button-secondary"
              style={{ marginTop: 8, display: "inline-block" }}
              onClick={resetAllFilters}
            >
              Reset filters
            </button>
          ) : null}
        </div>
      ) : viewMode === "kanban" ? (
        <KanbanBoard
          orders={sortedAndFilteredOrders}
          onSelectOrder={(order) => setSelectedOrder(order)}
        />
      ) : (
        <div className="table-wrap">
          <table className={`data-table ${isCompact ? "compact" : ""}`}>
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort("ref")}>
                  RO / SO / PO Identifier {sortField === "ref" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="sortable" onClick={() => toggleSort("warehouse")}>
                  Warehouse {sortField === "warehouse" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="sortable" onClick={() => toggleSort("date")}>
                  Pickup Date {sortField === "date" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="sortable" onClick={() => toggleSort("courier")}>
                  Courier &amp; Tracking {sortField === "courier" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th>Appointment ID</th>
                <th className="sortable" onClick={() => toggleSort("status")}>
                  Courier Status {sortField === "status" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAndFilteredOrders.map((order) => {
                const badgeClass = getCourierBadgeClass(order.courierStatus);
                const refText = displayReference(order);
                const isRefCopied = copiedId === `ref-${order.id}`;
                const isTrackCopied = copiedId === `track-${order.id}`;
                const { text: dateDisplay, isToday, isTomorrow } = formatFriendlyDate(order.orderDate);
                const vendorClass = getVendorClass(order.sourceName);

                return (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    title="Click to inspect complete shipment details"
                  >
                    {/* Primary Reference (RO / PO / SO) */}
                    <td>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span className="ro-badge">{refText}</span>
                        <button
                          type="button"
                          className="copy-btn"
                          title="Copy identifier"
                          onClick={(e) =>
                            copyText(
                              e,
                              order.ro || order.po || order.so || refText,
                              `ref-${order.id}`,
                            )
                          }
                        >
                          📋
                        </button>
                        {isRefCopied && <span className="copy-tooltip">Copied!</span>}
                      </div>
                      <div
                        className="subreference"
                        style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}
                      >
                        <span className="vendor-pill">
                          <span className={`vendor-dot ${vendorClass}`} />
                          {order.sourceName || "Sheet"}
                        </span>
                        {order.sourceTab && <span style={{ opacity: 0.6 }}>· {order.sourceTab}</span>}
                      </div>
                    </td>

                    {/* Destination Warehouse */}
                    <td>
                      {order.warehouse ? (
                        <span className="wh-chip">📍 {order.warehouse}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    {/* Pickup Date with Today/Tomorrow Badges */}
                    <td>
                      {isToday ? (
                        <span className="date-tag today">{dateDisplay}</span>
                      ) : isTomorrow ? (
                        <span className="date-tag tomorrow">{dateDisplay}</span>
                      ) : (
                        <span style={{ fontWeight: 500, color: "var(--ink)" }}>{dateDisplay}</span>
                      )}
                    </td>

                    {/* Courier & Tracking */}
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                        {order.courierPartner || "—"}
                      </div>
                      {order.trackingId ? (
                        <div style={{ display: "flex", alignItems: "center", marginTop: 3 }}>
                          {order.trackingLink ? (
                            <a
                              className="tracking-pill"
                              href={order.trackingLink}
                              rel="noreferrer"
                              target="_blank"
                              title="Open tracking portal"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {order.trackingId} ↗
                            </a>
                          ) : (
                            <span className="tracking-pill">{order.trackingId}</span>
                          )}
                          <button
                            type="button"
                            className="copy-btn"
                            title="Copy tracking ID"
                            onClick={(e) => copyText(e, order.trackingId!, `track-${order.id}`)}
                          >
                            📋
                          </button>
                          {isTrackCopied && <span className="copy-tooltip">Copied!</span>}
                        </div>
                      ) : null}
                    </td>

                    {/* Appointment ID */}
                    <td>
                      {order.appointmentId ? (
                        <span className="appt-badge">{order.appointmentId}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    {/* Live Courier Status */}
                    <td>
                      <span className={`courier-badge ${badgeClass}`}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "currentColor",
                            display: "inline-block",
                          }}
                        />
                        {order.courierStatus || "Pending"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-Over Inspection Drawer */}
      <ShipmentDrawer
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </>
  );
}
