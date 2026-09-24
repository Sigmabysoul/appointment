import { NextResponse } from "next/server";
import { createSource, listSources } from "@/lib/db";
import { EMPTY_SOURCE_MAPPING, type MappingField, type SourceMapping } from "@/lib/domain";
import { extractSpreadsheetId } from "@/lib/sheet";

type SourceRequest = {
  displayName?: string;
  spreadsheetUrl?: string;
  upcomingTab?: string;
  inTransitTab?: string;
  mapping?: SourceMapping;
  isActive?: boolean;
};

function cleanedMapping(value: SourceMapping | undefined): SourceMapping {
  const map = (queue: "upcoming" | "in_transit") => Object.fromEntries(
    Object.entries(value?.[queue] ?? {})
      .map(([field, header]) => [field, String(header ?? "").trim()])
      .filter(([, header]) => header),
  ) as Partial<Record<MappingField, string>>;
  return { upcoming: map("upcoming"), in_transit: map("in_transit") };
}

function validatePayload(payload: SourceRequest) {
  const displayName = payload.displayName?.trim();
  const spreadsheetUrl = payload.spreadsheetUrl?.trim();
  const upcomingTab = payload.upcomingTab?.trim();
  const inTransitTab = payload.inTransitTab?.trim();
  if (!displayName || !spreadsheetUrl || !upcomingTab || !inTransitTab) {
    throw new Error("Name, Google Sheets link, Upcoming tab, and In Transit tab are required.");
  }
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  if (!spreadsheetId.match(/^[a-zA-Z0-9_-]+$/)) throw new Error("Enter a valid Google Sheets link or spreadsheet ID.");
  return { displayName, spreadsheetUrl, spreadsheetId, upcomingTab, inTransitTab, mapping: cleanedMapping(payload.mapping), isActive: payload.isActive ?? true };
}

export async function GET() {
  return NextResponse.json({ sources: listSources() });
}

export async function POST(request: Request) {
  try {
    const source = createSource(validatePayload(await request.json()));
    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add source." }, { status: 400 });
  }
}
