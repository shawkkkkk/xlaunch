import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    app: "xlaunch",
    registry: Boolean(process.env.DATABASE_URL),
    canonicalOrigin: process.env.NEXT_PUBLIC_SITE_URL || "https://xlaunch.it",
  });
}
