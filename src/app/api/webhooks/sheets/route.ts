import { NextResponse } from "next/server";
import { syncAllActiveSources, syncSource, syncSourceBySpreadsheetId } from "@/lib/sync";

export const runtime = "nodejs";

async function handleWebhook(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let spreadsheetId = searchParams.get("spreadsheetId");
    let sourceId = searchParams.get("sourceId");

    // Attempt to parse JSON body if present
    if (request.method === "POST") {
      try {
        const body = await request.json();
        if (body?.spreadsheetId) spreadsheetId = String(body.spreadsheetId).trim();
        if (body?.sourceId) sourceId = String(body.sourceId).trim();
      } catch {
        // Body was empty or not JSON
      }
    }

    let result;
    if (sourceId) {
      result = await syncSource(sourceId);
    } else if (spreadsheetId) {
      result = await syncSourceBySpreadsheetId(spreadsheetId);
    } else {
      result = await syncAllActiveSources();
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      message: "Real-time sync triggered successfully.",
      result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook processing failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  return handleWebhook(request);
}

export async function GET(request: Request) {
  return handleWebhook(request);
}

