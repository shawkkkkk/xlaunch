import { NextRequest, NextResponse } from "next/server";
import { parseSocialLaunchCommand } from "@/lib/social-command";

export const runtime = "nodejs";

/**
 * Internal parser/preview endpoint for X social commands.
 * It deliberately does not launch or reserve anything by itself.
 * The X ingestion worker must separately verify the author, target parent post,
 * linked wallet, replay/idempotency key, and venue configuration.
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.XLAUNCH_SOCIAL_INGEST_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const commandPostId = String(body.commandPostId || "");
    const parentPostId = String(body.parentPostId || "");
    const authorHandle = String(body.authorHandle || "").replace(/^@/, "");
    const text = String(body.text || "");

    if (!/^\d+$/.test(commandPostId) || !/^\d+$/.test(parentPostId)) {
      throw new Error("A social launch must be a reply to a valid X post.");
    }
    if (commandPostId === parentPostId) {
      throw new Error("The command post cannot be its own launch source.");
    }
    if (!/^[A-Za-z0-9_]{1,15}$/.test(authorHandle)) {
      throw new Error("Invalid command author.");
    }

    const intent = parseSocialLaunchCommand(text);

    return NextResponse.json({
      commandPostId,
      sourcePostId: parentPostId,
      authorHandle,
      sourceKey: `x:${parentPostId}`,
      intent,
      next: "wallet_auth_required",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid social launch command." },
      { status: 400 },
    );
  }
}
