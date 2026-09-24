import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  APP_STATUSES,
  type AppStatus,
  type Consignment,
  type FieldMapping,
  type MappingField,
  type Source,
  type SourceMapping,
  type SourceQueue,
  type StatusEvent,
} from "@/lib/domain";
import { isDateToday, isDateTomorrow } from "@/lib/date-utils";

type SourceRow = {
  id: string;
  display_name: string;
  spreadsheet_id: string;
  spreadsheet_url: string;
  upcoming_tab: string;
  in_transit_tab: string;
  mapping_json: string;
  is_active: number;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

type ConsignmentRow = {
  id: string;
  source_id: string;
  source_name: string;
  source_tab: string;
  source_row: number;
  external_key: string;
  queue: SourceQueue;
  order_date: string | null;
  ro: string | null;
  po: string | null;
  so: string | null;
  tracking_id: string | null;
  tracking_link: string | null;
  courier_partner: string | null;
  total_boxes: string | null;
  dimensions: string | null;
  source_status: string | null;
  courier_status: string | null;
  warehouse: string | null;
  appointment_id: string | null;
  asn: string | null;
  puc: string | null;
  notes: string | null;
  app_status: AppStatus;
  status_note: string | null;
  status_updated_at: string | null;
  status_updated_by: string | null;
  raw_data_json: string;
  updated_at: string;
};

const databasePath = process.env.DISPATCH_DESK_DATABASE_PATH ?? `${process.cwd()}/data/dispatch-desk.db`;
mkdirSync(dirname(databasePath), { recursive: true });
const database = new Database(databasePath);
database.pragma("journal_mode = WAL");

database.exec(`
  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    spreadsheet_id TEXT NOT NULL UNIQUE,
    spreadsheet_url TEXT NOT NULL,
    upcoming_tab TEXT NOT NULL,
    in_transit_tab TEXT NOT NULL,
    mapping_json TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_synced_at TEXT,
    last_sync_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS consignments (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id),
    source_tab TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    external_key TEXT NOT NULL,
    queue TEXT NOT NULL CHECK(queue IN ('upcoming', 'in_transit')),
    order_date TEXT,
    ro TEXT,
    po TEXT,
    so TEXT,
    tracking_id TEXT,
    tracking_link TEXT,
    courier_partner TEXT,
    total_boxes TEXT,
    dimensions TEXT,
    source_status TEXT,
    courier_status TEXT,
    warehouse TEXT,
    appointment_id TEXT,
    asn TEXT,
    puc TEXT,
    notes TEXT,
    app_status TEXT NOT NULL DEFAULT 'active' CHECK(app_status IN ('active', 'delivered', 'rtd')),
    status_note TEXT,
    status_updated_at TEXT,
    status_updated_by TEXT,
    raw_data_json TEXT NOT NULL,
    source_present INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    UNIQUE(source_id, external_key)
  );

  CREATE TABLE IF NOT EXISTS status_events (
    id TEXT PRIMARY KEY,
    consignment_id TEXT NOT NULL REFERENCES consignments(id),
    previous_status TEXT NOT NULL,
    next_status TEXT NOT NULL,
    note TEXT,
    changed_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS consignments_queue_status_idx ON consignments(queue, app_status);
  CREATE INDEX IF NOT EXISTS consignments_source_idx ON consignments(source_id);
  CREATE INDEX IF NOT EXISTS status_events_consignment_idx ON status_events(consignment_id, created_at DESC);
`);

const consignmentColumns = database.prepare("PRAGMA table_info(consignments)").all() as Array<{ name: string }>;
if (!consignmentColumns.some((column) => column.name === "source_present")) {
  database.exec("ALTER TABLE consignments ADD COLUMN source_present INTEGER NOT NULL DEFAULT 1");
}
if (!consignmentColumns.some((column) => column.name === "courier_status")) {
  database.exec("ALTER TABLE consignments ADD COLUMN courier_status TEXT");
}

database.exec("CREATE INDEX IF NOT EXISTS consignments_courier_status_idx ON consignments(courier_status)");

// Auto-repair known tab/mapping discrepancies for sources
try {
  const flipkart = database.prepare("SELECT * FROM sources WHERE display_name LIKE '%flipkart%' OR spreadsheet_id = '1tuqXdJV2gFn6UvpT4OC2SznIUkOk7N11djzdF96b-B8'").get() as SourceRow | undefined;
  if (flipkart && flipkart.in_transit_tab !== "In Transit") {
    database.prepare("UPDATE sources SET in_transit_tab = 'In Transit' WHERE id = ?").run(flipkart.id);
  }
} catch {
  // Ignore
}

const now = () => new Date().toISOString();
const nullIfBlank = (value: string | undefined | null) => (value?.trim() ? value.trim() : null);

function normalizeMapping(value: unknown): SourceMapping {
  const candidate = value as Partial<SourceMapping> | null;
  const cleanQueue = (queue: "upcoming" | "in_transit") =>
    Object.fromEntries(
      Object.entries(candidate?.[queue] ?? {})
        .map(([field, header]) => [field, String(header ?? "").trim()])
        .filter(([, header]) => header),
    ) as FieldMapping;
  return {
    upcoming: cleanQueue("upcoming"),
    in_transit: cleanQueue("in_transit"),
  };
}

function sourceFromRow(row: SourceRow): Source {
  return {
    id: row.id,
    displayName: row.display_name,
    spreadsheetId: row.spreadsheet_id,
    spreadsheetUrl: row.spreadsheet_url,
    upcomingTab: row.upcoming_tab,
    inTransitTab: row.in_transit_tab,
    mapping: normalizeMapping(JSON.parse(row.mapping_json)),
    isActive: Boolean(row.is_active),
    lastSyncedAt: row.last_synced_at,
    lastSyncError: row.last_sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function consignmentFromRow(row: ConsignmentRow): Consignment {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceTab: row.source_tab,
    sourceRow: row.source_row,
    externalKey: row.external_key,
    queue: row.queue,
    orderDate: row.order_date,
    ro: row.ro,
    po: row.po,
    so: row.so,
    trackingId: row.tracking_id,
    trackingLink: row.tracking_link,
    courierPartner: row.courier_partner,
    totalBoxes: row.total_boxes,
    dimensions: row.dimensions,
    sourceStatus: row.source_status,
    courierStatus: row.courier_status ?? null,
    warehouse: row.warehouse,
    appointmentId: row.appointment_id,
    asn: row.asn,
    puc: row.puc,
    notes: row.notes,
    appStatus: row.app_status,
    statusNote: row.status_note,
    statusUpdatedAt: row.status_updated_at,
    statusUpdatedBy: row.status_updated_by,
    rawData: JSON.parse(row.raw_data_json),
    updatedAt: row.updated_at,
  };
}

export function listSources(): Source[] {
  return (database.prepare("SELECT * FROM sources ORDER BY display_name").all() as SourceRow[]).map(sourceFromRow);
}

export function getSource(sourceId: string): Source | null {
  const row = database.prepare("SELECT * FROM sources WHERE id = ?").get(sourceId) as SourceRow | undefined;
  return row ? sourceFromRow(row) : null;
}

export function getSourceOrderCounts(): Record<string, number> {
  const rows = database
    .prepare("SELECT source_id, COUNT(*) as count FROM consignments GROUP BY source_id")
    .all() as Array<{ source_id: string; count: number }>;
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (r.source_id) {
      map[r.source_id] = r.count;
    }
  }
  return map;
}

export function createSource(input: Omit<Source, "id" | "lastSyncedAt" | "lastSyncError" | "createdAt" | "updatedAt">): Source {
  const id = randomUUID();
  const createdAt = now();
  database
    .prepare(
      `
    INSERT INTO sources (id, display_name, spreadsheet_id, spreadsheet_url, upcoming_tab, in_transit_tab, mapping_json, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      id,
      input.displayName,
      input.spreadsheetId,
      input.spreadsheetUrl,
      input.upcomingTab,
      input.inTransitTab,
      JSON.stringify(normalizeMapping(input.mapping)),
      Number(input.isActive),
      createdAt,
      createdAt,
    );
  return getSource(id)!;
}

export function updateSource(sourceId: string, input: Omit<Source, "id" | "lastSyncedAt" | "lastSyncError" | "createdAt" | "updatedAt">): Source | null {
  const result = database
    .prepare(
      `
    UPDATE sources
    SET display_name = ?, spreadsheet_id = ?, spreadsheet_url = ?, upcoming_tab = ?, in_transit_tab = ?, mapping_json = ?, is_active = ?, updated_at = ?
    WHERE id = ?
  `,
    )
    .run(
      input.displayName,
      input.spreadsheetId,
      input.spreadsheetUrl,
      input.upcomingTab,
      input.inTransitTab,
      JSON.stringify(normalizeMapping(input.mapping)),
      Number(input.isActive),
      now(),
      sourceId,
    );
  return result.changes ? getSource(sourceId) : null;
}

export function deleteSource(sourceId: string): boolean {
  const transaction = database.transaction(() => {
    // 1. Delete associated status events for consignments belonging to this source
    database.prepare(`
      DELETE FROM status_events 
      WHERE consignment_id IN (SELECT id FROM consignments WHERE source_id = ?)
    `).run(sourceId);

    // 2. Delete all consignments belonging to this source
    database.prepare("DELETE FROM consignments WHERE source_id = ?").run(sourceId);

    // 3. Delete the source itself
    const result = database.prepare("DELETE FROM sources WHERE id = ?").run(sourceId);
    return result.changes > 0;
  });

  return transaction();
}

export function recordSourceSync(sourceId: string, error: string | null) {
  database
    .prepare("UPDATE sources SET last_synced_at = ?, last_sync_error = ?, updated_at = ? WHERE id = ?")
    .run(error ? null : now(), error, now(), sourceId);
}

export function listConsignments(input: {
  queue?: SourceQueue;
  status?: AppStatus;
  query?: string;
  limit?: number;
  courierStatus?: string;
  sourceId?: string;
} = {}): Consignment[] {
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (input.queue) {
    clauses.push("c.queue = ?", "c.source_present = 1", "s.is_active = 1");
    values.push(input.queue);
  }
  if (input.status) {
    clauses.push("c.app_status = ?");
    values.push(input.status);
  }
  if (input.sourceId) {
    clauses.push("c.source_id = ?");
    values.push(input.sourceId);
  }
  if (input.courierStatus) {
    clauses.push("LOWER(TRIM(c.courier_status)) = LOWER(?)");
    values.push(input.courierStatus.trim());
  }
  if (input.query?.trim()) {
    clauses.push(
      "(c.ro LIKE ? OR c.po LIKE ? OR c.so LIKE ? OR c.tracking_id LIKE ? OR c.warehouse LIKE ? OR c.courier_partner LIKE ? OR c.appointment_id LIKE ? OR s.display_name LIKE ?)",
    );
    const pattern = `%${input.query.trim()}%`;
    values.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }
  values.push(input.limit ?? 1000);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = database
    .prepare(
      `
    SELECT c.*, s.display_name AS source_name
    FROM consignments c
    JOIN sources s ON s.id = c.source_id
    ${where}
    ORDER BY c.order_date DESC, c.updated_at DESC
    LIMIT ?
  `,
    )
    .all(...values) as ConsignmentRow[];
  return rows.map(consignmentFromRow);
}

export function getDashboardStats() {
  const rows = database
    .prepare(
      `
    SELECT c.id, c.queue, c.order_date, c.courier_status, c.app_status
    FROM consignments c
    JOIN sources s ON s.id = c.source_id
    WHERE s.is_active = 1 AND (c.source_present = 1 OR c.app_status <> 'active')
  `,
    )
    .all() as Array<{
      id: string;
      queue: SourceQueue;
      order_date: string | null;
      courier_status: string | null;
      app_status: AppStatus;
    }>;

  let todayCount = 0;
  let tomorrowCount = 0;
  let inTransitCount = 0;
  let outForDeliveryCount = 0;
  let reachedDestinationCount = 0;
  let deliveredCount = 0;
  let rtoCount = 0;

  for (const r of rows) {
    if (isDateToday(r.order_date)) todayCount++;
    if (isDateTomorrow(r.order_date)) tomorrowCount++;

    const statusNorm = (r.courier_status ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (statusNorm.includes("delivered") && !statusNorm.includes("undelivered")) {
      deliveredCount++;
    } else if (statusNorm.includes("destination") || statusNorm.includes("reached")) {
      reachedDestinationCount++;
    } else if (statusNorm.includes("outfordelivery") || statusNorm === "ofd") {
      outForDeliveryCount++;
    } else if (
      statusNorm.includes("rto") ||
      statusNorm.includes("undelivered") ||
      statusNorm.includes("missed")
    ) {
      rtoCount++;
    } else if (
      statusNorm.includes("transit") ||
      statusNorm.includes("pending") ||
      r.queue === "in_transit"
    ) {
      inTransitCount++;
    }
  }

  const upcomingCount = rows.filter((r) => r.queue === "upcoming").length;
  const inTransitQueueCount = rows.filter((r) => r.queue === "in_transit").length;

  return {
    total: rows.length,
    upcoming: upcomingCount,
    inTransitQueue: inTransitQueueCount,
    today: todayCount,
    tomorrow: tomorrowCount,
    inTransit: inTransitCount,
    outForDelivery: outForDeliveryCount,
    reachedDestination: reachedDestinationCount,
    delivered: deliveredCount,
    rto: rtoCount,
    // legacy compatibility
    rtd: rtoCount,
  };
}

function valueFor(mapping: FieldMapping, field: MappingField, row: Record<string, string>) {
  const sourceHeader = mapping[field]?.trim();
  return sourceHeader ? nullIfBlank(row[sourceHeader]) : null;
}

export function importRows(
  source: Source,
  queue: SourceQueue,
  tabName: string,
  rows: Array<{ rowNumber: number; values: Record<string, string> }>,
) {
  const mapping = source.mapping[queue];
  const upsert = database.prepare(`
    INSERT INTO consignments (
      id, source_id, source_tab, source_row, external_key, queue, order_date, ro, po, so, tracking_id, tracking_link, courier_partner,
      total_boxes, dimensions, source_status, courier_status, warehouse, appointment_id, asn, puc, notes, raw_data_json, source_present, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id, external_key) DO UPDATE SET
      source_tab = excluded.source_tab, source_row = excluded.source_row, queue = excluded.queue, order_date = excluded.order_date,
      ro = excluded.ro, po = excluded.po, so = excluded.so, tracking_id = excluded.tracking_id, tracking_link = excluded.tracking_link,
      courier_partner = excluded.courier_partner, total_boxes = excluded.total_boxes, dimensions = excluded.dimensions,
      source_status = excluded.source_status, courier_status = excluded.courier_status, warehouse = excluded.warehouse, appointment_id = excluded.appointment_id, asn = excluded.asn,
      puc = excluded.puc, notes = excluded.notes, raw_data_json = excluded.raw_data_json, source_present = 1, updated_at = excluded.updated_at
  `);

  type ConsolidatedShipment = {
    ro: string | null;
    po: string | null;
    so: string | null;
    warehouse: string | null;
    orderDate: string | null;
    trackingId: string | null;
    trackingLink: string | null;
    courierPartner: string | null;
    appointmentId: string | null;
    sourceStatus: string | null;
    courierStatus: string | null;
    asn: string | null;
    puc: string | null;
    notes: string | null;
    boxDetailsList: string[];
    rowNumber: number;
    rawValues: Record<string, string>;
  };

  const consolidatedMap = new Map<string, ConsolidatedShipment>();
  let currentGroupKey: string | null = null;

  // Helper to extract value using mapping or known column fallbacks
  const getVal = (field: MappingField, fallbackHeaders: string[], rowVals: Record<string, string>) => {
    let val = valueFor(mapping, field, rowVals);
    if (!val) {
      for (const h of fallbackHeaders) {
        if (rowVals[h]?.trim()) {
          val = rowVals[h].trim();
          break;
        }
      }
    }
    return val;
  };

  for (const row of rows) {
    const roVal = getVal("ro", ["RO", "RO Number", "RO number"], row.values);
    const poVal = getVal("po", ["PO", "PO Number", "PO Number ", "PO number"], row.values);
    const soVal = getVal("so", ["SO", "SO ", "Sales Order"], row.values);
    const trackingVal = getVal("tracking_id", ["Tracking ID", "Pickup Tracking ID", "Pickup Tracking ID ", "Tracking No"], row.values);
    const courierStatusVal = getVal("courier_status", ["Courier Status", "Tracking Status", "Tracking Status ", "Courier status", "Tracking status"], row.values);

    // If an explicit RO/PO/SO is present on this row, start or associate with that group
    const explicitKey = roVal || poVal || (soVal && soVal !== "TRUE" && soVal !== "FALSE" ? soVal : null);

    if (explicitKey) {
      currentGroupKey = explicitKey;
    } else if (!currentGroupKey && trackingVal) {
      currentGroupKey = trackingVal;
    }

    if (!currentGroupKey) {
      // Empty separator row or unassociated row, skip
      continue;
    }

    if (!consolidatedMap.has(currentGroupKey)) {
      consolidatedMap.set(currentGroupKey, {
        ro: roVal,
        po: poVal,
        so: soVal && soVal !== "TRUE" && soVal !== "FALSE" ? soVal : null,
        warehouse: getVal("warehouse", ["Warehouse Name", "Warehouse Name ", "Warehouse"], row.values),
        orderDate: getVal("order_date", ["Pickup Date", "Order Date", "Order Date ", "Dispatch Date"], row.values),
        trackingId: trackingVal,
        trackingLink: getVal("tracking_link", ["Logistics Portal", "Logistics Portal ", "Tracking Link"], row.values),
        courierPartner: getVal("courier_partner", ["Courier Partner", "Courier Partner ", "Courier", "Logistics Portal", "Logistics Portal "], row.values),
        appointmentId: getVal("appointment_id", ["Appointment ID", "Appointment ID ", "Appointment"], row.values),
        sourceStatus: getVal("source_status", ["Status", "Status "], row.values),
        courierStatus: courierStatusVal,
        asn: getVal("asn", ["ASN", "ASN "], row.values),
        puc: getVal("puc", ["PUC", "PUC "], row.values),
        notes: getVal("notes", ["Comment", "Comment ", "Notes", "Remarks"], row.values),
        boxDetailsList: [],
        rowNumber: row.rowNumber,
        rawValues: { ...row.values },
      });
    }

    const shipment = consolidatedMap.get(currentGroupKey)!;

    // Fill in any missing shipment header fields from subsequent rows if found
    if (!shipment.warehouse) shipment.warehouse = getVal("warehouse", ["Warehouse Name", "Warehouse Name ", "Warehouse"], row.values);
    if (!shipment.orderDate) shipment.orderDate = getVal("order_date", ["Pickup Date", "Order Date", "Order Date ", "Dispatch Date"], row.values);
    if (!shipment.trackingId) shipment.trackingId = trackingVal;
    if (!shipment.trackingLink) shipment.trackingLink = getVal("tracking_link", ["Logistics Portal", "Logistics Portal ", "Tracking Link"], row.values);
    if (!shipment.courierStatus && courierStatusVal) shipment.courierStatus = courierStatusVal;

    const courier = getVal("courier_partner", ["Courier Partner", "Courier Partner ", "Courier", "Logistics Portal", "Logistics Portal "], row.values);
    if (courier && !courier.toLowerCase().includes("box") && !shipment.courierPartner) {
      shipment.courierPartner = courier;
    }

    const appt = getVal("appointment_id", ["Appointment ID", "Appointment ID ", "Appointment"], row.values);
    if (appt && appt !== "TRUE" && appt !== "FALSE" && !shipment.appointmentId) {
      shipment.appointmentId = appt;
    }

    if (!shipment.sourceStatus) shipment.sourceStatus = getVal("source_status", ["Status", "Status "], row.values);

    // Collect box details
    const boxEntry = valueFor(mapping, "dimensions", row.values) ?? valueFor(mapping, "total_boxes", row.values);
    if (boxEntry && !boxEntry.startsWith("CLRBAG") && boxEntry !== "TRUE" && boxEntry !== "FALSE") {
      shipment.boxDetailsList.push(boxEntry);
    }
  }

  const transaction = database.transaction(() => {
    let imported = 0;
    const externalKeys: string[] = [];

    for (const [key, shipment] of consolidatedMap.entries()) {
      const externalKey = `${queue}:${key}`;

      // Calculate total boxes if possible
      let totalBoxesCount = 0;
      for (const b of shipment.boxDetailsList) {
        const match = b.match(/(\d+)\s*(?:BOX|BOXES)/i);
        if (match) {
          totalBoxesCount += parseInt(match[1], 10);
        }
      }

      const totalBoxesStr = totalBoxesCount > 0 ? String(totalBoxesCount) : shipment.boxDetailsList.length ? String(shipment.boxDetailsList.length) : null;
      const dimensionsStr = shipment.boxDetailsList.length ? shipment.boxDetailsList.join(" · ") : null;

      upsert.run(
        randomUUID(),
        source.id,
        tabName,
        shipment.rowNumber,
        externalKey,
        queue,
        shipment.orderDate,
        shipment.ro,
        shipment.po,
        shipment.so,
        shipment.trackingId,
        shipment.trackingLink,
        shipment.courierPartner,
        totalBoxesStr,
        dimensionsStr,
        shipment.sourceStatus,
        shipment.courierStatus,
        shipment.warehouse,
        shipment.appointmentId,
        shipment.asn,
        shipment.puc,
        shipment.notes,
        JSON.stringify(shipment.rawValues),
        1,
        now(),
      );

      imported += 1;
      externalKeys.push(externalKey);
    }
    return { imported, externalKeys };
  });

  return transaction();
}

export function reconcileActiveSourceRows(sourceId: string, externalKeys: string[]) {
  const uniqueKeys = [...new Set(externalKeys)];
  if (uniqueKeys.length === 0) {
    return database.prepare("UPDATE consignments SET source_present = 0 WHERE source_id = ? AND app_status = 'active'").run(sourceId).changes;
  }
  const placeholders = uniqueKeys.map(() => "?").join(", ");
  return database
    .prepare(
      `UPDATE consignments SET source_present = 0 WHERE source_id = ? AND app_status = 'active' AND external_key NOT IN (${placeholders})`,
    )
    .run(sourceId, ...uniqueKeys).changes;
}

export function updateConsignmentStatus(consignmentId: string, nextStatus: AppStatus, note: string | undefined, changedBy: string) {
  if (!APP_STATUSES.includes(nextStatus)) throw new Error("Unknown logistics status.");
  const current = database.prepare("SELECT app_status FROM consignments WHERE id = ?").get(consignmentId) as { app_status: AppStatus } | undefined;
  if (!current) return null;
  const updatedAt = now();
  const result = database
    .prepare(
      `
    UPDATE consignments SET app_status = ?, status_note = ?, status_updated_at = ?, status_updated_by = ?, updated_at = ? WHERE id = ?
  `,
    )
    .run(nextStatus, nullIfBlank(note), updatedAt, changedBy, updatedAt, consignmentId);
  if (!result.changes) return null;
  database
    .prepare(
      `
    INSERT INTO status_events (id, consignment_id, previous_status, next_status, note, changed_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(randomUUID(), consignmentId, current.app_status, nextStatus, nullIfBlank(note), changedBy, updatedAt);
  return true;
}

export function listStatusEvents(consignmentId: string): StatusEvent[] {
  return database.prepare("SELECT * FROM status_events WHERE consignment_id = ? ORDER BY created_at DESC").all(consignmentId) as StatusEvent[];
}
