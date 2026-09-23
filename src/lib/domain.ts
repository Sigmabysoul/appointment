export const SOURCE_QUEUES = ["upcoming", "in_transit"] as const;
export type SourceQueue = (typeof SOURCE_QUEUES)[number];

export const APP_STATUSES = ["active", "delivered", "rtd"] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

export const MAPPING_FIELDS = [
  "ro",
  "po",
  "so",
  "warehouse",
  "order_date",
  "tracking_id",
  "tracking_link",
  "courier_partner",
  "appointment_id",
  "total_boxes",
  "dimensions",
  "source_status",
  "courier_status",
  "asn",
  "puc",
  "notes",
] as const;

export type MappingField = (typeof MAPPING_FIELDS)[number];
export type FieldMapping = Partial<Record<MappingField, string>>;

export const FIELD_LABELS: Record<MappingField, string> = {
  ro: "RO number",
  po: "PO number",
  so: "SO / invoice number",
  warehouse: "Warehouse name",
  order_date: "Pickup date",
  tracking_id: "Tracking ID",
  tracking_link: "Tracking link / logistics portal",
  courier_partner: "Courier partner",
  appointment_id: "Appointment ID",
  total_boxes: "Total boxes",
  dimensions: "Box details / dimensions",
  source_status: "Source status",
  courier_status: "Courier status",
  asn: "ASN",
  puc: "PUC",
  notes: "Comments / notes",
};

export const DEFAULT_MAPPING: FieldMapping = {
  ro: "RO",
  warehouse: "Warehouse Name",
  order_date: "Pickup Date",
  tracking_id: "Tracking ID",
  courier_partner: "Courier Partner",
  appointment_id: "Appointment ID",
  dimensions: "Box Details",
  source_status: "Status",
  courier_status: "Courier Status",
};

export const COURIER_SUBSECTIONS = [
  "all",
  "today",
  "tomorrow",
  "in_transit",
  "out_for_delivery",
  "reached_destination",
  "delivered",
  "rto",
] as const;
export type CourierSubsection = (typeof COURIER_SUBSECTIONS)[number];

export type SourceMapping = Record<SourceQueue, FieldMapping>;

export const EMPTY_SOURCE_MAPPING: SourceMapping = {
  upcoming: { ...DEFAULT_MAPPING },
  in_transit: { ...DEFAULT_MAPPING, ro: "RO Number" },
};

export type Source = {
  id: string;
  displayName: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  upcomingTab: string;
  inTransitTab: string;
  mapping: SourceMapping;
  isActive: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Consignment = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceTab: string;
  sourceRow: number;
  externalKey: string;
  queue: SourceQueue;
  orderDate: string | null;
  ro: string | null;
  po: string | null;
  so: string | null;
  trackingId: string | null;
  trackingLink: string | null;
  courierPartner: string | null;
  totalBoxes: string | null;
  dimensions: string | null;
  sourceStatus: string | null;
  courierStatus: string | null;
  warehouse: string | null;
  appointmentId: string | null;
  asn: string | null;
  puc: string | null;
  notes: string | null;
  appStatus: AppStatus;
  statusNote: string | null;
  statusUpdatedAt: string | null;
  statusUpdatedBy: string | null;
  rawData: Record<string, string>;
  updatedAt: string;
};

export type StatusEvent = {
  id: string;
  consignmentId: string;
  previousStatus: AppStatus;
  nextStatus: AppStatus;
  note: string | null;
  changedBy: string;
  createdAt: string;
};
