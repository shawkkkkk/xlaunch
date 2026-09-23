import { NextResponse } from "next/server";
import { getPumpCapabilities } from "@/lib/pump";

export const revalidate = 15;

export async function GET() {
  try {
    return NextResponse.json(await getPumpCapabilities());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pump.fun unavailable." },
      { status: 502 },
    );
  }
}
