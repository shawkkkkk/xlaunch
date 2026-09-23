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
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  getPdaLaunchpadAuth,
  getPdaLaunchpadPoolId,
  getPdaLaunchpadVaultId,
  initializeWithToken2022,
} from "@raydium-io/raydium-sdk-v2";
import { connectSolanaWallet } from "@/lib/pump-browser";

type InjectedSolanaProvider = {
  publicKey?: { toString(): string } | null;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
};

function provider(): InjectedSolanaProvider {
  if (typeof window === "undefined") {
    throw new Error("Solana wallet is unavailable.");
  }
  const browser = window as unknown as {
    solana?: InjectedSolanaProvider;
    phantom?: { solana?: InjectedSolanaProvider };
    backpack?: { solana?: InjectedSolanaProvider };
  };
  const wallet =
    browser.phantom?.solana ||
    browser.backpack?.solana ||
    browser.solana;
  if (!wallet) {
    throw new Error("No Solana wallet found. Install Phantom or Backpack.");
  }
  return wallet;
}

function rpcUrl() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
}

function metadataUri(postId: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://xlaunch.it";
  return `${base}/api/token-metadata/${postId}`;
}

async function stonkGet(path: string) {
  const response = await fetch("/api/venues/stonkfun" + path);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "StonkFun unavailable.");
  return data;
}

export type StonkFunLaunchInput = {
  postId: string;
  name: string;
  symbol: string;
  quoteMint: string;
  quoteTokenProgram?: string;
  mode: "standard" | "reward";
  rewardBps: number;
  feeRecipientWallet?: string | null;
  openingBuy?: string;
};

export async function launchOnStonkFun(input: StonkFunLaunchInput) {
  if (Number(input.openingBuy || "0") > 0) {
    throw new Error(
      "Atomic StonkFun opening buys are not enabled in XLaunch yet. Set the opening buy to 0 for this launch.",
    );
  }

  const wallet = provider();
  const payer = await connectSolanaWallet();
  const quoteMint = new PublicKey(input.quoteMint);
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  const taxBps = input.mode === "reward" ? Math.floor(input.rewardBps) : 0;

  const pricing = await stonkGet(
    `/pricing?quoteMint=${encodeURIComponent(input.quoteMint)}`,
  );

  const allowedRewardTiers: number[] =
    pricing?.modes?.reward?.transferFeeBps || [];
  if (taxBps && !allowedRewardTiers.includes(taxBps)) {
    throw new Error("That StonkFun reward fee is no longer available.");
  }

  const creator =
    input.mode === "reward"
      ? payer
      : input.feeRecipientWallet
        ? new PublicKey(input.feeRecipientWallet)
        : payer;

  const programId = new PublicKey(pricing.curve.programId);
  const platformId = new PublicKey(
    taxBps ? pricing.platform.reward : pricing.platform.standard,
  );
  const { publicKey: poolId } = getPdaLaunchpadPoolId(
    programId,
    mint,
    quoteMint,
  );

  const quoteTokenProgram =
    input.quoteTokenProgram === TOKEN_2022_PROGRAM_ID.toBase58()
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;

  const instruction = initializeWithToken2022(
    programId,
    payer,
    creator,
    new PublicKey(pricing.curve.configId),
    platformId,
    getPdaLaunchpadAuth(programId).publicKey,
    poolId,
    mint,
    quoteMint,
    getPdaLaunchpadVaultId(programId, poolId, mint).publicKey,
    getPdaLaunchpadVaultId(programId, poolId, quoteMint).publicKey,
    quoteTokenProgram,
    Number(pricing.curve.baseDecimals),
    input.name,
    input.symbol,
    metadataUri(input.postId),
    {
      type: "ConstantCurve",
      supply: new BN(pricing.curve.supply),
      totalSellA: new BN(pricing.curve.totalSellA),
      totalFundRaisingB: new BN(pricing.raise.raw),
      migrateType: "cpmm",
    },
    new BN(0),
    new BN(0),
    new BN(0),
    pricing.curve.cpmmCreatorFeeOn,
    taxBps
      ? {
          transferFeeBasePoints: taxBps,
          maxinumFee: new BN("1000000000000000"),
        }
      : undefined,
    undefined,
    new PublicKey(
      taxBps ? pricing.curveRule.reward : pricing.curveRule.standard,
    ),
  );

  const connection = new Connection(rpcUrl(), "confirmed");
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer,
    recentBlockhash: latest.blockhash,
  })
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }))
    .add(instruction);

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
  if (confirmation.value.err) throw new Error("StonkFun launch transaction failed.");

  return {
    wallet: payer.toBase58(),
    txHash: signature,
    tokenAddress: mint.toBase58(),
    feeRecipient: creator.toBase58(),
  };
}
