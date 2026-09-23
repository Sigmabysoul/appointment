"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Source } from "@/lib/domain";
import { SourceSettings } from "./source-settings";

export function SourceManager({
  initialSources,
  initialSelectedSourceId,
  orderCounts: initialOrderCounts = {},
}: {
  initialSources: Source[];
  initialSelectedSourceId: string | null;
  orderCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(initialSelectedSourceId);
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>(initialOrderCounts);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selectedSource = sources.find((s) => s.id === selectedSourceId) || null;

  function getVendorClass(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes("blinkit")) return "blinkit";
    if (lower.includes("flipkart")) return "flipkart";
    if (lower.includes("swiggy")) return "swiggy";
    return "";
  }

  function handleSelectSource(id: string) {
    setSelectedSourceId(id);
    setConfirmDeleteId(null);
    setFeedback(null);
    // Smooth scroll to editor if on mobile
    if (typeof window !== "undefined" && window.innerWidth < 980) {
      document.getElementById("source-editor-panel")?.scrollIntoView({ behavior: "smooth" });
    }
  }

  function handleAddNew() {
    setSelectedSourceId(null);
    setConfirmDeleteId(null);
    setFeedback(null);
  }

  function handleSourceSaved(savedSource: Source) {
    setSources((current) => {
      const index = current.findIndex((s) => s.id === savedSource.id);
      if (index >= 0) {
        const next = [...current];
        next[index] = savedSource;
        return next;
      }
      return [...current, savedSource];
    });
    setSelectedSourceId(savedSource.id);
    setFeedback({ type: "success", text: `"${savedSource.displayName}" saved successfully.` });
    setTimeout(() => setFeedback(null), 4000);
    router.refresh();
  }

  function handleSourceDeleted(deletedId: string) {
    setSources((current) => current.filter((s) => s.id !== deletedId));
    if (selectedSourceId === deletedId) {
      setSelectedSourceId(null);
    }
    setConfirmDeleteId(null);
    setFeedback({ type: "success", text: "Source removed successfully." });
    setTimeout(() => setFeedback(null), 4000);
    router.refresh();
  }

  async function executeDelete(sourceId: string) {
    setIsDeleting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/sources/${sourceId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      setIsDeleting(false);
      if (!res.ok) {
        setFeedback({ type: "error", text: data.error || "Failed to remove source." });
        return;
      }
      handleSourceDeleted(sourceId);
    } catch {
      setIsDeleting(false);
      setFeedback({ type: "error", text: "Network error while removing source." });
    }
  }

  async function handleSyncSource(sourceId: string, name: string) {
    setSyncingId(sourceId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/sources/${sourceId}/sync`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setSyncingId(null);
      if (!res.ok) {
        setFeedback({ type: "error", text: data.error || `Failed to sync ${name}.` });
        return;
      }
      setFeedback({
        type: "success",
        text: `Sync complete for ${name}: ${data.imported?.upcoming ?? 0} upcoming, ${data.imported?.inTransit ?? 0} in-transit loaded.`,
      });
      setTimeout(() => setFeedback(null), 5000);

      // Update source timestamp and counts
      setSources((current) =>
        current.map((s) =>
          s.id === sourceId ? { ...s, lastSyncedAt: new Date().toISOString(), lastSyncError: null } : s,
        ),
      );
      setOrderCounts((current) => ({
        ...current,
        [sourceId]: (data.imported?.upcoming ?? 0) + (data.imported?.inTransit ?? 0),
      }));
      router.refresh();
    } catch {
      setSyncingId(null);
      setFeedback({ type: "error", text: `Network error while syncing ${name}.` });
    }
  }

  return (
    <div className="settings-grid">
      {/* Left Column: Redesigned Source Directory */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Configured Sources</h2>
            <p className="eyebrow">
              {sources.length} Google Sheet source{sources.length === 1 ? "" : "s"} monitored
            </p>
          </div>
          <button
            type="button"
            className={`button ${selectedSourceId === null ? "primary" : "button-secondary"}`}
            onClick={handleAddNew}
            title="Add a new Google Sheet to track"
          >
            ➕ Add Source
          </button>
        </div>

        <div className="panel-body">
          {feedback && (
            <div
              className={`notice ${feedback.type === "error" ? "error" : ""}`}
              style={{
                marginBottom: 14,
                borderColor: feedback.type === "error" ? "#ef4444" : "#10b981",
                background: feedback.type === "error" ? "#fef2f2" : "#f0fdf4",
                color: feedback.type === "error" ? "#dc2626" : "#15803d",
              }}
            >
              {feedback.text}
            </div>
          )}

          {sources.length === 0 ? (
            <div className="empty">
              No Google Sheets have been added yet. Click <strong>+ Add Source</strong> to get started.
            </div>
          ) : (
            <div className="source-card-list">
              {sources.map((source) => {
                const vendorClass = getVendorClass(source.displayName);
                const isSelected = selectedSourceId === source.id;
                const isConfirming = confirmDeleteId === source.id;
                const count = orderCounts[source.id] ?? 0;
                const isSyncing = syncingId === source.id;

                return (
                  <div
                    key={source.id}
                    className={`source-card ${isSelected ? "selected" : ""}`}
                  >
                    {/* Header */}
                    <div className="source-card-header">
                      <div className="source-card-title-group">
                        <span className={`vendor-dot ${vendorClass}`} />
                        <span className="source-card-title">{source.displayName}</span>
                        {source.spreadsheetUrl && (
                          <a
                            href={source.spreadsheetUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="tracking-pill"
                            style={{ fontSize: 10.5, padding: "1px 5px" }}
                            title="Open Google Sheet in new tab"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Sheet ↗
                          </a>
                        )}
                      </div>
                      <div className="source-card-badge-group">
                        <span
                          className={`courier-badge ${source.isActive ? "delivered" : "rto"}`}
                          style={{ fontSize: 11, padding: "2px 7px" }}
                        >
                          {source.isActive ? "Active" : "Paused"}
                        </span>
                        <span className="wh-chip" style={{ fontSize: 11, padding: "2px 6px" }}>
                          📦 {count} order{count === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="source-card-body">
                      <div className="source-card-tabs-row">
                        <span className="tab-pill">
                          📋 Upcoming: <strong>{source.upcomingTab}</strong>
                        </span>
                        <span className="tab-pill">
                          🚚 In-Transit: <strong>{source.inTransitTab}</strong>
                        </span>
                      </div>

                      <div className="source-card-meta">
                        <span>
                          {source.lastSyncedAt
                            ? `🟢 Synced: ${new Date(source.lastSyncedAt).toLocaleTimeString()}`
                            : "⚪ Never synced"}
                        </span>
                        {source.lastSyncError ? (
                          <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                            ⚠️ {source.lastSyncError}
                          </span>
                        ) : (
                          <span style={{ color: "var(--success)", fontWeight: 500 }}>
                            ✓ Ready
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions / Confirmation */}
                    {isConfirming ? (
                      <div className="delete-confirm-box">
                        <span>
                          Delete <strong>{source.displayName}</strong> and its {count} order
                          {count === 1 ? "" : "s"}?
                        </span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            className="button button-danger"
                            style={{ fontSize: 11, padding: "3px 8px" }}
                            disabled={isDeleting}
                            onClick={() => executeDelete(source.id)}
                          >
                            {isDeleting ? "Deleting..." : "Yes, Remove"}
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            style={{ fontSize: 11, padding: "3px 8px" }}
                            disabled={isDeleting}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="source-card-actions">
                        <button
                          type="button"
                          className="button button-secondary"
                          style={{ fontSize: 11.5, padding: "4px 8px", gap: 4 }}
                          disabled={isSyncing}
                          onClick={() => handleSyncSource(source.id, source.displayName)}
                          title="Sync this sheet now"
                        >
                          <span className={isSyncing ? "spinning" : ""}>🔄</span>
                          {isSyncing ? "Syncing..." : "Sync"}
                        </button>
                        <button
                          type="button"
                          className={`button ${isSelected ? "primary" : "button-secondary"}`}
                          style={{ fontSize: 11.5, padding: "4px 10px", gap: 4 }}
                          onClick={() => handleSelectSource(source.id)}
                          title="Edit this source configuration"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          className="button button-danger-ghost"
                          style={{ fontSize: 11.5, padding: "4px 8px", gap: 4 }}
                          onClick={() => setConfirmDeleteId(source.id)}
                          title="Remove this source"
                        >
                          🗑️ Remove
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Right Column: Source Configuration & Mapping Editor */}
      <div id="source-editor-panel">
        <SourceSettings
          key={selectedSourceId || "new-source"}
          initialSource={selectedSource}
          onSaved={handleSourceSaved}
          onDeleted={handleSourceDeleted}
          onCancel={handleAddNew}
        />
      </div>
    </div>
  );
}

