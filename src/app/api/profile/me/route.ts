import { NextRequest, NextResponse } from "next/server";
import {
  getProfile,
  getProfileFeeEvents,
  getProfileTokens,
  getWalletActivity,
} from "@/lib/db";
import { readXSession } from "@/lib/x-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = readXSession(request.cookies.get("xlaunch_x_session")?.value);
  if (!session) {
    return NextResponse.json({ error: "Sign in with X." }, { status: 401 });
  }

  const [profile, tokens, fees, activity] = await Promise.all([
    getProfile(session.xUserId),
    getProfileTokens(session.xUserId),
    getProfileFeeEvents(session.xUserId),
    getWalletActivity(session.xUserId),
  ]);

  return NextResponse.json({
    session,
    profile,
    tokens,
    fees,
    activity,
    embeddedWalletsConfigured: Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID),
  });
}
