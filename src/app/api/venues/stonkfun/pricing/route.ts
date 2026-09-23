import { NextRequest, NextResponse } from "next/server";
import { getStonkFunPricing } from "@/lib/stonkfun";

export async function GET(request: NextRequest) {
  try {
    const quoteMint = request.nextUrl.searchParams.get("quoteMint") ?? "";
    return NextResponse.json(await getStonkFunPricing(quoteMint));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Pricing unavailable." }, { status: 400 });
  }
}
