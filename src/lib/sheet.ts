import { type FieldMapping, type MappingField, type SourceQueue } from "@/lib/domain";

export function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? input.trim();
}

const FIELD_ALIASES: Record<MappingField, string[]> = {
  ro: ["ro", "ro number", "requisition order"],
  po: ["po", "po number", "purchase order"],
  so: ["so", "sales order", "invoice no", "invoice number", "invoice"],
  warehouse: ["warehouse name", "warehouse", "destination warehouse", "wh name"],
  order_date: ["pickup date", "order date", "date", "dispatch date"],
  tracking_id: ["tracking id", "pickup tracking id", "tracking no", "awb", "awb number", "docket number", "docket no"],
  tracking_link: ["logistics portal", "tracking link", "tracking url"],
  courier_partner: ["courier partner", "courier", "carrier", "logistics partner", "logistics portal"],
  appointment_id: ["appointment id", "appointment", "appointment no", "appointment number"],
  total_boxes: ["no of boxes", "no. of boxes", "total boxes", "box count", "boxes"],
  dimensions: ["box details", "box dimensions", "dimensions"],
  source_status: ["status", "order status"],
  courier_status: ["courier status", "tracking status", "courier tracking status"],
  asn: ["asn", "asn no", "asn number"],
  puc: ["puc"],
  notes: ["comment", "comments", "notes", "remark", "remarks"],
};

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function suggestFieldMapping(headers: string[]): FieldMapping {
  const byNormalizedHeader = new Map(headers.filter(Boolean).map((header) => [normalizeLabel(header), header]));
  const mapping: FieldMapping = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<[MappingField, string[]]>) {
    const match = aliases.map(normalizeLabel).map((alias) => byNormalizedHeader.get(alias)).find(Boolean);
    if (match) mapping[field] = match;
  }
  return mapping;
}

