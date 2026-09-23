"use client";

import { useEffect, useState } from "react";
import type { Consignment } from "@/lib/domain";

function displayReference(order: Consignment) {
  const parts: string[] = [];
  if (order.ro) parts.push(`RO ${order.ro}`);
  if (order.po) parts.push(`PO ${order.po}`);
  if (order.so) parts.push(`SO ${order.so}`);
  return parts.length > 0 ? parts.join(" · ") : "No identifier";
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

function getMilestoneIndex(status: string | null | undefined, queue: string): number {
  if (!status) return queue === "upcoming" ? 0 : 1;
  const s = status.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (s.includes("delivered")) return 4;
  if (s.includes("destination") || s.includes("reached")) return 3;
  if (s.includes("outfordelivery") || s === "ofd") return 2;
  if (s.includes("transit")) return 1;
  if (s.includes("rto") || s.includes("undelivered")) return 4;
  return 1;
}

export function ShipmentDrawer({
  order,
  onClose,
}: {
  order: Consignment | null;
  onClose: () => void;
}) {
  const [showRawData, setShowRawData] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (order) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [order, onClose]);

  if (!order) return null;

  const badgeClass = getCourierBadgeClass(order.courierStatus);
  const milestoneIdx = getMilestoneIndex(order.courierStatus, order.queue);
  const isRto = badgeClass === "rto";

  function copyText(text: string, key: string) {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const milestones = [
    { label: "Staged / Upcoming", step: 0 },
    { label: "In-Transit", step: 1 },
    { label: "Out for Delivery", step: 2 },
    { label: "Reached Hub", step: 3 },
    { label: isRto ? "RTO / Issue" : "Delivered", step: 4 },
  ];

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="drawer-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="ro-badge" style={{ fontSize: 16 }}>
                {displayReference(order)}
              </span>
              <button
                type="button"
                className="copy-btn"
                title="Copy reference identifier"
                onClick={() =>
                  copyText(
                    order.ro || order.po || order.so || displayReference(order),
                    "ref",
                  )
                }
              >
                📋
              </button>
              {copiedKey === "ref" && (
                <span className="copy-tooltip">Copied!</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span className="source-chip">{order.sourceName}</span>
              <span style={{ color: "var(--muted)", fontSize: 11 }}>
                Tab: {order.sourceTab} (Row {order.sourceRow})
              </span>
            </div>
          </div>
          <button
            type="button"
            className="button"
            style={{ padding: "4px 8px", border: "none", fontSize: 16 }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="drawer-body">
          {/* Milestone Stepper */}
          <div className="detail-box">
            <div className="detail-label">Shipment Lifecycle Milestone</div>
            <div className="milestone-stepper">
              {milestones.map((m) => {
                const isCompleted = milestoneIdx > m.step;
                const isActive = milestoneIdx === m.step;
                return (
                  <div
                    key={m.label}
                    className={`milestone-step ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""}`}
                  >
                    <div className="milestone-circle">
                      {isCompleted ? "✓" : m.step + 1}
                    </div>
                    <span>{m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current Status Badge Callout */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderRadius: 8,
              background: "var(--canvas)",
              border: "1px solid var(--line)",
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase" }}>
                Live Courier Status
              </div>
              <div style={{ marginTop: 4 }}>
                <span className={`courier-badge ${badgeClass}`} style={{ fontSize: 13, padding: "4px 12px" }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "currentColor",
                      display: "inline-block",
                    }}
                  />
                  {order.courierStatus || "Pending"}
                </span>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: "var(--muted)" }}>
              Updated in sheet
              <div style={{ fontWeight: 600, color: "var(--ink)", marginTop: 2 }}>
                {order.orderDate || "No date recorded"}
              </div>
            </div>
          </div>

          {/* Key Operations Grid */}
          <div className="detail-grid">
            <div className="detail-box">
              <div className="detail-label">Destination Warehouse</div>
              <div className="detail-value">
                {order.warehouse ? `📍 ${order.warehouse}` : "—"}
              </div>
            </div>

            <div className="detail-box">
              <div className="detail-label">Appointment ID</div>
              <div className="detail-value">
                {order.appointmentId ? (
                  <span className="appt-badge">{order.appointmentId}</span>
                ) : (
                  "—"
                )}
              </div>
            </div>

            <div className="detail-box">
              <div className="detail-label">Courier Partner</div>
              <div className="detail-value">{order.courierPartner || "—"}</div>
            </div>

            <div className="detail-box">
              <div className="detail-label">Tracking Number</div>
              <div className="detail-value" style={{ display: "flex", alignItems: "center" }}>
                {order.trackingId ? (
                  order.trackingLink ? (
                    <a
                      className="tracking-pill"
                      href={order.trackingLink}
                      rel="noreferrer"
                      target="_blank"
                      title="Open courier portal"
                    >
                      {order.trackingId} ↗
                    </a>
                  ) : (
                    <span className="tracking-pill">{order.trackingId}</span>
                  )
                ) : (
                  "—"
                )}
                {order.trackingId && (
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => copyText(order.trackingId!, "track")}
                    title="Copy tracking ID"
                  >
                    📋
                  </button>
                )}
                {copiedKey === "track" && <span className="copy-tooltip">Copied!</span>}
              </div>
            </div>

            <div className="detail-box">
              <div className="detail-label">Box Count</div>
              <div className="detail-value">
                {order.totalBoxes ? `${order.totalBoxes} Box${order.totalBoxes === "1" ? "" : "es"}` : "—"}
              </div>
            </div>

            <div className="detail-box">
              <div className="detail-label">Dispatch / Pickup Date</div>
              <div className="detail-value">{order.orderDate || "—"}</div>
            </div>

            <div className="detail-box">
              <div className="detail-label">ASN Number</div>
              <div className="detail-value">{order.asn || "—"}</div>
            </div>

            <div className="detail-box">
              <div className="detail-label">PUC Code</div>
              <div className="detail-value">{order.puc || "—"}</div>
            </div>
          </div>

          {/* Box Dimensions Breakdown */}
          {order.dimensions && (
            <div className="detail-box">
              <div className="detail-label">Box Details &amp; Dimensions</div>
              <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 4, lineHeight: 1.45 }}>
                {order.dimensions}
              </div>
            </div>
          )}

          {/* Comments / Notes */}
          {order.notes && (
            <div className="detail-box">
              <div className="detail-label">Comments / Sheet Notes</div>
              <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 4, fontStyle: "italic" }}>
                &ldquo;{order.notes}&rdquo;
              </div>
            </div>
          )}

          {/* Raw Google Sheet Inspector Accordion */}
          <div className="detail-box" style={{ padding: 0, overflow: "hidden" }}>
            <button
              type="button"
              style={{
                width: "100%",
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "transparent",
                border: "none",
                fontWeight: 600,
                fontSize: 12,
                color: "var(--ink-secondary)",
                textAlign: "left",
              }}
              onClick={() => setShowRawData(!showRawData)}
            >
              <span>🔍 Raw Google Sheet Record ({Object.keys(order.rawData || {}).length} columns)</span>
              <span>{showRawData ? "▲ Hide" : "▼ Expand"}</span>
            </button>
            {showRawData && (
              <div
                style={{
                  maxHeight: 280,
                  overflowY: "auto",
                  padding: "10px 14px",
                  borderTop: "1px solid var(--line)",
                  background: "var(--surface)",
                  fontSize: 11.5,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {Object.entries(order.rawData || {}).map(([col, val]) => (
                      <tr key={col} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td
                          style={{
                            padding: "4px 8px 4px 0",
                            color: "var(--muted)",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {col}
                        </td>
                        <td style={{ padding: "4px 0", color: "var(--ink)" }}>
                          {String(val || "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

