import { NextRequest, NextResponse } from "next/server";
import { getExploreTokens, type ExploreSort } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("sort");
  const sort: ExploreSort =
    raw === "volume" || raw === "trending" || raw === "marketcap"
      ? raw
      : "newest";
  const limit = Math.max(
    1,
    Math.min(Number(request.nextUrl.searchParams.get("limit") || 50) || 50, 100),
  );

  const tokens = await getExploreTokens(sort, limit);
  return NextResponse.json({ sort, tokens });
}
