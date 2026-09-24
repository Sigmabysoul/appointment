import { NextResponse } from "next/server";
import { getSource } from "@/lib/db";
import { readSheetRows } from "@/lib/sheet";

export async function GET(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const source = await getSource((await params).sourceId);
  if (!source) return NextResponse.json({ error: "Source not found." }, { status: 404 });
  const queue = new URL(request.url).searchParams.get("queue");
  if (queue !== "upcoming" && queue !== "in_transit") return NextResponse.json({ error: "Choose upcoming or in_transit." }, { status: 400 });
  try {
    const tab = queue === "upcoming" ? source.upcomingTab : source.inTransitTab;
    const result = await readSheetRows(source.spreadsheetId, tab);
    return NextResponse.json({ headers: result.headers, rowCount: result.rows.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read sheet headers." }, { status: 400 });
  }
}