function recommendedTab(tabs: string[], queue: SourceQueue, preferred?: string) {
  if (preferred && tabs.includes(preferred)) return preferred;
  const candidates = queue === "upcoming" ? ["upcoming", "upcoming orders"] : ["in transit", "in-transit", "intransit", "on the way"];
  return tabs.find((tab) => candidates.includes(normalizeLabel(tab))) ?? tabs.find((tab) => normalizeLabel(tab).includes(queue === "upcoming" ? "upcoming" : "transit")) ?? tabs[0] ?? "";
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

async function fetchTabCSV(spreadsheetId: string, tabName: string): Promise<string> {
  const encodedTab = encodeURIComponent(tabName);
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodedTab}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Could not access sheet (${response.status}). Make sure the Google Sheet sharing setting is set to "Anyone with the link can view".`,
    );
  }

  const text = await response.text();
  if (text.includes("<!DOCTYPE html>") || text.includes("<html")) {
    throw new Error(
      `Could not access sheet. Make sure the Google Sheet sharing setting is set to "Anyone with the link can view".`,
    );
  }

  return text;
}

export async function readSheetRows(spreadsheetId: string, tabName: string) {
  let text = "";
  try {
    text = await fetchTabCSV(spreadsheetId, tabName);
  } catch (err) {
    // Attempt alternate variations (e.g. In-Transit vs In Transit)
    const alternateTab = tabName.includes("-")
      ? tabName.replace(/-/g, " ")
      : tabName.includes(" ")
      ? tabName.replace(/\s+/g, "-")
      : null;

    if (alternateTab) {
      try {
        text = await fetchTabCSV(spreadsheetId, alternateTab);
      } catch {
        throw err;
      }
    } else {
      throw err;
    }
  }

  let rows = parseCSV(text);

  // If parsed rows is empty or only 1 row with no data, try alternate tab format
  if (rows.length <= 1 && (tabName.includes("-") || tabName.includes(" "))) {
    const alternateTab = tabName.includes("-")
      ? tabName.replace(/-/g, " ")
      : tabName.replace(/\s+/g, "-");
    try {
      const altText = await fetchTabCSV(spreadsheetId, alternateTab);
      const altRows = parseCSV(altText);
      if (altRows.length > rows.length) {
        rows = altRows;
      }
    } catch {
      // Keep existing rows
    }
  }

  if (rows.length === 0) {
    throw new Error(`The “${tabName}” tab is empty.`);
  }

  // Find the last non-empty column header to trim trailing blanks
  const rawHeaders = (rows[0] ?? []).map((h) => h.trim());
  let lastNonEmptyIndex = -1;
  for (let i = 0; i < rawHeaders.length; i++) {
    if (rawHeaders[i]) lastNonEmptyIndex = i;
  }

  const headers = lastNonEmptyIndex >= 0 ? rawHeaders.slice(0, lastNonEmptyIndex + 1) : [];

  if (headers.length === 0) {
    throw new Error(`The “${tabName}” tab has no header row.`);
  }

  return {
    headers,
    rows: rows.slice(1).map((row, index) => ({
      rowNumber: index + 2,
      values: headers.reduce<Record<string, string>>((record, header, columnIndex) => {
        if (header) record[header] = String(row[columnIndex] ?? "").trim();
        return record;
      }, {}),
    })),
  };
}

export async function discoverSheet(input: { spreadsheetUrl: string; upcomingTab?: string; inTransitTab?: string }) {
  const spreadsheetId = extractSpreadsheetId(input.spreadsheetUrl);
  if (!spreadsheetId.match(/^[a-zA-Z0-9_-]+$/)) {
    throw new Error("Enter a valid Google Sheets link or spreadsheet ID.");
  }

  // Fetch sheet HTML to detect title and tab names
  const htmlUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`;
  const response = await fetch(htmlUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Could not access sheet (${response.status}). Ensure the sheet is shared as "Anyone with the link can view".`,
    );
  }

  const html = await response.text();
  if (html.includes("ServiceLogin") || html.includes("accounts.google.com/InteractiveLogin")) {
    throw new Error(
      `Sheet is private. Please share the Google Sheet as "Anyone with the link can view".`,
    );
  }

  // Extract title
  const titleMatch =
    html.match(/<meta property="og:title" content="([^"]+)">/) ??
    html.match(/<title>([^<]+?)(?: - Google Sheets)?<\/title>/i);
  const displayName = titleMatch?.[1]?.replace(/\s*-\s*Google Sheets$/i, "").trim() || "New sheet source";

  // Extract tab names from htmlview
  const tabMatches = [
    ...html.matchAll(/items\.push\((\{name:\s*"([^"]+)",\s*pageUrl:[^}]+\})\)/g),
  ].map((m) => m[2]);

  // Fallback pattern if items.push is not present
  const captionMatches = [
    ...html.matchAll(/class="[^"]*docs-sheet-tab-caption[^"]*">([^<]+)<\/div>/g),
  ].map((m) => m[1].trim());

  const extractedTabs = [...new Set([...tabMatches, ...captionMatches])].filter(Boolean);
  const tabs = extractedTabs.length > 0 ? extractedTabs : [input.upcomingTab || "Upcoming", input.inTransitTab || "In Transit"];

  const upcomingTab = recommendedTab(tabs, "upcoming", input.upcomingTab);
  const inTransitTab = recommendedTab(tabs, "in_transit", input.inTransitTab);

  const [upcoming, inTransit] = await Promise.all([
    readSheetRows(spreadsheetId, upcomingTab),
    readSheetRows(spreadsheetId, inTransitTab),
  ]);

  return {
    spreadsheetId,
    displayName,
    tabs,
    upcomingTab,
    inTransitTab,
    mapping: {
      upcoming: suggestFieldMapping(upcoming.headers),
      in_transit: suggestFieldMapping(inTransit.headers),
    },
    preview: {
      upcoming: upcoming.rows.slice(0, 5).map((row) => row.values),
      in_transit: inTransit.rows.slice(0, 5).map((row) => row.values),
    },
    headers: { upcoming: upcoming.headers, in_transit: inTransit.headers },
  };
}
