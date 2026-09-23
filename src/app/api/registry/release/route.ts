import { NextRequest, NextResponse } from "next/server";
import { getRegistryRecord, releaseReservedPost } from "@/lib/db";
import {
  verifyReservationProof,
  verifyReservationReleaseToken,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const postId = String(body.postId ?? "");
    const venue = String(body.venue ?? "") as "stonkfun" | "pons" | "pumpfun";
    const wallet = String(body.wallet ?? "").trim();

    if (!/^\d+$/.test(postId)) throw new Error("Invalid X post id.");
    if (!["stonkfun", "pons", "pumpfun"].includes(venue)) {
      throw new Error("Invalid launch venue.");
    }
    if (!wallet) throw new Error("Wallet is required.");

    const releaseToken = String(body.releaseToken ?? "");
    if (releaseToken) {
      verifyReservationReleaseToken({
        token: releaseToken,
        postId,
        venue,
        wallet,
      });
    } else {
      await verifyReservationProof({
        token: String(body.auth?.token ?? ""),
        signature: String(body.auth?.signature ?? ""),
        postId,
        venue,
        wallet,
      });
    }

    const record = await getRegistryRecord(postId);
    if (!record) {
      return NextResponse.json({ released: true, record: null });
    }
    if (record.status === "live") {
      return NextResponse.json(
        { error: "This post is already tokenized and cannot be released." },
        { status: 409 },
      );
    }

    const released = await releaseReservedPost({ postId, wallet, venue });
    if (!released) {
      return NextResponse.json(
        { error: "This reservation belongs to another wallet or venue." },
        { status: 403 },
      );
    }

    return NextResponse.json({ released: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not release reservation." },
      { status: 400 },
    );
  }
}
