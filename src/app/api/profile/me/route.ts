import { NextRequest, NextResponse } from "next/server";
import {
  getProfile,
  getProfileFeeEvents,
  getProfileTokens,
  getSocialAccount,
  getWalletActivity,
  upsertProfile,
} from "@/lib/db";
import { readXSession } from "@/lib/x-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = readXSession(request.cookies.get("xlaunch_x_session")?.value);
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    let profile = await getProfile(session.xUserId);
    if (!profile) {
      profile = await upsertProfile({
        xUserId: session.xUserId,
        xHandle: session.handle,
        displayName: session.displayName || "",
        avatarUrl: session.avatarUrl || "",
      });
    }

    const [tokens, fees, activity, legacyWallets] = await Promise.all([
      getProfileTokens(session.xUserId),
      getProfileFeeEvents(session.xUserId),
      getWalletActivity(session.xUserId),
      getSocialAccount(session.xUserId),
    ]);

    const social = legacyWallets as any;
    return NextResponse.json({
      authenticated: true,
      profile,
      wallets: {
        evm: profile.evm_wallet_address || social?.evm_wallet || null,
        solana: profile.solana_wallet_address || social?.solana_wallet || null,
        provider: profile.wallet_provider || null,
        embeddedProvisioningConfigured: Boolean(
          process.env.PRIVY_APP_ID?.trim() &&
          process.env.PRIVY_APP_SECRET?.trim(),
        ),
        keyExportConfigured: Boolean(
          process.env.PRIVY_APP_ID?.trim() &&
          process.env.PRIVY_APP_SECRET?.trim() &&
          process.env.XLAUNCH_ENABLE_KEY_EXPORT === "true",
        ),
      },
      tokens,
      fees,
      activity,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Profile unavailable." },
      { status: 500 },
    );
  }
}
