import { createClient, type Client, type InStatement, type InValue } from "@libsql/client";
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
  is_active: number | bigint;
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
  source_row: number | bigint;
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
  source_present: number | bigint;
  updated_at: string;
};

type StatusEventRow = {
  id: string;
  consignment_id: string;
  previous_status: string;
  next_status: string;
  note: string | null;
  changed_by: string;
  created_at: string;
};

let clientInstance: Client | null = null;

function getDbClient(): Client {
  if (clientInstance) return clientInstance;

  if (process.env.TURSO_DATABASE_URL) {
    clientInstance = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return clientInstance;
  }

  const rawPath = process.env.DISPATCH_DESK_DATABASE_PATH || "data/dispatch-desk.db";
  const resolvedPath = rawPath.startsWith("/") ? rawPath : `${process.cwd()}/${rawPath}`;
  try {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  } catch {
    // Directory might already exist or running in read-only environment
  }

  clientInstance = createClient({
    url: `file:${resolvedPath}`,
  });
  return clientInstance;
}

let initSchemaPromise: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  if (initSchemaPromise) return initSchemaPromise;

  initSchemaPromise = (async () => {
    const client = getDbClient();

    await client.batch(
      [
        `CREATE TABLE IF NOT EXISTS sources (
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
        );`,
        `CREATE TABLE IF NOT EXISTS consignments (
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
        );`,
        `CREATE TABLE IF NOT EXISTS status_events (
          id TEXT PRIMARY KEY,
          consignment_id TEXT NOT NULL REFERENCES consignments(id),
          previous_status TEXT NOT NULL,
          next_status TEXT NOT NULL,
          note TEXT,
          changed_by TEXT NOT NULL,
          created_at TEXT NOT NULL
        );`,
        `CREATE INDEX IF NOT EXISTS consignments_queue_status_idx ON consignments(queue, app_status);`,
        `CREATE INDEX IF NOT EXISTS consignments_source_idx ON consignments(source_id);`,
        `CREATE INDEX IF NOT EXISTS consignments_courier_status_idx ON consignments(courier_status);`,
        `CREATE INDEX IF NOT EXISTS status_events_consignment_idx ON status_events(consignment_id, created_at DESC);`,
      ],
      "write",
    );

    try {
      await client.execute("ALTER TABLE consignments ADD COLUMN source_present INTEGER NOT NULL DEFAULT 1");
    } catch {
      // Column already exists
    }
    try {
      await client.execute("ALTER TABLE consignments ADD COLUMN courier_status TEXT");
    } catch {
      // Column already exists
    }
  })();

  return initSchemaPromise;
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
  const mappingJson = typeof row.mapping_json === "string" ? JSON.parse(row.mapping_json) : row.mapping_json;
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    spreadsheetId: String(row.spreadsheet_id),
    spreadsheetUrl: String(row.spreadsheet_url),
    upcomingTab: String(row.upcoming_tab),
    inTransitTab: String(row.in_transit_tab),
    mapping: normalizeMapping(mappingJson),
    isActive: Boolean(Number(row.is_active)),
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    lastSyncError: row.last_sync_error ? String(row.last_sync_error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function consignmentFromRow(row: ConsignmentRow): Consignment {
  const rawDataJson = typeof row.raw_data_json === "string" ? JSON.parse(row.raw_data_json) : row.raw_data_json || {};
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    sourceName: String(row.source_name),
    sourceTab: String(row.source_tab),
    sourceRow: Number(row.source_row),
    externalKey: String(row.external_key),
    queue: row.queue,
    orderDate: row.order_date ? String(row.order_date) : null,
    ro: row.ro ? String(row.ro) : null,
    po: row.po ? String(row.po) : null,
    so: row.so ? String(row.so) : null,
    trackingId: row.tracking_id ? String(row.tracking_id) : null,
    trackingLink: row.tracking_link ? String(row.tracking_link) : null,
    courierPartner: row.courier_partner ? String(row.courier_partner) : null,
    totalBoxes: row.total_boxes ? String(row.total_boxes) : null,
    dimensions: row.dimensions ? String(row.dimensions) : null,
    sourceStatus: row.source_status ? String(row.source_status) : null,
    courierStatus: row.courier_status ? String(row.courier_status) : null,
    warehouse: row.warehouse ? String(row.warehouse) : null,
    appointmentId: row.appointment_id ? String(row.appointment_id) : null,
    asn: row.asn ? String(row.asn) : null,
    puc: row.puc ? String(row.puc) : null,
    notes: row.notes ? String(row.notes) : null,
    appStatus: row.app_status,
    statusNote: row.status_note ? String(row.status_note) : null,
    statusUpdatedAt: row.status_updated_at ? String(row.status_updated_at) : null,
    statusUpdatedBy: row.status_updated_by ? String(row.status_updated_by) : null,
    rawData: rawDataJson,
    updatedAt: String(row.updated_at),
  };
}

