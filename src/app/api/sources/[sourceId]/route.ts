import { NextResponse } from "next/server";
import { getSource, updateSource } from "@/lib/db";
import { EMPTY_SOURCE_MAPPING, type MappingField, type SourceMapping } from "@/lib/domain";
import { extractSpreadsheetId } from "@/lib/sheet";

type SourceRequest = { displayName?: string; spreadsheetUrl?: string; upcomingTab?: string; inTransitTab?: string; mapping?: SourceMapping; isActive?: boolean };

function normalize(payload: SourceRequest) {
  const displayName = payload.displayName?.trim();
  const spreadsheetUrl = payload.spreadsheetUrl?.trim();
  const upcomingTab = payload.upcomingTab?.trim();
  const inTransitTab = payload.inTransitTab?.trim();
  if (!displayName || !spreadsheetUrl || !upcomingTab || !inTransitTab) throw new Error("Name, Google Sheets link, Upcoming tab, and In Transit tab are required.");
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  if (!spreadsheetId.match(/^[a-zA-Z0-9_-]+$/)) throw new Error("Enter a valid Google Sheets link or spreadsheet ID.");
  const mapQueue = (queue: "upcoming" | "in_transit") => Object.fromEntries(Object.entries(payload.mapping?.[queue] ?? {}).map(([field, header]) => [field, String(header ?? "").trim()]).filter(([, header]) => header)) as Partial<Record<MappingField, string>>;
  return { displayName, spreadsheetUrl, spreadsheetId, upcomingTab, inTransitTab, mapping: { upcoming: mapQueue("upcoming"), in_transit: mapQueue("in_transit") }, isActive: payload.isActive ?? true };
}

export async function GET(_: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const source = getSource((await params).sourceId);
  return source ? NextResponse.json({ source }) : NextResponse.json({ error: "Source not found." }, { status: 404 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  try {
    const source = updateSource((await params).sourceId, normalize(await request.json()));
    return source ? NextResponse.json({ source }) : NextResponse.json({ error: "Source not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save source." }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  try {
    const { deleteSource } = await import("@/lib/db");
    const ok = deleteSource((await params).sourceId);
    return ok
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: "Source not found or already deleted." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete source." }, { status: 400 });
  }
}

