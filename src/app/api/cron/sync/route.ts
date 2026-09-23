import { NextResponse } from "next/server";
import { syncAllActiveSources } from "@/lib/sync";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Automatic sync is not configured. Set CRON_SECRET." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const results = await syncAllActiveSources();
  return NextResponse.json({ syncedAt: new Date().toISOString(), results }, { status: results.some((result) => !result.ok) ? 207 : 200 });
}
