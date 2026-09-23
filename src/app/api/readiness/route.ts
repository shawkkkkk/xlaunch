import { NextResponse } from "next/server";

type Check = {
  key: string;
  label: string;
  ready: boolean;
  requiredForPublicLaunch: boolean;
  detail: string;
};

function present(name: string) {
  return Boolean(process.env[name]?.trim());
}

export async function GET() {
  const checks: Check[] = [
    {
      key: "database",
      label: "Canonical registry database",
      ready: present("DATABASE_URL"),
      requiredForPublicLaunch: true,
      detail: present("DATABASE_URL")
        ? "Configured"
        : "DATABASE_URL is missing",
    },
    {
      key: "authSecret",
      label: "Reservation/auth signing",
      ready: present("XLAUNCH_AUTH_SECRET"),
      requiredForPublicLaunch: true,
      detail: present("XLAUNCH_AUTH_SECRET")
        ? "Configured"
        : "XLAUNCH_AUTH_SECRET is missing",
    },
    {
      key: "siteUrl",
      label: "Canonical site origin",
      ready: (process.env.NEXT_PUBLIC_SITE_URL || "").startsWith("https://"),
      requiredForPublicLaunch: true,
      detail: process.env.NEXT_PUBLIC_SITE_URL || "NEXT_PUBLIC_SITE_URL is missing",
    },
    {
      key: "solanaRpc",
      label: "Solana RPC",
      ready: present("NEXT_PUBLIC_SOLANA_RPC_URL") || present("SOLANA_RPC_URL"),
      requiredForPublicLaunch: true,
      detail:
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
        process.env.SOLANA_RPC_URL ||
        "Solana RPC is missing",
    },
    {
      key: "robinhoodRpc",
      label: "Robinhood Chain RPC",
      ready: present("NEXT_PUBLIC_ROBINHOOD_RPC_URL") || present("ROBINHOOD_RPC_URL"),
      requiredForPublicLaunch: true,
      detail:
        process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL ||
        process.env.ROBINHOOD_RPC_URL ||
        "Robinhood Chain RPC is missing",
    },
    {
      key: "xOAuth",
      label: "X account sign-in",
      ready: present("X_API_CLIENT_ID"),
      requiredForPublicLaunch: false,
      detail: present("X_API_CLIENT_ID")
        ? "OAuth client configured"
        : "Profile/social account sign-in disabled",
    },
    {
      key: "xBot",
      label: "@xlaunchit automation",
      ready:
        present("X_BOT_USER_ID") &&
        present("X_BOT_ACCESS_TOKEN") &&
        (present("XLAUNCH_SOCIAL_WORKER_SECRET") || present("CRON_SECRET")),
      requiredForPublicLaunch: false,
      detail:
        present("X_BOT_USER_ID") && present("X_BOT_ACCESS_TOKEN")
          ? "Bot credentials configured"
          : "X bot replies disabled",
    },
    {
      key: "embeddedWallets",
      label: "Embedded EVM + Solana wallets",
      ready:
        present("NEXT_PUBLIC_PRIVY_APP_ID") &&
        present("PRIVY_APP_SECRET"),
      requiredForPublicLaunch: false,
      detail:
        present("NEXT_PUBLIC_PRIVY_APP_ID") && present("PRIVY_APP_SECRET")
          ? "Privy configured"
          : "Embedded wallets disabled; external wallets still work",
    },
    {
      key: "xMoneySol",
      label: "X Money routing · Solana",
      ready: present("XLAUNCH_XMONEY_SOL_TREASURY"),
      requiredForPublicLaunch: false,
      detail: present("XLAUNCH_XMONEY_SOL_TREASURY")
        ? "Settlement treasury configured"
        : "Author payout routing disabled on Solana venues",
    },
    {
      key: "xMoneyEvm",
      label: "X Money routing · Robinhood Chain",
      ready: present("XLAUNCH_XMONEY_EVM_TREASURY"),
      requiredForPublicLaunch: false,
      detail: present("XLAUNCH_XMONEY_EVM_TREASURY")
        ? "Settlement treasury configured"
        : "Author payout routing disabled on Pons",
    },
    {
      key: "donate",
      label: "Donate.gg charity routing",
      ready:
        present("DONATE_GG_API_KEY") &&
        present("XLAUNCH_DONATE_SOL_TREASURY"),
      requiredForPublicLaunch: false,
      detail:
        present("DONATE_GG_API_KEY") && present("XLAUNCH_DONATE_SOL_TREASURY")
          ? "Configured"
          : "Pump.fun charity routing disabled",
    },
  ];

  const launchBlocking = checks.filter(
    (check) => check.requiredForPublicLaunch && !check.ready,
  );

  return NextResponse.json({
    app: "xlaunch",
    status: launchBlocking.length ? "not_ready" : "ready",
    publicLaunchReady: launchBlocking.length === 0,
    botHandle: process.env.X_BOT_USERNAME || "xlaunchit",
    operatorHandle: process.env.X_AUTOMATION_OPERATOR_HANDLE || "ShayanelH",
    checks,
  });
}
