import "server-only";

type DexPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string };
  quoteToken?: { address?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
};

function sameAddress(a: string | undefined, b: string) {
  if (!a) return false;
  return a === b || a.toLowerCase() === b.toLowerCase();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchMarketSnapshot(tokenAddress: string) {
  const url = new URL("https://api.dexscreener.com/latest/dex/search");
  url.searchParams.set("q", tokenAddress);

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Market data request failed (${response.status}).`);
  }

  const body = await response.json();
  const pairs = (Array.isArray(body?.pairs) ? body.pairs : []) as DexPair[];
  const matches = pairs.filter(
    (pair) =>
      sameAddress(pair.baseToken?.address, tokenAddress) ||
      sameAddress(pair.quoteToken?.address, tokenAddress),
  );
  if (!matches.length) return null;

  const ranked = [...matches].sort(
    (a, b) => number(b.liquidity?.usd) - number(a.liquidity?.usd),
  );
  const primary = ranked[0];

  const volume24h = matches.reduce((sum, pair) => sum + number(pair.volume?.h24), 0);
  const liquidity = matches.reduce((sum, pair) => sum + number(pair.liquidity?.usd), 0);
  const trades24h = matches.reduce(
    (sum, pair) =>
      sum +
      number(pair.txns?.h24?.buys) +
      number(pair.txns?.h24?.sells),
    0,
  );

  return {
    priceUsd: primary.priceUsd || null,
    marketCapUsd:
      primary.marketCap != null
        ? String(primary.marketCap)
        : primary.fdv != null
          ? String(primary.fdv)
          : null,
    volume24hUsd: volume24h ? String(volume24h) : null,
    liquidityUsd: liquidity ? String(liquidity) : null,
    priceChange24hPct:
      primary.priceChange?.h24 != null
        ? String(primary.priceChange.h24)
        : null,
    trades24h: trades24h || null,
    source: "dexscreener",
    sourceUpdatedAt: new Date().toISOString(),
    primaryPair: {
      chainId: primary.chainId || null,
      dexId: primary.dexId || null,
      pairAddress: primary.pairAddress || null,
    },
  };
}
