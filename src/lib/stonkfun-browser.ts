"use client";

import BN from "bn.js";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  buyExactInInstruction,
  claimCreatorFee as claimCreatorFeeInstruction,
  getPdaCreatorFeeVaultAuth,
  getPdaCreatorVault,
  getPdaLaunchpadAuth,
  getPdaLaunchpadPoolId,
  getPdaLaunchpadVaultId,
  getPdaPlatformVault,
  initializeWithToken2022,
} from "@raydium-io/raydium-sdk-v2";
import {
  connectSolanaWallet,
  solanaProvider,
  type SolanaWalletChoice,
} from "@/lib/pump-browser";

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

function parseDecimalAmount(value: string, decimals: number) {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error("Opening buy must be a non-negative decimal amount.");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new Error(
      `Opening buy supports at most ${decimals} decimal places for this quote asset.`,
    );
  }
  const raw =
    whole.replace(/^0+(?=\d)/, "") +
    fraction.padEnd(decimals, "0");
  return new BN(raw.replace(/^0+/, "") || "0");
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
  walletProvider?: SolanaWalletChoice;
};

export async function launchOnStonkFun(input: StonkFunLaunchInput) {
  const wallet = solanaProvider(input.walletProvider);
  const payer = await connectSolanaWallet(input.walletProvider);
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
  const configId = new PublicKey(pricing.curve.configId);
  const auth = getPdaLaunchpadAuth(programId).publicKey;
  const { publicKey: poolId } = getPdaLaunchpadPoolId(
    programId,
    mint,
    quoteMint,
  );
  const vaultA = getPdaLaunchpadVaultId(programId, poolId, mint).publicKey;
  const vaultB = getPdaLaunchpadVaultId(programId, poolId, quoteMint).publicKey;

  const quoteTokenProgram =
    input.quoteTokenProgram === TOKEN_2022_PROGRAM_ID.toBase58()
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;

  const initialize = initializeWithToken2022(
    programId,
    payer,
    creator,
    configId,
    platformId,
    auth,
    poolId,
    mint,
    quoteMint,
    vaultA,
    vaultB,
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
  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
    initialize,
  );

  const openingText = (input.openingBuy || "0").trim() || "0";
  const wantsOpeningBuy = Number(openingText) > 0;

  if (wantsOpeningBuy) {
    const quoteMintInfo = await getMint(
      connection,
      quoteMint,
      "confirmed",
      quoteTokenProgram,
    );
    const amountB = parseDecimalAmount(openingText, quoteMintInfo.decimals);
    if (amountB.lte(new BN(0))) {
      throw new Error("Opening buy must be greater than zero.");
    }

    const raiseRaw = new BN(pricing.raise.raw);
    if (amountB.gte(raiseRaw)) {
      throw new Error(
        "Opening buy must stay below the current StonkFun graduation raise.",
      );
    }

    const userTokenA = getAssociatedTokenAddressSync(
      mint,
      payer,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    const userTokenB = getAssociatedTokenAddressSync(
      quoteMint,
      payer,
      false,
      quoteTokenProgram,
    );

    const quoteAccountBefore = quoteMint.equals(NATIVE_MINT)
      ? await connection.getAccountInfo(userTokenB, "confirmed")
      : null;

    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        userTokenA,
        payer,
        mint,
        TOKEN_2022_PROGRAM_ID,
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        userTokenB,
        payer,
        quoteMint,
        quoteTokenProgram,
      ),
    );

    if (quoteMint.equals(NATIVE_MINT)) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: userTokenB,
          lamports: BigInt(amountB.toString()),
        }),
        createSyncNativeInstruction(userTokenB, TOKEN_PROGRAM_ID),
      );
    }

    transaction.add(
      buyExactInInstruction(
        programId,
        payer,
        auth,
        configId,
        platformId,
        poolId,
        userTokenA,
        userTokenB,
        vaultA,
        vaultB,
        mint,
        quoteMint,
        TOKEN_2022_PROGRAM_ID,
        quoteTokenProgram,
        getPdaPlatformVault(programId, platformId, quoteMint).publicKey,
        getPdaCreatorVault(programId, creator, quoteMint).publicKey,
        amountB,
        // Create + buy is atomic and no external trade can occur between the
        // two instructions. Keep the program minimum at zero rather than
        // relying on a stale client-side quote for a pool that does not exist yet.
        new BN(0),
        new BN(0),
      ),
    );

    // If XLaunch created the wrapped-SOL ATA solely for this atomic buy,
    // close it afterward and return any dust/rent to the launcher. Never close
    // a pre-existing WSOL account owned by the user.
    if (quoteMint.equals(NATIVE_MINT) && !quoteAccountBefore) {
      transaction.add(
        createCloseAccountInstruction(
          userTokenB,
          payer,
          payer,
          [],
          TOKEN_PROGRAM_ID,
        ),
      );
    }
  }

  const latest = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = payer;
  transaction.recentBlockhash = latest.blockhash;
  transaction.lastValidBlockHeight = latest.lastValidBlockHeight;

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


