import { NextResponse } from "next/server";
import { syncSource } from "@/lib/sync";

export async function POST(_: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  try {
    return NextResponse.json(await syncSource((await params).sourceId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync source.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
