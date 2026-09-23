"use client";

import { useMemo } from "react";
import type { Consignment } from "@/lib/domain";

function displayReference(order: Consignment) {
  const parts: string[] = [];
  if (order.ro) parts.push(`RO ${order.ro}`);
  if (order.po) parts.push(`PO ${order.po}`);
  if (order.so) parts.push(`SO ${order.so}`);
  return parts.length > 0 ? parts.join(" · ") : "No identifier";
}

function getVendorDotClass(sourceName: string | undefined): string {
  const s = (sourceName ?? "").toLowerCase();
  if (s.includes("blinkit")) return "blinkit";
  if (s.includes("flipkart")) return "flipkart";
  if (s.includes("swiggy")) return "swiggy";
  return "blinkit";
}

type KanbanColumnDef = {
  id: string;
  title: string;
  badgeClass: string;
  filter: (order: Consignment) => boolean;
};

const KANBAN_COLUMNS: KanbanColumnDef[] = [
  {
    id: "upcoming",
    title: "Staged / Upcoming",
    badgeClass: "pending",
    filter: (o) => o.queue === "upcoming" || !o.courierStatus,
  },
  {
    id: "in_transit",
    title: "In-Transit",
    badgeClass: "transit",
    filter: (o) => {
      const s = (o.courierStatus ?? "").toLowerCase();
      return (s.includes("transit") || s.includes("pending")) && !s.includes("reached");
    },
  },
  {
    id: "out_for_delivery",
    title: "Out for Delivery",
    badgeClass: "ofd",
    filter: (o) => {
      const s = (o.courierStatus ?? "").toLowerCase();
      return s.includes("out for delivery") || s.includes("outfordelivery") || s === "ofd";
    },
  },
  {
    id: "destination",
    title: "Reached Destination",
    badgeClass: "destination",
    filter: (o) => {
      const s = (o.courierStatus ?? "").toLowerCase();
      return s.includes("destination") || s.includes("reached");
    },
  },
  {
    id: "delivered",
    title: "Delivered",
    badgeClass: "delivered",
    filter: (o) => {
      const s = (o.courierStatus ?? "").toLowerCase();
      return s.includes("delivered") && !s.includes("undelivered");
    },
  },
  {
    id: "rto",
    title: "RTO & Exceptions",
    badgeClass: "rto",
    filter: (o) => {
      const s = (o.courierStatus ?? "").toLowerCase();
      return (
        s.includes("rto") ||
        s.includes("undelivered") ||
        s.includes("missed") ||
        s.includes("rejected")
      );
    },
  },
];

export function KanbanBoard({
  orders,
  onSelectOrder,
}: {
  orders: Consignment[];
  onSelectOrder: (order: Consignment) => void;
}) {
  const columnData = useMemo(() => {
    return KANBAN_COLUMNS.map((col) => {
      const colOrders = orders.filter(col.filter);
      return {
        ...col,
        orders: colOrders,
      };
    });
  }, [orders]);

  return (
    <div className="kanban-board">
      {columnData.map((col) => (
        <div key={col.id} className="kanban-column">
          <div className="kanban-column-header">
            <span>{col.title}</span>
            <span className="kanban-column-badge">{col.orders.length}</span>
          </div>
          <div className="kanban-card-list">
            {col.orders.length === 0 ? (
              <div
                style={{
                  padding: "24px 10px",
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: 11.5,
                }}
              >
                No shipments in this stage
              </div>
            ) : (
              col.orders.map((order) => {
                const dotClass = getVendorDotClass(order.sourceName);
                return (
                  <div
                    key={order.id}
                    className="kanban-card"
                    onClick={() => onSelectOrder(order)}
                    title="Click to view complete shipment details"
                  >
                    <div className="kanban-card-top">
                      <span className="kanban-card-title">
                        {displayReference(order)}
                      </span>
                      <span className="source-chip" style={{ fontSize: 10, padding: "1px 5px" }}>
                        <span className={`vendor-dot ${dotClass}`} />
                        {order.sourceName}
                      </span>
                    </div>

                    <div className="kanban-card-body">
                      {order.warehouse && (
                        <div>📍 {order.warehouse}</div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>{order.courierPartner || "Carrier TBD"}</span>
                        {order.trackingId && (
                          <span className="tracking-pill" style={{ fontSize: 10.5, padding: "1px 4px" }}>
                            {order.trackingId}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2, fontSize: 10.5 }}>
                        <span>{order.orderDate || "—"}</span>
                        {order.totalBoxes && (
                          <span style={{ fontWeight: 600, color: "var(--ink)" }}>
                            📦 {order.totalBoxes} Box{order.totalBoxes === "1" ? "" : "es"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

