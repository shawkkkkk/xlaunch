import { NextResponse } from "next/server";

function present(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function GET() {
  return NextResponse.json(
    {
      xMoney: {
        solana: present("XLAUNCH_XMONEY_SOL_TREASURY"),
        robinhood: present("XLAUNCH_XMONEY_EVM_TREASURY"),
      },
      charity: {
        pumpfun:
          present("DONATE_GG_API_KEY") &&
          present("XLAUNCH_DONATE_SOL_TREASURY"),
      },
      xAuth: present("X_API_CLIENT_ID"),
      embeddedWallets:
        present("NEXT_PUBLIC_PRIVY_APP_ID") &&
        present("PRIVY_APP_SECRET"),
      bot:
        present("X_BOT_USER_ID") &&
        present("X_BOT_ACCESS_TOKEN"),
    },
    {
      headers: {
        "cache-control": "public, max-age=30, s-maxage=60",
      },
    },
  );
}
