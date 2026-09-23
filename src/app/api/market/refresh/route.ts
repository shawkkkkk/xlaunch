import { NextRequest, NextResponse } from "next/server";
import {
  getLiveTokensForMarketIndex,
  upsertMarketSnapshot,
} from "@/lib/db";
import { fetchMarketSnapshot } from "@/lib/market";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret =
    process.env.XLAUNCH_MARKET_WORKER_SECRET ||
    process.env.CRON_SECRET;
  return Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const tokens = await getLiveTokensForMarketIndex(60);
  const updated: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];

  for (let offset = 0; offset < tokens.length; offset += 5) {
    const batch = tokens.slice(offset, offset + 5) as Array<any>;
    const results = await Promise.allSettled(
      batch.map(async (token) => {
        const snapshot = await fetchMarketSnapshot(String(token.token_address));
        if (!snapshot) {
          return {
            postId: String(token.post_id),
            tokenAddress: String(token.token_address),
            skipped: true,
            reason: "not_indexed",
          };
        }

        await upsertMarketSnapshot({
          postId: String(token.post_id),
          priceUsd: snapshot.priceUsd,
          marketCapUsd: snapshot.marketCapUsd,
          volume24hUsd: snapshot.volume24hUsd,
          liquidityUsd: snapshot.liquidityUsd,
          priceChange24hPct: snapshot.priceChange24hPct,
          trades24h: snapshot.trades24h,
          source: snapshot.source,
          sourceUpdatedAt: snapshot.sourceUpdatedAt,
        });

        return {
          postId: String(token.post_id),
          tokenAddress: String(token.token_address),
          primaryPair: snapshot.primaryPair,
        };
      }),
    );

    results.forEach((result, index) => {
      const token = batch[index];
      if (result.status === "fulfilled") {
        if ((result.value as any).skipped) skipped.push(result.value as any);
        else updated.push(result.value as any);
      } else {
        skipped.push({
          postId: String(token.post_id),
          tokenAddress: String(token.token_address),
          reason:
            result.reason instanceof Error
              ? result.reason.message
              : "market_refresh_failed",
        });
      }
    });
  }

  return NextResponse.json({
    scanned: tokens.length,
    updated: updated.length,
    skipped: skipped.length,
    results: updated,
    skippedTokens: skipped,
  });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
