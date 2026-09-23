import "server-only";

import { fetchDexScreenerMarket } from "@/lib/market";
import type { RegistryRecord } from "@/lib/db";

export type RiskSeverity = "critical" | "danger" | "warning" | "info";

export type TokenRiskWarning = {
  id: string;
  severity: RiskSeverity;
  title: string;
  detail: string;
  value?: string | null;
  source: "RugCheck" | "DexScreener" | "Blockscout" | "XLaunch";
};

export type TokenRiskSnapshot = {
  generatedAt: string;
  tokenAddress: string;
  chain: RegistryRecord["chain"];
  warnings: TokenRiskWarning[];
  coverage: {
    market: boolean;
    holders: boolean;
    authorities: boolean;
    clusters: boolean;
    bundles: boolean;
    honeypot: boolean;
  };
  metrics: {
    liquidityUsd: number | null;
    marketCapUsd: number | null;
    priceChange24hPct: number | null;
    buys24h: number | null;
    sells24h: number | null;
    topHolderPct: number | null;
    top10Pct: number | null;
    insiderPct: number | null;
    clusterCount: number | null;
    insiderAccounts: number | null;
    lpLockedPct: number | null;
    riskScore: number | null;
  };
  sources: string[];
};

type RugCheckRisk = {
  name?: string;
  value?: string;
  description?: string;
  level?: string;
};

type RugCheckHolder = {
  address?: string;
  owner?: string;
  pct?: number;
  insider?: boolean;
};

type RugCheckNetwork = {
  id?: string;
  size?: number;
  type?: string;
  tokenAmount?: number;
  activeAccounts?: number;
};

type RugCheckReport = {
  rugged?: boolean;
  creator?: string;
  token?: {
    mintAuthority?: string | null;
    freezeAuthority?: string | null;
    supply?: number | string;
  };
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  tokenMeta?: {
    name?: string;
    symbol?: string;
    mutable?: boolean;
  };
  fileMeta?: {
    name?: string;
    symbol?: string;
  };
  token_extensions?: {
    nonTransferable?: boolean;
    transferFeeConfig?: string | null;
    defaultAccountState?: string | null;
    permanentDelegate?: string | null;
  };
  topHolders?: RugCheckHolder[];
  knownAccounts?: Record<string, { name?: string; type?: string }>;
  risks?: RugCheckRisk[];
  score_normalised?: number;
  totalMarketLiquidity?: number;
  graphInsidersDetected?: number;
  insiderNetworks?: RugCheckNetwork[];
  markets?: Array<{
    lp?: {
      lpLockedPct?: number;
    };
  }>;
};

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(value: number | null) {
  return value == null ? "—" : value.toFixed(1) + "%";
}

function usd(value: number | null) {
  if (value == null) return "—";
  if (value >= 1_000_000) return "$" + (value / 1_000_000).toFixed(2) + "M";
  if (value >= 1_000) return "$" + (value / 1_000).toFixed(1) + "K";
  return "$" + value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function warningId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function severityRank(value: RiskSeverity) {
  return value === "critical" ? 4 : value === "danger" ? 3 : value === "warning" ? 2 : 1;
}

function normalizeRugSeverity(value?: string): RiskSeverity {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("critical")) return "critical";
  if (lower.includes("danger") || lower.includes("high")) return "danger";
  return "warning";
}

