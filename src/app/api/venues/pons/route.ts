import { NextResponse } from "next/server";
import { getPonsCapabilities } from "@/lib/pons";

export const revalidate = 15;

export async function GET() {
  try {
    return NextResponse.json(await getPonsCapabilities());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Pons unavailable." }, { status: 502 });
  }
}
