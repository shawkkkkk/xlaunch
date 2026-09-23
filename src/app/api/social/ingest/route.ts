import { NextRequest, NextResponse } from "next/server";
import { getRegistryRecord, getSocialAccount, upsertSocialCommand } from "@/lib/db";
import { parseSocialLaunchCommand } from "@/lib/social-command";
import { createSocialConfirmationToken } from "@/lib/social-token";

export const runtime = "nodejs";

function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://xlaunch.it").replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.XLAUNCH_SOCIAL_INGEST_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const commandPostId = String(body.commandPostId || "");
    const sourcePostId = String(body.parentPostId || "");
    const xUserId = String(body.xUserId || "");
    const authorHandle = String(body.authorHandle || "").replace(/^@/, "");
    const text = String(body.text || "");

    if (!/^\d+$/.test(commandPostId) || !/^\d+$/.test(sourcePostId)) {
      throw new Error("The X launch command must be a direct reply to a valid X post.");
    }
    if (!xUserId || !/^[A-Za-z0-9_]{1,15}$/.test(authorHandle)) {
      throw new Error("The command author could not be verified.");
    }

    const intent = parseSocialLaunchCommand(text);
    const existing = await getRegistryRecord(sourcePostId);
    if (existing?.status === "live") {
      return NextResponse.json({
        state: "already_tokenized",
        sourcePostId,
        venue: existing.venue,
        tokenAddress: existing.token_address,
        url: `${siteOrigin()}/post/${sourcePostId}`,
      });
    }

    const account = await getSocialAccount(xUserId);
    const requiredChain = intent.venue === "pons" ? "evm" : "solana";
    const hasWallet =
      requiredChain === "evm"
        ? Boolean((account as any)?.evm_wallet)
        : Boolean((account as any)?.solana_wallet);

    const { token, hash } = createSocialConfirmationToken({
      commandPostId,
      sourcePostId,
      xUserId,
    });
    await upsertSocialCommand({
      commandPostId,
      sourcePostId,
      xUserId,
      authorHandle,
      venue: intent.venue,
      intent: intent as unknown as Record<string, unknown>,
      confirmationTokenHash: hash,
      status: hasWallet ? "ready" : "awaiting_wallet",
    });

    const url = new URL(`${siteOrigin()}/social/confirm/${commandPostId}`);

    return NextResponse.json({
      state: hasWallet ? "ready" : "wallet_link_required",
      commandPostId,
      sourcePostId,
      venue: intent.venue,
      requiredChain,
      confirmationUrl: url.toString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not ingest X launch command." },
      { status: 400 },
    );
  }
}
