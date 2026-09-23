export type SocialVenue = "stonkfun" | "pons" | "pumpfun";

export type SocialLaunchIntent = {
  venue: SocialVenue;
  symbol?: string;
  name?: string;
  feeRoute?: "author_xmoney" | "developer" | "custom";
  customFeeTarget?: string;
  stonkMode?: "standard" | "reward";
  rewardPercent?: number;
  pair?: string;
};

function clean(text: string) {
  return text.replace(/@[A-Za-z0-9_]+/g, " ").replace(/\s+/g, " ").trim();
}

export function parseSocialLaunchCommand(text: string): SocialLaunchIntent {
  const value = clean(text);
  const lower = value.toLowerCase();

  if (!/\b(launch|deploy|tokenize|mint)\b/.test(lower)) {
    throw new Error("No launch command found.");
  }

  const venue: SocialVenue =
    /\bpump\.?fun\b|\bpumpfun\b/.test(lower)
      ? "pumpfun"
      : /\bstonk\s*fun\b|\bstonkfun\b/.test(lower)
        ? "stonkfun"
        : /\bpons\b/.test(lower)
          ? "pons"
          : (() => {
              throw new Error("Choose a venue: StonkFun, Pons, or Pump.fun.");
            })();

  const tickerMatch =
    value.match(/(?:\$|symbol\s+|ticker\s+)([A-Za-z0-9]{1,20})\b/i) ||
    value.match(/\bas\s+\$?([A-Za-z0-9]{1,20})\b/i);

  const nameMatch = value.match(/(?:called|named)\s+["“]?([^"”,$]+?)["”]?(?=\s+(?:with|on|paired|fees|reward|standard|$))/i);

  const feeToAuthor = /fees?\s+to\s+(?:the\s+)?(?:author|poster|creator)\b/i.test(value);
  const feeToDeveloper = /fees?\s+to\s+(?:me|developer|dev)\b/i.test(value);
  const feeTarget = value.match(/fees?\s+to\s+(@[A-Za-z0-9_]{1,15}|0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})/i);

  const rewardMatch = value.match(/(?:reward(?:\s+mode)?[^0-9]{0,12})?(\d+(?:\.\d+)?)\s*%/i);
  const pairMatch = value.match(/(?:paired?\s+with|pair\s+with|quote(?:d)?\s+in)\s+([A-Za-z0-9._-]+)/i);

  let feeRoute: SocialLaunchIntent["feeRoute"];
  let customFeeTarget: string | undefined;
  if (feeToAuthor) feeRoute = "author_xmoney";
  else if (feeToDeveloper) feeRoute = "developer";
  else if (feeTarget) {
    feeRoute = "custom";
    customFeeTarget = feeTarget[1];
  }

  const stonkMode =
    venue === "stonkfun"
      ? /\breward\b/i.test(value)
        ? "reward"
        : /\bstandard\b/i.test(value)
          ? "standard"
          : undefined
      : undefined;

  return {
    venue,
    symbol: tickerMatch?.[1]?.toUpperCase(),
    name: nameMatch?.[1]?.trim(),
    feeRoute,
    customFeeTarget,
    stonkMode,
    rewardPercent: rewardMatch ? Number(rewardMatch[1]) : undefined,
    pair: pairMatch?.[1],
  };
}
