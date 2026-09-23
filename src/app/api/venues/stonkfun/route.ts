import { NextResponse } from "next/server";
import { getStonkFunCapabilities } from "@/lib/stonkfun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    return NextResponse.json(await getStonkFunCapabilities());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "StonkFun unavailable." }, { status: 502 });
  }
}
