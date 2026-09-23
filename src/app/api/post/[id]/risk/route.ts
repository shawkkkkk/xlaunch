import { NextResponse } from "next/server";
import { getRegistryRecord } from "@/lib/db";
import { buildTokenRiskSnapshot } from "@/lib/token-risk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid X post id." }, { status: 400 });
  }

  const record = await getRegistryRecord(id).catch(() => null);
  if (!record || record.status !== "live" || !record.token_address) {
    return NextResponse.json(
      { error: "Confirmed token not found." },
      { status: 404 },
    );
  }

  try {
    const snapshot = await buildTokenRiskSnapshot(record);
    return NextResponse.json(snapshot, {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Risk scan temporarily unavailable.",
      },
      {
        status: 502,
        headers: { "cache-control": "no-store, max-age=0" },
      },
    );
  }
}
