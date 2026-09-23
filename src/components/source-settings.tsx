"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EMPTY_SOURCE_MAPPING,
  FIELD_LABELS,
  MAPPING_FIELDS,
  type MappingField,
  type Source,
  type SourceMapping,
  type SourceQueue,
} from "@/lib/domain";

type EditableSource = {
  displayName: string;
  spreadsheetUrl: string;
  upcomingTab: string;
  inTransitTab: string;
  isActive: boolean;
  mapping: SourceMapping;
};

type SourcePreview = {
  tabs: string[];
  upcoming: Array<Record<string, string>>;
  inTransit: Array<Record<string, string>>;
};

const blankSource = (): EditableSource => ({
  displayName: "",
  spreadsheetUrl: "",
  upcomingTab: "Upcoming",
  inTransitTab: "In-Transit",
  isActive: true,
  mapping: structuredClone(EMPTY_SOURCE_MAPPING),
});

function editableSource(source: Source | null): EditableSource {
  if (!source) return blankSource();
  return {
    displayName: source.displayName,
    spreadsheetUrl: source.spreadsheetUrl,
    upcomingTab: source.upcomingTab,
    inTransitTab: source.inTransitTab,
    isActive: source.isActive,
    mapping: structuredClone(source.mapping),
  };
}

export function SourceSettings({
  initialSource,
  onSaved,
  onDeleted,
  onCancel,
}: {
  initialSource: Source | null;
  onSaved?: (source: Source) => void;
  onDeleted?: (sourceId: string) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<EditableSource>(() => editableSource(initialSource));
  const [headers, setHeaders] = useState<Partial<Record<SourceQueue, string[]>>>({});
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sourceId = initialSource?.id;
  const isEditing = Boolean(sourceId);
  const headerList = useMemo(() => [...new Set(Object.values(headers).flat())], [headers]);

  async function handleDelete() {
    if (!sourceId) return;
    const confirmed = window.confirm(
      `Are you sure you want to remove "${initialSource?.displayName}"?\n\nAll orders tracked from this sheet will be deleted from Dispatch Desk.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    const response = await fetch(`/api/sources/${sourceId}`, { method: "DELETE" });
    setDeleting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Failed to delete source.");
      return;
    }
    onDeleted?.(sourceId);
    router.replace("/settings");
    router.refresh();
  }

  function update<Value extends keyof EditableSource>(field: Value, value: EditableSource[Value]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateMapping(queue: SourceQueue, field: MappingField, value: string) {
    setForm((current) => ({
      ...current,
      mapping: {
        ...current.mapping,
        [queue]: {
          ...current.mapping[queue],
          [field]: value.trim() ? value : undefined,
        },
      },
    }));
  }

  function removeField(queue: SourceQueue, field: MappingField) {
    setForm((current) => {
      const nextQueueMapping = { ...current.mapping[queue] };
      delete nextQueueMapping[field];
      return {
        ...current,
        mapping: {
          ...current.mapping,
          [queue]: nextQueueMapping,
        },
      };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const response = await fetch(sourceId ? `/api/sources/${sourceId}` : "/api/sources", {
      method: sourceId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(body.error ?? "The source could not be saved.");
      return;
    }
    setMessage(sourceId ? "Source saved successfully." : "Source added. You can now load headers and sync it.");
    onSaved?.(body.source);
    router.replace(`/settings?source=${body.source.id}`);
    router.refresh();
  }

  async function loadHeaders(queue: SourceQueue) {
    if (!sourceId) {
      setError("Save this source first, then load its Google Sheets headers.");
      return;
    }
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/sources/${sourceId}/headers?queue=${queue}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "The headers could not be read.");
      return;
    }
    setHeaders((current) => ({ ...current, [queue]: body.headers }));
    setMessage(
      `${body.headers.length} column headers loaded from ${queue === "upcoming" ? form.upcomingTab : form.inTransitTab}.`,
    );
  }

  async function discover() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/sources/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spreadsheetUrl: form.spreadsheetUrl,
        upcomingTab: form.upcomingTab,
        inTransitTab: form.inTransitTab,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(body.error ?? "The sheet could not be read.");
      return;
    }
    setForm((current) => ({
      ...current,
      displayName: current.displayName || body.displayName,
      upcomingTab: body.upcomingTab,
      inTransitTab: body.inTransitTab,
      mapping: body.mapping,
    }));
    setHeaders(body.headers);
    setPreview({
      tabs: body.tabs,
      upcoming: body.preview.upcoming,
      inTransit: body.preview.in_transit,
    });
    setMessage(
      "Sheet read successfully! All detected columns are pre-filled below. You can easily remove (✕) any fields you don't need.",
    );
  }

  async function sync() {
    if (!sourceId) {
      setError("Save this source before syncing it.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/sources/${sourceId}/sync`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(body.error ?? "The source could not be synced.");
      return;
    }
    setMessage(`Sync complete: ${body.imported.upcoming} Upcoming and ${body.imported.inTransit} In Transit records imported.`);
    router.refresh();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{isEditing ? `Configure ${initialSource?.displayName}` : "Add a sheet source"}</h2>
          <p className="eyebrow">Paste sheet link, review auto-filled columns, and remove any unwanted rows with one click.</p>
        </div>
        {isEditing ? (
          <button type="button" className="button primary" disabled={saving} onClick={sync}>
            Sync source
          </button>
        ) : null}
      </div>

      <div className="panel-body">
        <div className="notice">
          The app only imports the two operational tabs selected below. Workbook tabs like Dashboard, Archive, or
          Database are ignored.
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="source-name">Source name</label>
            <input
              id="source-name"
              className="input"
              value={form.displayName}
              onChange={(e) => update("displayName", e.target.value)}
              placeholder="e.g. Blinkit, Zepto, Flipkart"
            />
          </div>
          <div className="field">
            <label htmlFor="source-enabled">Source state</label>
            <select
              id="source-enabled"
              className="select"
              value={form.isActive ? "active" : "paused"}
              onChange={(e) => update("isActive", e.target.value === "active")}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </div>

          <div className="field full">
            <label htmlFor="sheet-link">Google Sheets link (must be set to "Anyone with link can view")</label>
            <div className="toolbar">
              <input
                id="sheet-link"
                className="input"
                style={{ flex: 1 }}
                value={form.spreadsheetUrl}
                onChange={(e) => update("spreadsheetUrl", e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
              />
              <button type="button" className="button primary" disabled={saving} onClick={discover}>
                {saving ? "Reading…" : "Read sheet & auto-fill"}
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="upcoming-tab">Upcoming tab name</label>
            <input
              id="upcoming-tab"
              className="input"
              value={form.upcomingTab}
              onChange={(e) => update("upcomingTab", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="transit-tab">In-Transit tab name</label>
            <input
              id="transit-tab"
              className="input"
              value={form.inTransitTab}
              onChange={(e) => update("inTransitTab", e.target.value)}
            />
          </div>
        </div>

        {preview ? (
          <>
            <datalist id="available-sheet-tabs">
              {preview.tabs.map((tab) => (
                <option key={tab} value={tab} />
              ))}
            </datalist>
            <div className="notice" style={{ marginTop: 16 }}>
              Detected workbook tabs: <strong>{preview.tabs.join(", ")}</strong>.
            </div>
          </>
        ) : null}

        {/* Interactive Field Checklist / Removal Section */}
        {(["upcoming", "in_transit"] as const).map((queue) => {
          const queueMapping = form.mapping[queue];
          const activeFields = MAPPING_FIELDS.filter((field) => Boolean(queueMapping[field]));
          const omittedFields = MAPPING_FIELDS.filter((field) => !queueMapping[field]);

          return (
            <div className="mapping-section" key={queue}>
              <div className="mapping-heading">
                <div>
                  <h2>{queue === "upcoming" ? "Upcoming Tab Mapping" : "In-Transit Tab Mapping"}</h2>
                  <p className="eyebrow">
                    All mapped columns are imported below. Click <strong>✕ Remove</strong> on any row you don't want.
                  </p>
                </div>
                {isEditing ? (
                  <button type="button" className="button" onClick={() => loadHeaders(queue)}>
                    Refresh available headers
                  </button>
                ) : null}
              </div>

              {/* Active Mapped Items */}
              <div className="mapping-card-grid">
                {activeFields.map((field) => (
                  <div className="mapping-chip-item" key={`${queue}-${field}`}>
                    <div className="field-info">
                      <span className="field-title">{FIELD_LABELS[field]}</span>
                      <span className="field-tag">mapped to:</span>
                      <input
                        className="input"
                        style={{ width: 200, padding: "3px 8px", fontSize: 12 }}
                        list="available-sheet-headers"
                        value={queueMapping[field] ?? ""}
                        onChange={(e) => updateMapping(queue, field, e.target.value)}
                        placeholder="Column name"
                      />
                    </div>
                    <button
                      type="button"
                      className="button danger"
                      style={{ padding: "3px 8px", fontSize: 12 }}
                      title="Remove this row"
                      onClick={() => removeField(queue, field)}
                    >
                      ✕ Remove
                    </button>
                  </div>
                ))}

                {/* Inactive / Omitted Items (Can be re-added) */}
                {omittedFields.length > 0 ? (
                  <div style={{ marginTop: 12 }}>
                    <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>
                      Omitted fields (Click to add if needed):
                    </span>
                    <div className="toolbar">
                      {omittedFields.map((field) => (
                        <button
                          key={field}
                          type="button"
                          className="button"
                          style={{ fontSize: 11.5, padding: "3px 8px" }}
                          onClick={() => updateMapping(queue, field, FIELD_LABELS[field])}
                        >
                          + Add {FIELD_LABELS[field]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        <datalist id="available-sheet-headers">
          {headerList.map((header) => (
            <option key={header} value={header} />
          ))}
        </datalist>

        {preview ? (
          <div className="mapping-section">
            <div className="mapping-heading">
              <div>
                <h2>Sample Sheet Preview</h2>
                <p className="eyebrow">First five rows from each tab before saving.</p>
              </div>
            </div>
            <PreviewTable title={`Upcoming: ${form.upcomingTab}`} rows={preview.upcoming} />
            <PreviewTable title={`In-Transit: ${form.inTransitTab}`} rows={preview.inTransit} />
          </div>
        ) : null}

        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="success-message">{message}</p> : null}

        <div className="toolbar" style={{ marginTop: 22, justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="button primary" disabled={saving || deleting} onClick={save}>
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Source"}
            </button>
            {isEditing && onCancel && (
              <button type="button" className="button button-secondary" disabled={saving || deleting} onClick={onCancel}>
                ✕ Cancel
              </button>
            )}
          </div>
          {isEditing && (
            <button
              type="button"
              className="button button-danger-ghost"
              disabled={deleting || saving}
              onClick={handleDelete}
              title="Remove this sheet from Dispatch Desk"
            >
              {deleting ? "Removing..." : "🗑️ Remove Source"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function PreviewTable({ title, rows }: { title: string; rows: Array<Record<string, string>> }) {
  const headers = rows.length ? Object.keys(rows[0]).slice(0, 8) : [];
  return (
    <div style={{ marginTop: 14 }}>
      <strong>{title}</strong>
      {rows.length === 0 ? (
        <p className="eyebrow">No data rows found.</p>
      ) : (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {headers.map((header) => (
                    <td key={header}>{row[header] || "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
