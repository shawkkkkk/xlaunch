import { NextRequest, NextResponse } from "next/server";
import {
  donateRoutingConfigured,
  searchDonateCharities,
} from "@/lib/donate";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const term = request.nextUrl.searchParams.get("term") || "";
    const charities = term.trim()
      ? await searchDonateCharities(term, 12)
      : [];

    return NextResponse.json({
      charities,
      routingConfigured: donateRoutingConfigured(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Charity search failed.",
      },
      { status: 502 },
    );
  }
}
