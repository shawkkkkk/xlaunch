import { NextRequest, NextResponse } from "next/server";
import {
  getRegistryRecord,
  getSocialCommand,
  updateSocialCommandStatus,
} from "@/lib/db";
import { readXSession } from "@/lib/x-oauth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const commandPostId = String(body.commandPostId || "");
    const postId = String(body.postId || "");
    const tokenAddress = String(body.tokenAddress || "");
    const txHash = String(body.txHash || "");

    if (!/^\d+$/.test(commandPostId) || !/^\d+$/.test(postId)) {
      throw new Error("Invalid social launch completion.");
    }

    const command = await getSocialCommand(commandPostId) as any;
    if (!command) {
      return NextResponse.json({ error: "Unknown social launch command." }, { status: 404 });
    }
    const session = readXSession(request.cookies.get("xlaunch_x_session")?.value);
    if (!session || String(session.xUserId) !== String(command.x_user_id)) {
      return NextResponse.json(
        { error: "The X account that wrote this command must be signed in." },
        { status: 403 },
      );
    }
    if (String(command.source_post_id) !== postId) {
      throw new Error("Social command source does not match the launched post.");
    }

    const registry = await getRegistryRecord(postId);
    if (
      !registry ||
      registry.status !== "live" ||
      registry.token_address !== tokenAddress ||
      registry.tx_hash?.toLowerCase() !== txHash.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "Canonical XLaunch registry has not verified this launch." },
        { status: 409 },
      );
    }

    const updated = await updateSocialCommandStatus({
      commandPostId,
      status: "launched",
      tokenAddress,
      txHash,
    });

    return NextResponse.json({
      command: updated,
      tokenUrl: `https://xlaunch.it/post/${postId}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not complete social launch." },
      { status: 400 },
    );
  }
}
