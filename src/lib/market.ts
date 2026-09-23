import "server-only";

type DexPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };

function sameAddress(a: string | undefined, b: string) {
  if (!a) return false;
  return a === b || a.toLowerCase() === b.toLowerCase();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchDexScreenerMarket(
  tokenAddress: string,
  chainId: string,
) {
  const endpoint =
    "https://api.dexscreener.com/token-pairs/v1/" +
    encodeURIComponent(chainId) +
    "/" +
    encodeURIComponent(tokenAddress);

  const response = await fetch(endpoint, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`DexScreener request failed (${response.status}).`);
  }

  const body = await response.json();
  const pairs = (Array.isArray(body) ? body : []) as DexPair[];
  const matches = pairs.filter(
    (pair) =>
      sameAddress(pair.baseToken?.address, tokenAddress) ||
      sameAddress(pair.quoteToken?.address, tokenAddress),
  );
  if (!matches.length) return null;

  const primary = [...matches].sort((a, b) => {
    const liquidityDelta = number(b.liquidity?.usd) - number(a.liquidity?.usd);
    if (liquidityDelta) return liquidityDelta;
    return number(b.volume?.h24) - number(a.volume?.h24);
  })[0];

  return {
    chainId: primary.chainId || chainId,
    dexId: primary.dexId || "unknown",
    pairAddress: primary.pairAddress || null,
    url:
      primary.url ||
      (primary.pairAddress
        ? `https://dexscreener.com/${primary.chainId || chainId}/${primary.pairAddress}`
        : null),
    baseToken: primary.baseToken || null,
    quoteToken: primary.quoteToken || null,
    priceNative: primary.priceNative || null,
    priceUsd: primary.priceUsd || null,
    marketCap: primary.marketCap ?? null,
    fdv: primary.fdv ?? null,
    liquidityUsd: primary.liquidity?.usd ?? null,
    volume24h: primary.volume?.h24 ?? null,
    priceChange24h: primary.priceChange?.h24 ?? null,
    buys24h: primary.txns?.h24?.buys ?? null,
    sells24h: primary.txns?.h24?.sells ?? null,
    pairCreatedAt: primary.pairCreatedAt ?? null,
    info: primary.info || null,
  };
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
