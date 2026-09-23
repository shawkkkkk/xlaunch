import { NextRequest, NextResponse } from "next/server";
import { reservePost } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("Canonical registry is not configured yet.");
    const body = await request.json();
    const venue = body.venue === "pons" ? "pons" : body.venue === "stonkfun" ? "stonkfun" : null;
    if (!venue) throw new Error("Invalid venue.");
    if (!/^\d+$/.test(String(body.postId ?? ""))) throw new Error("Invalid post.");
    if (!String(body.wallet ?? "").trim()) throw new Error("Wallet is required.");
    const record = await reservePost({
      postId: String(body.postId),
      venue,
      chain: venue === "pons" ? "robinhood" : "solana",
      wallet: String(body.wallet),
    });
    if (!record) return NextResponse.json({ error: "This post is already reserved or tokenized." }, { status: 409 });
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reservation failed." }, { status: 400 });
  }
}
