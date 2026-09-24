import { NextResponse } from "next/server";
import { getDashboardStats, listConsignments, listSources } from "@/lib/db";
import { syncAllActiveSources, syncSource } from "@/lib/sync";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shouldSync = searchParams.get("sync") === "true";
    const sourceId = searchParams.get("sourceId") ?? undefined;
    const query = searchParams.get("q") ?? undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 2000;

    let syncResults = null;
    if (shouldSync) {
      if (sourceId) {
        syncResults = await syncSource(sourceId);
      } else {
        syncResults = await syncAllActiveSources();
      }
    }

    const consignments = listConsignments({ sourceId, query, limit });
    const stats = getDashboardStats();
    const sources = listSources().map((s) => ({
      id: s.id,
      displayName: s.displayName,
      spreadsheetId: s.spreadsheetId,
      isActive: s.isActive,
      lastSyncedAt: s.lastSyncedAt,
      lastSyncError: s.lastSyncError,
    }));

    return NextResponse.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      syncResults,
      stats,
      sources,
      consignments,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch consignments.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

