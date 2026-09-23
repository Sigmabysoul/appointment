import { NextResponse } from "next/server";
import { discoverSheet } from "@/lib/sheet";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { spreadsheetUrl?: string; upcomingTab?: string; inTransitTab?: string };
    if (!body.spreadsheetUrl?.trim()) return NextResponse.json({ error: "Paste a Google Sheets link first." }, { status: 400 });
    return NextResponse.json(await discoverSheet({
      spreadsheetUrl: body.spreadsheetUrl,
      upcomingTab: body.upcomingTab,
      inTransitTab: body.inTransitTab,
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read the Google Sheet." }, { status: 400 });
  }
}
