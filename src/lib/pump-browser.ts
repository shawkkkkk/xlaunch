"use client";

import BN from "bn.js";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getBuyTokenAmountFromSolAmount,
  OnlinePumpSdk,
  PUMP_SDK,
} from "@pump-fun/pump-sdk";

type InjectedSolanaProvider = {
  publicKey?: { toString(): string } | null;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
};

declare global {
  interface Window {
    solana?: InjectedSolanaProvider;
    phantom?: { solana?: InjectedSolanaProvider };
    backpack?: { solana?: InjectedSolanaProvider };
  }
}

function rpcUrl() {
  return (
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com"
  );
}

function provider(): InjectedSolanaProvider {
  if (typeof window === "undefined") throw new Error("Solana wallet is unavailable.");
  const wallet =
    window.phantom?.solana ||
    window.backpack?.solana ||
    window.solana;
  if (!wallet) {
    throw new Error("No Solana wallet found. Install Phantom or Backpack.");
  }
  return wallet;
}

export async function connectSolanaWallet() {
  const wallet = provider();
  const result = await wallet.connect();
  return new PublicKey(result.publicKey.toString());
}

function metadataUri(postId: string) {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://xlaunch.it";
  return `${base}/api/token-metadata/${postId}`;
}

function parseDecimalAmount(value: string, decimals: number) {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error("Opening buy must be a positive decimal amount.");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Opening buy supports at most ${decimals} decimal places for this quote asset.`);
  }
  const raw =
    whole.replace(/^0+(?=\d)/, "") +
    fraction.padEnd(decimals, "0");
  return new BN(raw.replace(/^0+/, "") || "0");
}

export type PumpLaunchInput = {
  postId: string;
  metadata: {
    name: string;
    symbol: string;
  };
  quoteMint: string;
  quoteSource: "sol" | "global" | "quoteControl";
  openingBuy: string;
  mayhemMode: boolean;
  holderReward: boolean;
  creatorFeeBps: number;
  feeRecipientWallet?: string | null;
};

export async function launchOnPump(input: PumpLaunchInput) {
  const wallet = provider();
  const user = await connectSolanaWallet();
  const connection = new Connection(rpcUrl(), "confirmed");
  const online = new OnlinePumpSdk(connection);
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  const quoteMint = new PublicKey(input.quoteMint);

  const feeRecipient = input.holderReward
    ? user
    : input.feeRecipientWallet
      ? new PublicKey(input.feeRecipientWallet)
      : user;

  const creatorFeeBps = Math.max(0, Math.floor(input.creatorFeeBps || 0));
  if (creatorFeeBps > 0 && input.quoteSource !== "quoteControl") {
    throw new Error(
      "Pump.fun only permits a custom creator-fee rate on QuoteControl pairs. SOL and USDC use Pump.fun's standard fee schedule.",
    );
  }

  const [global, quote, feeConfig, quoteControl] = await Promise.all([
    online.fetchGlobal(),
    online.resolveQuoteMint(quoteMint),
    online.fetchFeeConfig(),
    online.fetchQuoteControl(),
  ]);

  if (input.holderReward && !(global as { isHolderRewardEnabled?: boolean }).isHolderRewardEnabled) {
    throw new Error("Pump.fun has holder-reward coin creation disabled right now.");
  }

  if (input.mayhemMode && input.quoteSource === "quoteControl") {
    throw new Error("Pump.fun does not permit Mayhem Mode on QuoteControl-only pairs.");
  }

  const common = {
    mint,
    name: input.metadata.name,
    symbol: input.metadata.symbol,
    uri: metadataUri(input.postId),
    creator: feeRecipient,
    user,
    quoteMint,
    quoteTokenProgram: quote.quoteTokenProgram,
    mayhemMode: input.mayhemMode,
    holderReward: input.holderReward,
    ...(creatorFeeBps > 0 ? { creatorFeeBps: new BN(creatorFeeBps) } : {}),
  };

  const openingText = (input.openingBuy || "0").trim();
  const decimals = Number(quote.decimals);
  const quoteAmount = parseDecimalAmount(openingText || "0", decimals);
  let instructions;

  if (quoteAmount.gt(new BN(0))) {

    const amount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null,
      amount: quoteAmount,
      quoteMint,
      quoteControl,
      ...(creatorFeeBps > 0 ? { creatorFeeBps: new BN(creatorFeeBps) } : {}),
    });

    instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
      ...(await PUMP_SDK.createV2AndBuyV2Instructions({
        ...common,
        global,
        quoteAmount,
        amount,
      })),
    ];
  } else {
    instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
      await PUMP_SDK.createV2Instruction(common),
    ];
  }

  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: user,
    recentBlockhash: latest.blockhash,
  }).add(...instructions);

  transaction.partialSign(mintKeypair);
  const signed = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    "confirmed",
  );
  if (confirmation.value.err) {
    throw new Error("Pump.fun launch transaction failed.");
  }

  return {
    wallet: user.toBase58(),
    txHash: signature,
    tokenAddress: mint.toBase58(),
    feeRecipient: feeRecipient.toBase58(),
  };
}