function uniqueWarnings(warnings: TokenRiskWarning[]) {
  const seen = new Set<string>();
  return warnings
    .filter((warning) => {
      const key = warning.id || warning.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      next: { revalidate: 30 },
    });
    if (!response.ok) throw new Error("Request failed (" + response.status + ").");
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRugCheck(mint: string): Promise<RugCheckReport | null> {
  try {
    const report = await fetchJsonWithTimeout(
      "https://api.rugcheck.xyz/v1/tokens/" + encodeURIComponent(mint) + "/report",
    );
    return report && typeof report === "object" ? (report as RugCheckReport) : null;
  } catch {
    return null;
  }
}

function knownSystemHolder(
  holder: RugCheckHolder,
  knownAccounts: RugCheckReport["knownAccounts"],
) {
  const candidates = [holder.owner, holder.address].filter(Boolean) as string[];
  return candidates.some((address) => {
    const known = knownAccounts?.[address];
    if (!known) return false;
    const type = String(known.type || "").toUpperCase();
    const name = String(known.name || "").toLowerCase();
    return (
      type === "AMM" ||
      type === "LOCKER" ||
      name.includes("burn") ||
      name.includes("pool") ||
      name.includes("vault")
    );
  });
}

function rugCheckWarnings(
  record: RegistryRecord,
  report: RugCheckReport,
  warnings: TokenRiskWarning[],
) {
  if (report.rugged === true) {
    warnings.push({
      id: "rugged-token",
      severity: "critical",
      title: "RUG / MALICIOUS STATE FLAGGED",
      detail:
        "The connected Solana security source currently marks this token as rugged. Verify the underlying on-chain evidence before interacting.",
      source: "RugCheck",
    });
  }

  for (const risk of Array.isArray(report.risks) ? report.risks : []) {
    const name = String(risk.name || "").trim();
    const detail = String(risk.description || "").trim();
    if (!name && !detail) continue;
    warnings.push({
      id: "rugcheck-" + warningId(name || detail),
      severity: normalizeRugSeverity(risk.level),
      title: (name || "ONCHAIN RISK").toUpperCase(),
      detail: detail || "RugCheck currently reports this on-chain risk.",
      value: risk.value ? String(risk.value) : null,
      source: "RugCheck",
    });
  }

  const mintAuthority = report.token?.mintAuthority ?? report.mintAuthority;
  const freezeAuthority = report.token?.freezeAuthority ?? report.freezeAuthority;

  if (mintAuthority) {
    warnings.push({
      id: "mint-authority",
      severity: "danger",
      title: "MINT AUTHORITY ACTIVE",
      detail:
        "Additional supply can still be minted by an authority. Supply is not cryptographically fixed.",
      source: "RugCheck",
    });
  }

  if (freezeAuthority) {
    warnings.push({
      id: "freeze-authority",
      severity: "danger",
      title: "FREEZE AUTHORITY ACTIVE",
      detail:
        "An authority can freeze token accounts. This can prevent affected holders from transferring or selling.",
      source: "RugCheck",
    });
  }

  if (report.token_extensions?.nonTransferable) {
    warnings.push({
      id: "non-transferable",
      severity: "critical",
      title: "NON-TRANSFERABLE TOKEN",
      detail: "The token currently has a non-transferable Token-2022 extension enabled.",
      source: "RugCheck",
    });
  }

  if (report.token_extensions?.permanentDelegate) {
    warnings.push({
      id: "permanent-delegate",
      severity: "danger",
      title: "PERMANENT DELEGATE",
      detail:
        "A permanent delegate is configured for this Token-2022 mint and may have elevated control over token accounts.",
      source: "RugCheck",
    });
  }

  if (report.token_extensions?.defaultAccountState) {
    warnings.push({
      id: "default-account-state",
      severity: "danger",
      title: "CUSTOM DEFAULT ACCOUNT STATE",
      detail:
        "New token accounts use a non-standard default account state. Review whether new accounts can be frozen or restricted.",
      source: "RugCheck",
    });
  }

  if (report.token_extensions?.transferFeeConfig) {
    warnings.push({
      id: "transfer-fee-config",
      severity: "warning",
      title: "TOKEN TRANSFER FEE ENABLED",
      detail:
        "The token uses a Token-2022 transfer-fee configuration. Transfers can incur token-level fees independent of the DEX.",
      source: "RugCheck",
    });
  }

  if (report.tokenMeta?.mutable) {
    warnings.push({
      id: "mutable-metadata",
      severity: "info",
      title: "METADATA CAN CHANGE",
      detail: "The token's on-chain metadata is currently mutable.",
      source: "RugCheck",
    });
  }

  const scannedName = String(report.tokenMeta?.name || report.fileMeta?.name || "").trim();
  const scannedSymbol = String(report.tokenMeta?.symbol || report.fileMeta?.symbol || "")
    .trim()
    .replace(/^\$/, "");
  if (
    (scannedName && scannedName.toLowerCase() !== record.token_name.trim().toLowerCase()) ||
    (scannedSymbol &&
      scannedSymbol.toLowerCase() !== record.token_symbol.trim().replace(/^\$/, "").toLowerCase())
  ) {
    warnings.push({
      id: "metadata-mismatch",
      severity: "danger",
      title: "TOKEN METADATA MISMATCH",
      detail:
        "The token name or ticker returned by the on-chain security scan does not match XLaunch's canonical registry record. Verify the contract address before trading.",
      source: "XLaunch",
    });
  }
}

function marketWarnings(
  market: Awaited<ReturnType<typeof fetchDexScreenerMarket>> | null,
  warnings: TokenRiskWarning[],
) {
  if (!market) return;

  const liquidity = finite(market.liquidityUsd);
  const marketCap = finite(market.marketCap ?? market.fdv);
  const change = finite(market.priceChange24h);
  const buys = finite(market.buys24h);
  const sells = finite(market.sells24h);

  if (liquidity != null) {
    if (liquidity < 2_000) {
      warnings.push({
        id: "very-low-liquidity",
        severity: "danger",
        title: "VERY LOW LIQUIDITY",
        detail:
          "The primary market has very little quoted liquidity. Even small trades may experience severe slippage or be difficult to exit.",
        value: usd(liquidity),
        source: "DexScreener",
      });
    } else if (liquidity < 10_000) {
      warnings.push({
        id: "low-liquidity",
        severity: "warning",
        title: "LOW LIQUIDITY",
        detail:
          "Liquidity is thin enough that larger trades may move the market materially.",
        value: usd(liquidity),
        source: "DexScreener",
      });
    }

    if (marketCap && marketCap > 0 && liquidity / marketCap < 0.02) {
      warnings.push({
        id: "thin-liquidity-vs-mcap",
        severity: "warning",
        title: "THIN LIQUIDITY VS. MARKET CAP",
        detail:
          "Quoted liquidity is below 2% of the reported market cap/FDV, which can make the displayed valuation difficult to exit at scale.",
        value: (100 * liquidity / marketCap).toFixed(2) + "%",
        source: "DexScreener",
      });
    }
  }

  if (change != null && Math.abs(change) >= 100) {
    warnings.push({
      id: "extreme-volatility",
      severity: "danger",
      title: "EXTREME VOLATILITY",
      detail:
        "The token has moved by at least 100% over the last 24 hours. Price can move sharply in either direction.",
      value: pct(change),
      source: "DexScreener",
    });
  } else if (change != null && Math.abs(change) >= 50) {
    warnings.push({
      id: "high-volatility",
      severity: "warning",
      title: "HIGH VOLATILITY",
      detail:
        "The token has moved by at least 50% over the last 24 hours. Expect unusually large price swings.",
      value: pct(change),
      source: "DexScreener",
    });
  }

  if (buys != null && sells != null) {
    if (sells >= 20 && buys > 0 && sells >= buys * 3) {
      warnings.push({
        id: "heavy-sell-pressure",
        severity: "danger",
        title: "HEAVY SELL PRESSURE",
        detail:
          "Recent sell transactions outnumber buys by at least 3:1. This is a live activity signal, not a prediction.",
        value: Math.round(buys) + " buys · " + Math.round(sells) + " sells",
        source: "DexScreener",
      });
    } else if (sells >= 20 && buys > 0 && sells >= buys * 2) {
      warnings.push({
        id: "sell-pressure",
        severity: "warning",
        title: "SELL PRESSURE",
        detail:
          "Recent sell transactions outnumber buys by at least 2:1. This is a live activity signal, not a prediction.",
        value: Math.round(buys) + " buys · " + Math.round(sells) + " sells",
        source: "DexScreener",
      });
    }

    if (buys >= 10 && sells === 0) {
      warnings.push({
        id: "no-sells-observed",
        severity: "warning",
        title: "NO SELLS OBSERVED",
        detail:
          "DexScreener currently reports buys but no sells in the 24-hour window. This does not prove a honeypot, but sellability should be verified.",
        value: Math.round(buys) + " buys · 0 sells",
        source: "DexScreener",
      });
    }
  }

  if (market.pairCreatedAt) {
    const ageMs = Date.now() - Number(market.pairCreatedAt);
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 2 * 60 * 60 * 1000) {
      warnings.push({
        id: "new-market",
        severity: "info",
        title: "NEW MARKET",
        detail:
          "This market is less than two hours old. Early holder distribution, liquidity and trading behavior can change quickly.",
        value: Math.max(1, Math.round(ageMs / 60_000)) + " min",
        source: "DexScreener",
      });
    }
  }
}

