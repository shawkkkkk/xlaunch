import { NextRequest, NextResponse } from "next/server";
import { buildLaunchMetadata } from "@/lib/metadata";
import { reservePost } from "@/lib/db";
import { parseXPostUrl } from "@/lib/xpost";

export async function POST(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("Canonical registry is not configured yet.");

    const body = await request.json();
    const venue = body.venue === "pons" ? "pons" : body.venue === "stonkfun" ? "stonkfun" : null;
    if (!venue) throw new Error("Invalid venue.");

    const post = parseXPostUrl(String(body.postUrl ?? ""));
    if (post.id !== String(body.postId ?? "")) throw new Error("Source post does not match.");

    const wallet = String(body.wallet ?? "").trim();
    if (!wallet) throw new Error("Wallet is required.");

    const metadata = buildLaunchMetadata({
      postId: post.id,
      postUrl: post.canonicalUrl,
      name: String(body.name ?? ""),
      symbol: String(body.symbol ?? ""),
      description: String(body.description ?? ""),
      image: String(body.image ?? ""),
      website: String(body.website ?? ""),
      telegram: String(body.telegram ?? ""),
      discord: String(body.discord ?? ""),
      farcaster: String(body.farcaster ?? ""),
    });

    const record = await reservePost({
      postId: post.id,
      postUrl: metadata.source.postUrl,
      venue,
      chain: venue === "pons" ? "robinhood" : "solana",
      wallet,
      tokenName: metadata.name,
      tokenSymbol: metadata.symbol,
      metadata,
    });

    if (!record) {
      return NextResponse.json(
        { error: "This post is already reserved or tokenized through XLaunch." },
        { status: 409 },
      );
    }

    return NextResponse.json({ record, metadata });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reservation failed." },
      { status: 400 },
    );
  }
}
