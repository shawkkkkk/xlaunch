export type FeeRoute = "author_xmoney" | "developer" | "custom" | "charity" | "holder_rewards";

export type FeeDestination = {
  route: FeeRoute;
  label: string;
  recipientHandle: string | null;
  recipientWallet: string | null;
  delivery: "x_money" | "wallet" | "donate_gg" | "holder_rewards";
};

function cleanHandle(handle?: string) {
  const value = (handle || "").trim().replace(/^@/, "");
  if (!value || !/^[A-Za-z0-9_]{1,15}$/.test(value)) {
    throw new Error("The source post author could not be resolved.");
  }
  return value;
}

function treasuryFor(venue: "stonkfun" | "pons" | "pumpfun") {
  const value =
    venue === "pons"
      ? process.env.XLAUNCH_XMONEY_EVM_TREASURY
      : process.env.XLAUNCH_XMONEY_SOL_TREASURY;
  if (!value?.trim()) {
    throw new Error(
      "X Money author routing is not live yet because the XLaunch settlement treasury is not configured.",
    );
  }
  return value.trim();
}

export function resolveFeeDestination(args: {
  venue: "stonkfun" | "pons" | "pumpfun";
  stonkMode?: "standard" | "reward";
  route: FeeRoute;
  developerWallet: string;
  customWallet?: string;
  authorHandle?: string;
}): FeeDestination {
  if ((args.venue === "stonkfun" && args.stonkMode === "reward") || args.route === "holder_rewards") {
    return {
      route: "holder_rewards",
      label: "Holder rewards",
      recipientHandle: null,
      recipientWallet: null,
      delivery: "holder_rewards",
    };
  }

  if (args.route === "author_xmoney") {
    const handle = cleanHandle(args.authorHandle);
    return {
      route: "author_xmoney",
      label: `@${handle} via X Money`,
      recipientHandle: handle,
      recipientWallet: treasuryFor(args.venue),
      delivery: "x_money",
    };
  }

  if (args.route === "charity") {
    if (args.venue !== "pumpfun") {
      throw new Error("Donate.gg charity routing is currently available on Pump.fun launches.");
    }
    const treasury = process.env.XLAUNCH_DONATE_SOL_TREASURY?.trim();
    if (!treasury) {
      throw new Error(
        "Donate.gg charity routing is not configured yet. XLaunch needs its Solana donation treasury.",
      );
    }
    return {
      route: "charity",
      label: "Charity via Donate.gg",
      recipientHandle: null,
      recipientWallet: treasury,
      delivery: "donate_gg",
    };
  }

  if (args.route === "custom") {
    const wallet = (args.customWallet || "").trim();
    if (!wallet) throw new Error("Enter the custom fee wallet.");
    return {
      route: "custom",
      label: "Custom wallet",
      recipientHandle: null,
      recipientWallet: wallet,
      delivery: "wallet",
    };
  }

  if (!args.developerWallet.trim()) throw new Error("Developer wallet is required.");
  return {
    route: "developer",
    label: "Developer wallet",
    recipientHandle: null,
    recipientWallet: args.developerWallet.trim(),
    delivery: "wallet",
  };
}