async function robinhoodHolderMetrics(tokenAddress: string, pairAddress?: string | null) {
  try {
    const base = "https://robinhoodchain.blockscout.com/api";
    const tokenUrl =
      base +
      "?module=token&action=getToken&contractaddress=" +
      encodeURIComponent(tokenAddress);
    const holdersUrl =
      base +
      "?module=token&action=getTokenHolders&contractaddress=" +
      encodeURIComponent(tokenAddress) +
      "&page=0&offset=50";

    const [tokenBody, holdersBody] = await Promise.all([
      fetchJsonWithTimeout(tokenUrl),
      fetchJsonWithTimeout(holdersUrl),
    ]);

    const totalRaw = String(tokenBody?.result?.totalSupply || "");
    if (!/^\d+$/.test(totalRaw) || !Array.isArray(holdersBody?.result)) return null;
    const total = BigInt(totalRaw);
    if (total <= 0n) return null;

    const excluded = new Set(
      [
        pairAddress?.toLowerCase(),
        "0x0000000000000000000000000000000000000000",
        "0x000000000000000000000000000000000000dead",
      ].filter(Boolean) as string[],
    );

    const percentages = holdersBody.result
      .filter((item: any) => !excluded.has(String(item?.address || "").toLowerCase()))
      .map((item: any) => {
        const raw = String(item?.value || "");
        if (!/^\d+$/.test(raw)) return 0;
        const value = BigInt(raw);
        return Number((value * 1_000_000n) / total) / 10_000;
      })
      .filter((value: number) => Number.isFinite(value) && value >= 0)
      .sort((a: number, b: number) => b - a);

    return {
      topHolderPct: percentages[0] ?? null,
      top10Pct: percentages.slice(0, 10).reduce((sum: number, value: number) => sum + value, 0),
    };
  } catch {
    return null;
  }
}

