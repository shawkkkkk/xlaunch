import { NextRequest, NextResponse } from "next/server";
import { validatePonsPair } from "@/lib/pons";

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address") || "ETH";
    const config = Number(request.nextUrl.searchParams.get("config") || 0);
    return NextResponse.json(await validatePonsPair(address, config));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Pair validation failed." }, { status: 400 });
  }
}
