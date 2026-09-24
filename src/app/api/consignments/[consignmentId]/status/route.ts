import { NextResponse } from "next/server";
import { updateConsignmentStatus } from "@/lib/db";
import { APP_STATUSES, type AppStatus } from "@/lib/domain";

export async function POST(request: Request, { params }: { params: Promise<{ consignmentId: string }> }) {
  try {
    const body = (await request.json()) as { status?: AppStatus; note?: string; changedBy?: string };
    if (!body.status || !APP_STATUSES.includes(body.status) || body.status === "active") {
      return NextResponse.json({ error: "Choose Delivered or RTD." }, { status: 400 });
    }
    const result = await updateConsignmentStatus(
      (await params).consignmentId,
      body.status,
      body.note,
      body.changedBy?.trim() || "Logistics team",
    );
    return result ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Consignment not found." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "The status update request was invalid." }, { status: 400 });
  }
}