export async function claimStonkFunCreatorFees(args: {
  quoteMint: string;
  expectedRecipient?: string | null;
}) {
  const wallet = provider();
  const creator = await connectSolanaWallet();
  if (
    args.expectedRecipient &&
    creator.toBase58() !== args.expectedRecipient
  ) {
    throw new Error(
      "Connect the StonkFun creator-fee recipient wallet shown on the token before claiming.",
    );
  }

  const pricing = await stonkGet(
    `/pricing?quoteMint=${encodeURIComponent(args.quoteMint)}`,
  );
  const connection = new Connection(rpcUrl(), "confirmed");
  const programId = new PublicKey(pricing.curve.programId);
  const quoteMint = new PublicKey(args.quoteMint);

  const mintAccount = await connection.getAccountInfo(quoteMint, "confirmed");
  if (!mintAccount) throw new Error("StonkFun quote mint account was not found.");
  const quoteTokenProgram = mintAccount.owner;
  if (
    !quoteTokenProgram.equals(TOKEN_PROGRAM_ID) &&
    !quoteTokenProgram.equals(TOKEN_2022_PROGRAM_ID)
  ) {
    throw new Error("Unsupported StonkFun quote-token program.");
  }

  const creatorVault = getPdaCreatorVault(
    programId,
    creator,
    quoteMint,
  ).publicKey;
  const creatorVaultAuth = getPdaCreatorFeeVaultAuth(programId).publicKey;

  let rawBalance = 0n;
  try {
    const balance = await connection.getTokenAccountBalance(
      creatorVault,
      "confirmed",
    );
    rawBalance = BigInt(balance.value.amount);
  } catch {
    rawBalance = 0n;
  }
  if (rawBalance <= 0n) {
    throw new Error(
      "No StonkFun creator fees are currently claimable for this wallet and quote asset.",
    );
  }

  const recipientTokenAccount = getAssociatedTokenAddressSync(
    quoteMint,
    creator,
    false,
    quoteTokenProgram,
  );

  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: creator,
    recentBlockhash: latest.blockhash,
  }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
    createAssociatedTokenAccountIdempotentInstruction(
      creator,
      recipientTokenAccount,
      creator,
      quoteMint,
      quoteTokenProgram,
    ),
    claimCreatorFeeInstruction(
      programId,
      creator,
      creatorVaultAuth,
      creatorVault,
      recipientTokenAccount,
      quoteMint,
      quoteTokenProgram,
    ),
  );

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
    throw new Error("StonkFun creator-fee claim failed.");
  }

  return {
    wallet: creator.toBase58(),
    txHash: signature,
    amountRaw: rawBalance.toString(),
    quoteMint: quoteMint.toBase58(),
  };
}
