import { Connection } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";

function connection() {
  return new Connection(
    process.env.SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      "https://api.mainnet-beta.solana.com",
    "confirmed",
  );
}

export async function getPumpCapabilities() {
  const sdk = new OnlinePumpSdk(connection());
  const [global, supported] = await Promise.all([
    sdk.fetchGlobal(),
    sdk.fetchSupportedQuoteMints(),
  ]);

  return {
    holderRewardsEnabled: Boolean((global as { isHolderRewardEnabled?: boolean }).isHolderRewardEnabled),
    quotes: supported.map((entry) => ({
      mint: entry.mint.toBase58(),
      symbol: entry.mint.equals(NATIVE_MINT) ? "SOL" : entry.mint.toBase58() === USDC_MINT ? "USDC" : undefined,
      source: entry.source,
      initialVirtualQuoteReserves: entry.initialVirtualQuoteReserves?.toString?.() ?? null,
    })),
    options: {
      mayhemMode: true,
      holderRewards: true,
      initialBuy: true,
      creatorFeeSharing: true,
      maxFeeShareholders: 10,
      customCreatorFeeForEligiblePairs: true,
    },
  };
}
