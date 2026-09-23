import { NextRequest, NextResponse } from "next/server";
import { refreshMarketIndex } from "@/lib/market-indexer";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret =
    process.env.XLAUNCH_MARKET_WORKER_SECRET ||
    process.env.CRON_SECRET;
  return Boolean(
    secret &&
      request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await refreshMarketIndex();
    return NextResponse.json({
      ok: true,
      source: "DexScreener",
      refreshedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Market refresh failed.",
      },
      { status: 500 },
    );
  }
}
