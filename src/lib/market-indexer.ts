import "server-only";

import {
  getLiveTokensForMarketIndex,
  upsertMarketSnapshot,
} from "@/lib/db";

type IndexedToken = {
  post_id: string;
  venue: "stonkfun" | "pons" | "pumpfun";
  chain: "solana" | "robinhood";
  token_address: string;
};

type DexPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string | null;
  txns?: Record<string, { buys?: number; sells?: number }>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  liquidity?: { usd?: number | null };
  fdv?: number | null;
  marketCap?: number | null;
  pairCreatedAt?: number | null;
};

const API = "https://api.dexscreener.com";

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function sameAddress(a: string, b: string, chain: string) {
  return chain === "robinhood"
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

function pairScore(pair: DexPair) {
  const liquidity = Number(pair.liquidity?.usd || 0);
  const volume = Number(pair.volume?.h24 || 0);
  return liquidity * 2 + volume;
}

function choosePair(pairs: DexPair[], token: IndexedToken) {
  return pairs
    .filter((pair) => {
      const base = String(pair.baseToken?.address || "");
      const quote = String(pair.quoteToken?.address || "");
      return (
        sameAddress(base, token.token_address, token.chain) ||
        sameAddress(quote, token.token_address, token.chain)
      );
    })
    .sort((a, b) => pairScore(b) - pairScore(a))[0];
}

async function fetchBatch(chain: "solana" | "robinhood", addresses: string[]) {
  const url =
    API +
    "/tokens/v1/" +
    encodeURIComponent(chain) +
    "/" +
    addresses.map(encodeURIComponent).join(",");
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `DexScreener ${chain} market request failed (${response.status}).`,
    );
  }
  const body = await response.json();
  return Array.isArray(body) ? (body as DexPair[]) : [];
}

export async function refreshMarketIndex() {
  const tokens = (await getLiveTokensForMarketIndex(1000)) as IndexedToken[];
  const byChain = {
    solana: tokens.filter((token) => token.chain === "solana"),
    robinhood: tokens.filter((token) => token.chain === "robinhood"),
  };

  const result = {
    total: tokens.length,
    indexed: 0,
    missing: 0,
    failedBatches: 0,
    chains: { solana: 0, robinhood: 0 },
  };

  for (const chain of ["solana", "robinhood"] as const) {
    for (const batch of chunks(byChain[chain], 30)) {
      try {
        const pairs = await fetchBatch(
          chain,
          batch.map((token) => token.token_address),
        );

        for (const token of batch) {
          const pair = choosePair(pairs, token);
          if (!pair) {
            result.missing += 1;
            continue;
          }

          const h24 = pair.txns?.h24;
          await upsertMarketSnapshot({
            postId: token.post_id,
            priceUsd: pair.priceUsd == null ? null : String(pair.priceUsd),
            marketCapUsd:
              pair.marketCap == null
                ? pair.fdv == null
                  ? null
                  : String(pair.fdv)
                : String(pair.marketCap),
            volume24hUsd:
              pair.volume?.h24 == null ? null : String(pair.volume.h24),
            liquidityUsd:
              pair.liquidity?.usd == null ? null : String(pair.liquidity.usd),
            priceChange24hPct:
              pair.priceChange?.h24 == null
                ? null
                : String(pair.priceChange.h24),
            trades24h:
              h24 == null
                ? null
                : Number(h24.buys || 0) + Number(h24.sells || 0),
            holders: null,
            source: `dexscreener:${pair.dexId || "unknown"}:${pair.pairAddress || "unknown"}`,
            sourceUpdatedAt: new Date().toISOString(),
          });

          result.indexed += 1;
          result.chains[chain] += 1;
        }
      } catch {
        result.failedBatches += 1;
      }
    }
  }

  return result;
}
