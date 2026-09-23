import { NextRequest, NextResponse } from "next/server";
import {
  getSocialCommand,
  upsertSocialAccount,
  updateSocialCommandStatus,
} from "@/lib/db";
import { verifyReservationProof } from "@/lib/auth";
import { verifySocialConfirmationToken } from "@/lib/social-token";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const commandPostId = String(body.commandPostId || "");
    const token = String(body.token || "");
    const wallet = String(body.wallet || "").trim();

    if (!/^\d+$/.test(commandPostId) || !token || !wallet) {
      throw new Error("Invalid X wallet-link request.");
    }

    const command = await getSocialCommand(commandPostId) as any;
    if (!command) {
      return NextResponse.json({ error: "Unknown X launch command." }, { status: 404 });
    }
    if (!verifySocialConfirmationToken(token, String(command.confirmation_token_hash))) {
      return NextResponse.json({ error: "Invalid social confirmation token." }, { status: 403 });
    }

    await verifyReservationProof({
      token: String(body.auth?.token || ""),
      signature: String(body.auth?.signature || ""),
      postId: String(command.source_post_id),
      venue: command.venue,
      wallet,
    });

    const account = await upsertSocialAccount({
      xUserId: String(command.x_user_id),
      xHandle: String(command.author_handle),
      solanaWallet: command.venue === "pons" ? null : wallet,
      evmWallet: command.venue === "pons" ? wallet : null,
    });

    await updateSocialCommandStatus({
      commandPostId,
      status: "ready",
    });

    return NextResponse.json({
      account,
      linkedWallet: wallet,
      chain: command.venue === "pons" ? "robinhood" : "solana",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not link wallet." },
      { status: 400 },
    );
  }
}
