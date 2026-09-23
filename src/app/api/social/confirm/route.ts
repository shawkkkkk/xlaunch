import { NextRequest, NextResponse } from "next/server";
import { getRegistryRecord, getSocialAccount, getSocialCommand } from "@/lib/db";
import { verifySocialConfirmationToken } from "@/lib/social-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const commandPostId = request.nextUrl.searchParams.get("command") || "";
    const token = request.nextUrl.searchParams.get("token") || "";
    if (!/^\d+$/.test(commandPostId) || !token) throw new Error("Invalid confirmation link.");

    const command = await getSocialCommand(commandPostId) as any;
    if (!command) return NextResponse.json({ error: "Unknown social launch command." }, { status: 404 });
    if (!verifySocialConfirmationToken(token, String(command.confirmation_token_hash))) {
      return NextResponse.json({ error: "Confirmation link is invalid." }, { status: 403 });
    }

    const registry = await getRegistryRecord(String(command.source_post_id));
    if (registry?.status === "live") {
      return NextResponse.json({
        state: "already_tokenized",
        command,
        registry,
      });
    }

    const account = await getSocialAccount(String(command.x_user_id)) as any;
    const wallet =
      command.venue === "pons"
        ? account?.evm_wallet || null
        : account?.solana_wallet || null;

    return NextResponse.json({
      state: wallet ? "ready" : "wallet_link_required",
      command: {
        commandPostId: command.command_post_id,
        sourcePostId: command.source_post_id,
        authorHandle: command.author_handle,
        venue: command.venue,
        intent: command.intent,
        status: command.status,
      },
      linkedWallet: wallet,
      sourceUrl: `https://x.com/i/status/${command.source_post_id}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not verify confirmation link." },
      { status: 400 },
    );
  }
}
