import { NextRequest, NextResponse } from "next/server";
import { getSocialCommand } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.XLAUNCH_SOCIAL_INGEST_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const commandPostId = request.nextUrl.searchParams.get("command") || "";
  if (!/^\d+$/.test(commandPostId)) {
    return NextResponse.json({ error: "Invalid command id." }, { status: 400 });
  }

  const command = await getSocialCommand(commandPostId);
  if (!command) return NextResponse.json({ error: "Unknown command." }, { status: 404 });
  return NextResponse.json({ command });
}