export async function listSources(): Promise<Source[]> {
  await ensureSchema();
  const client = getDbClient();
  const res = await client.execute("SELECT * FROM sources ORDER BY display_name");
  return (res.rows as unknown as SourceRow[]).map(sourceFromRow);
}

export async function getSource(sourceId: string): Promise<Source | null> {
  await ensureSchema();
  const client = getDbClient();
  const res = await client.execute({
    sql: "SELECT * FROM sources WHERE id = ?",
    args: [sourceId],
  });
  if (res.rows.length === 0) return null;
  return sourceFromRow(res.rows[0] as unknown as SourceRow);
}

export async function getSourceOrderCounts(): Promise<Record<string, number>> {
  await ensureSchema();
  const client = getDbClient();
  const res = await client.execute("SELECT source_id, COUNT(*) as count FROM consignments GROUP BY source_id");
  const map: Record<string, number> = {};
  for (const r of res.rows) {
    if (r.source_id) {
      map[String(r.source_id)] = Number(r.count);
    }
  }
  return map;
}

export async function createSource(
  input: Omit<Source, "id" | "lastSyncedAt" | "lastSyncError" | "createdAt" | "updatedAt">,
): Promise<Source> {
  await ensureSchema();
  const client = getDbClient();
  const id = randomUUID();
  const createdAt = now();
  await client.execute({
    sql: `
      INSERT INTO sources (id, display_name, spreadsheet_id, spreadsheet_url, upcoming_tab, in_transit_tab, mapping_json, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
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
    ],
  });
  const created = await getSource(id);
  return created!;
}

export async function updateSource(
  sourceId: string,
  input: Omit<Source, "id" | "lastSyncedAt" | "lastSyncError" | "createdAt" | "updatedAt">,
): Promise<Source | null> {
  await ensureSchema();
  const client = getDbClient();
  const res = await client.execute({
    sql: `
      UPDATE sources
      SET display_name = ?, spreadsheet_id = ?, spreadsheet_url = ?, upcoming_tab = ?, in_transit_tab = ?, mapping_json = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `,
    args: [
      input.displayName,
      input.spreadsheetId,
      input.spreadsheetUrl,
      input.upcomingTab,
      input.inTransitTab,
      JSON.stringify(normalizeMapping(input.mapping)),
      Number(input.isActive),
      now(),
      sourceId,
    ],
  });
  return res.rowsAffected > 0 ? await getSource(sourceId) : null;
}

export async function deleteSource(sourceId: string): Promise<boolean> {
  await ensureSchema();
  const client = getDbClient();
  await client.batch(
    [
      {
        sql: `DELETE FROM status_events WHERE consignment_id IN (SELECT id FROM consignments WHERE source_id = ?)`,
        args: [sourceId],
      },
      {
        sql: "DELETE FROM consignments WHERE source_id = ?",
        args: [sourceId],
      },
      {
        sql: "DELETE FROM sources WHERE id = ?",
        args: [sourceId],
      },
    ],
    "write",
  );
  return true;
}

export async function recordSourceSync(sourceId: string, error: string | null): Promise<void> {
  await ensureSchema();
  const client = getDbClient();
  await client.execute({
    sql: "UPDATE sources SET last_synced_at = ?, last_sync_error = ?, updated_at = ? WHERE id = ?",
    args: [error ? null : now(), error, now(), sourceId],
  });
}

export async function listConsignments(
  input: {
    queue?: SourceQueue;
    status?: AppStatus;
    query?: string;
    limit?: number;
    courierStatus?: string;
    sourceId?: string;
  } = {},
): Promise<Consignment[]> {
  await ensureSchema();
  const client = getDbClient();
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
  const res = await client.execute({
    sql: `
      SELECT c.*, s.display_name AS source_name
      FROM consignments c
      JOIN sources s ON s.id = c.source_id
      ${where}
      ORDER BY c.order_date DESC, c.updated_at DESC
      LIMIT ?
    `,
    args: values as InValue[],
  });
  return (res.rows as unknown as ConsignmentRow[]).map(consignmentFromRow);
}

export async function getDashboardStats(): Promise<{
  total: number;
  upcoming: number;
  inTransitQueue: number;
  today: number;
  tomorrow: number;
  inTransit: number;
  outForDelivery: number;
  reachedDestination: number;
  delivered: number;
  rto: number;
  rtd: number;
}> {
  await ensureSchema();
  const client = getDbClient();
  const res = await client.execute(`
    SELECT c.id, c.queue, c.order_date, c.courier_status, c.app_status
    FROM consignments c
    JOIN sources s ON s.id = c.source_id
    WHERE s.is_active = 1 AND (c.source_present = 1 OR c.app_status <> 'active')
  `);

  const rows = res.rows as unknown as Array<{
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
    rtd: rtoCount,
  };
}

function valueFor(mapping: FieldMapping, field: MappingField, row: Record<string, string>) {
  const sourceHeader = mapping[field]?.trim();
  return sourceHeader ? nullIfBlank(row[sourceHeader]) : null;
}

export async function importRows(
  source: Source,
  queue: SourceQueue,
  tabName: string,
  rows: Array<{ rowNumber: number; values: Record<string, string> }>,
): Promise<{ imported: number; externalKeys: string[] }> {
  await ensureSchema();
  const client = getDbClient();
  const mapping = source.mapping[queue];

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

    const explicitKey = roVal || poVal || (soVal && soVal !== "TRUE" && soVal !== "FALSE" ? soVal : null);

    if (explicitKey) {
      currentGroupKey = explicitKey;
    } else if (!currentGroupKey && trackingVal) {
      currentGroupKey = trackingVal;
    }

    if (!currentGroupKey) {
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

    const boxEntry = valueFor(mapping, "dimensions", row.values) ?? valueFor(mapping, "total_boxes", row.values);
    if (boxEntry && !boxEntry.startsWith("CLRBAG") && boxEntry !== "TRUE" && boxEntry !== "FALSE") {
      shipment.boxDetailsList.push(boxEntry);
    }
  }

  const statements: InStatement[] = [];
  const externalKeys: string[] = [];

  for (const [key, shipment] of consolidatedMap.entries()) {
    const externalKey = `${queue}:${key}`;

    let totalBoxesCount = 0;
    for (const b of shipment.boxDetailsList) {
      const match = b.match(/(\d+)\s*(?:BOX|BOXES)/i);
      if (match) {
        totalBoxesCount += parseInt(match[1], 10);
      }
    }

    const totalBoxesStr = totalBoxesCount > 0 ? String(totalBoxesCount) : shipment.boxDetailsList.length ? String(shipment.boxDetailsList.length) : null;
    const dimensionsStr = shipment.boxDetailsList.length ? shipment.boxDetailsList.join(" · ") : null;

    statements.push({
      sql: `
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
      `,
      args: [
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
      ] as InValue[],
    });

    externalKeys.push(externalKey);
  }

  for (let i = 0; i < statements.length; i += 100) {
    const chunk = statements.slice(i, i + 100);
    await client.batch(chunk, "write");
  }

  return { imported: statements.length, externalKeys };
}

export async function reconcileActiveSourceRows(sourceId: string, externalKeys: string[]): Promise<number> {
  await ensureSchema();
  const client = getDbClient();
  const uniqueKeys = [...new Set(externalKeys)];
  if (uniqueKeys.length === 0) {
    const res = await client.execute({
      sql: "UPDATE consignments SET source_present = 0 WHERE source_id = ? AND app_status = 'active'",
      args: [sourceId],
    });
    return res.rowsAffected;
  }
  const placeholders = uniqueKeys.map(() => "?").join(", ");
  const res = await client.execute({
    sql: `UPDATE consignments SET source_present = 0 WHERE source_id = ? AND app_status = 'active' AND external_key NOT IN (${placeholders})`,
    args: [sourceId, ...uniqueKeys],
  });
  return res.rowsAffected;
}

export async function updateConsignmentStatus(
  consignmentId: string,
  nextStatus: AppStatus,
  note: string | undefined,
  changedBy: string,
): Promise<boolean | null> {
  await ensureSchema();
  if (!APP_STATUSES.includes(nextStatus)) throw new Error("Unknown logistics status.");
  const client = getDbClient();
  const res = await client.execute({
    sql: "SELECT app_status FROM consignments WHERE id = ?",
    args: [consignmentId],
  });
  if (res.rows.length === 0) return null;
  const currentStatus = res.rows[0].app_status as AppStatus;
  const updatedAt = now();

  await client.batch(
    [
      {
        sql: `UPDATE consignments SET app_status = ?, status_note = ?, status_updated_at = ?, status_updated_by = ?, updated_at = ? WHERE id = ?`,
        args: [nextStatus, nullIfBlank(note), updatedAt, changedBy, updatedAt, consignmentId],
      },
      {
        sql: `INSERT INTO status_events (id, consignment_id, previous_status, next_status, note, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [randomUUID(), consignmentId, currentStatus, nextStatus, nullIfBlank(note), changedBy, updatedAt],
      },
    ],
    "write",
  );

  return true;
}

export async function listStatusEvents(consignmentId: string): Promise<StatusEvent[]> {
  await ensureSchema();
  const client = getDbClient();
  const res = await client.execute({
    sql: "SELECT * FROM status_events WHERE consignment_id = ? ORDER BY created_at DESC",
    args: [consignmentId],
  });
  return (res.rows as unknown as StatusEventRow[]).map((row) => ({
    id: String(row.id),
    consignmentId: String(row.consignment_id),
    previousStatus: row.previous_status as AppStatus,
    nextStatus: row.next_status as AppStatus,
    note: row.note ? String(row.note) : null,
    changedBy: String(row.changed_by),
    createdAt: String(row.created_at),
  }));
}
