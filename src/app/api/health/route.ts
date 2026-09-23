import { NextResponse } from "next/server";

export function GET() {
  const database = Boolean(process.env.DATABASE_URL);
  const auth = Boolean(process.env.XLAUNCH_AUTH_SECRET);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://launchonx.net";
  const solanaRpc = Boolean(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL,
  );
  const robinhoodRpc = Boolean(
    process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || process.env.ROBINHOOD_RPC_URL,
  );

  return NextResponse.json({
    status:
      database && auth && siteUrl.startsWith("https://") && solanaRpc && robinhoodRpc
        ? "ok"
        : "degraded",
    app: "xlaunch",
    registry: database,
    canonicalOrigin: siteUrl,
  });
}