export async function buildTokenRiskSnapshot(record: RegistryRecord): Promise<TokenRiskSnapshot> {
  if (!record.token_address) {
    return {
      generatedAt: new Date().toISOString(),
      tokenAddress: "",
      chain: record.chain,
      warnings: [],
      coverage: {
        market: false,
        holders: false,
        authorities: false,
        clusters: false,
        bundles: false,
        honeypot: false,
      },
      metrics: {
        liquidityUsd: null,
        marketCapUsd: null,
        priceChange24hPct: null,
        buys24h: null,
        sells24h: null,
        topHolderPct: null,
        top10Pct: null,
        insiderPct: null,
        clusterCount: null,
        insiderAccounts: null,
        lpLockedPct: null,
        riskScore: null,
      },
      sources: [],
    };
  }

  const warnings: TokenRiskWarning[] = [];
  const sources = new Set<string>();

  const [market, rugCheck] = await Promise.all([
    fetchDexScreenerMarket(record.token_address, record.chain).catch(() => null),
    record.chain === "solana"
      ? fetchRugCheck(record.token_address)
      : Promise.resolve(null),
  ]);

  if (market) {
    sources.add("DexScreener");
    marketWarnings(market, warnings);
  }

  let topHolderPct: number | null = null;
  let top10Pct: number | null = null;
  let insiderPct: number | null = null;
  let clusterCount: number | null = null;
  let insiderAccounts: number | null = null;
  let lpLockedPct: number | null = null;
  let riskScore: number | null = null;
  let holderCoverage = false;
  let authorityCoverage = false;
  let clusterCoverage = false;
  let bundleCoverage = false;
  let honeypotCoverage = false;

  if (rugCheck) {
    sources.add("RugCheck");
    rugCheckWarnings(record, rugCheck, warnings);
    authorityCoverage = true;
    honeypotCoverage = true;

    const holders = (Array.isArray(rugCheck.topHolders) ? rugCheck.topHolders : []).filter(
      (holder) => !knownSystemHolder(holder, rugCheck.knownAccounts),
    );
    const holderPcts = holders
      .map((holder) => finite(holder.pct))
      .filter((value): value is number => value != null && value >= 0)
      .sort((a, b) => b - a);

    if (holderPcts.length) {
      holderCoverage = true;
      topHolderPct = holderPcts[0] ?? null;
      top10Pct = holderPcts.slice(0, 10).reduce((sum, value) => sum + value, 0);

      if (topHolderPct >= 20) {
        warnings.push({
          id: "top-holder-concentration",
          severity: "danger",
          title: "TOP HOLDER CONCENTRATION",
          detail:
            "The largest non-pool holder controls at least 20% of supply according to the current holder scan.",
          value: pct(topHolderPct),
          source: "RugCheck",
        });
      } else if (topHolderPct >= 10) {
        warnings.push({
          id: "top-holder-concentration",
          severity: "warning",
          title: "TOP HOLDER CONCENTRATION",
          detail:
            "The largest non-pool holder controls at least 10% of supply according to the current holder scan.",
          value: pct(topHolderPct),
          source: "RugCheck",
        });
      }

      if (top10Pct >= 50) {
        warnings.push({
          id: "top10-concentration",
          severity: "danger",
          title: "CONCENTRATED OWNERSHIP",
          detail:
            "The ten largest scanned non-pool holders control at least half of supply.",
          value: pct(top10Pct),
          source: "RugCheck",
        });
      } else if (top10Pct >= 30) {
        warnings.push({
          id: "top10-concentration",
          severity: "warning",
          title: "CONCENTRATED OWNERSHIP",
          detail:
            "The ten largest scanned non-pool holders control at least 30% of supply.",
          value: pct(top10Pct),
          source: "RugCheck",
        });
      }
    }

    const insiderHolderPcts = holders
      .filter((holder) => holder.insider === true)
      .map((holder) => finite(holder.pct))
      .filter((value): value is number => value != null && value > 0);
    if (holders.length) {
      bundleCoverage = true;
      insiderPct = insiderHolderPcts.reduce((sum, value) => sum + value, 0);
      if (insiderPct >= 20) {
        warnings.push({
          id: "bundle-insider-exposure",
          severity: "danger",
          title: "BUNDLE / INSIDER EXPOSURE",
          detail:
            "A large share of scanned holder supply is marked insider-linked. This can indicate bundled or coordinated launch distribution; it is a signal, not proof of common ownership.",
          value: pct(insiderPct),
          source: "RugCheck",
        });
      } else if (insiderPct >= 8) {
        warnings.push({
          id: "bundle-insider-exposure",
          severity: "warning",
          title: "BUNDLE / INSIDER EXPOSURE",
          detail:
            "Some scanned holder supply is marked insider-linked. This may reflect bundled or coordinated distribution and should be reviewed with wallet relationships.",
          value: pct(insiderPct),
          source: "RugCheck",
        });
      }
    }

    const networks = Array.isArray(rugCheck.insiderNetworks)
      ? rugCheck.insiderNetworks
      : [];
    clusterCoverage = true;
    clusterCount = networks.length;
    insiderAccounts = finite(rugCheck.graphInsidersDetected) ?? 0;

    if (networks.length) {
      const active = networks.reduce(
        (sum, network) => sum + Math.max(0, finite(network.activeAccounts) || 0),
        0,
      );
      const tradeNetworks = networks.filter(
        (network) => String(network.type || "").toLowerCase() === "trade",
      ).length;
      const transferNetworks = networks.length - tradeNetworks;

      warnings.push({
        id: "wallet-clusters",
        severity:
          (insiderAccounts || active) >= 20 || networks.length >= 3 ? "danger" : "warning",
        title: "CONNECTED WALLET CLUSTERS DETECTED",
        detail:
          "The live insider graph currently identifies " +
          networks.length +
          " connected network" +
          (networks.length === 1 ? "" : "s") +
          " (" +
          tradeNetworks +
          " trade, " +
          transferNetworks +
          " transfer). Connected-wallet analysis can reveal coordinated control that a simple holder list misses.",
        value: (insiderAccounts || active || 0) + " active accounts",
        source: "RugCheck",
      });
    }

    const lpValues = (Array.isArray(rugCheck.markets) ? rugCheck.markets : [])
      .map((item) => finite(item?.lp?.lpLockedPct))
      .filter((value): value is number => value != null);
    if (lpValues.length) {
      lpLockedPct = Math.max(...lpValues);
      if (lpLockedPct < 50) {
        warnings.push({
          id: "unlocked-liquidity",
          severity: "danger",
          title: "SIGNIFICANT UNLOCKED LIQUIDITY",
          detail:
            "Less than half of the scanned primary LP position is reported as locked. Liquidity structure can change and should be verified directly.",
          value: pct(lpLockedPct) + " locked",
          source: "RugCheck",
        });
      } else if (lpLockedPct < 90) {
        warnings.push({
          id: "partially-unlocked-liquidity",
          severity: "warning",
          title: "LIQUIDITY NOT FULLY LOCKED",
          detail:
            "The connected security scan reports that part of the LP position remains unlocked.",
          value: pct(lpLockedPct) + " locked",
          source: "RugCheck",
        });
      }
    }

    riskScore = finite(rugCheck.score_normalised);
  } else if (record.chain === "solana") {
    warnings.push({
      id: "solana-scan-unavailable",
      severity: "info",
      title: "ONCHAIN SECURITY SCAN INDEXING",
      detail:
        "The Solana security source has not returned a report yet. Bundle, cluster, authority and holder checks will appear automatically when data becomes available.",
      source: "XLaunch",
    });
  }

  if (record.chain === "robinhood") {
    const holderMetrics = await robinhoodHolderMetrics(
      record.token_address,
      market?.pairAddress,
    );
    if (holderMetrics) {
      sources.add("Blockscout");
      holderCoverage = true;
      topHolderPct = holderMetrics.topHolderPct;
      top10Pct = holderMetrics.top10Pct;

      if ((topHolderPct || 0) >= 20) {
        warnings.push({
          id: "top-holder-concentration",
          severity: "danger",
          title: "TOP HOLDER CONCENTRATION",
          detail:
            "The largest indexed non-pool Robinhood Chain holder controls at least 20% of supply.",
          value: pct(topHolderPct),
          source: "Blockscout",
        });
      } else if ((topHolderPct || 0) >= 10) {
        warnings.push({
          id: "top-holder-concentration",
          severity: "warning",
          title: "TOP HOLDER CONCENTRATION",
          detail:
            "The largest indexed non-pool Robinhood Chain holder controls at least 10% of supply.",
          value: pct(topHolderPct),
          source: "Blockscout",
        });
      }

      if ((top10Pct || 0) >= 50) {
        warnings.push({
          id: "top10-concentration",
          severity: "danger",
          title: "CONCENTRATED OWNERSHIP",
          detail:
            "The ten largest indexed non-pool Robinhood Chain holders control at least half of supply.",
          value: pct(top10Pct),
          source: "Blockscout",
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    tokenAddress: record.token_address,
    chain: record.chain,
    warnings: uniqueWarnings(warnings),
    coverage: {
      market: Boolean(market),
      holders: holderCoverage,
      authorities: authorityCoverage,
      clusters: clusterCoverage,
      bundles: bundleCoverage,
      honeypot: honeypotCoverage,
    },
    metrics: {
      liquidityUsd: finite(market?.liquidityUsd ?? rugCheck?.totalMarketLiquidity),
      marketCapUsd: finite(market?.marketCap ?? market?.fdv),
      priceChange24hPct: finite(market?.priceChange24h),
      buys24h: finite(market?.buys24h),
      sells24h: finite(market?.sells24h),
      topHolderPct,
      top10Pct,
      insiderPct,
      clusterCount,
      insiderAccounts,
      lpLockedPct,
      riskScore,
    },
    sources: Array.from(sources),
  };
}
