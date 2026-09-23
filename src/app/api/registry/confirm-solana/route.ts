import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  getMint,
  getTransferFeeConfig,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  holderRewardsPda,
  OnlinePumpSdk,
} from "@pump-fun/pump-sdk";
import {
  confirmReservedPost,
  getRegistryRecord,
  markFeeRoutingVerified,
} from "@/lib/db";

const PUMP_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
);

type LaunchConfig = {
  quoteMint?: string;
  mode?: "standard" | "reward";
  rewardBps?: number;
  holderReward?: boolean;
  mayhemMode?: boolean;
  creatorFeeBps?: number;
};

type StonkPricing = {
  curve: {
    programId: string;
    configId: string;
  };
  platform: {
    standard: string;
    reward: string;
  };
  curveRule: {
    standard: string;
    reward: string;
  };
};

function rpcUrl() {
  return (
    process.env.SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com"
  );
}

function launchConfig(
  record: NonNullable<Awaited<ReturnType<typeof getRegistryRecord>>>,
): LaunchConfig {
  const metadata = record.metadata as {
    xlaunch?: { launchConfig?: LaunchConfig };
  };
  return metadata.xlaunch?.launchConfig || {};
}

async function fetchStonkPricing(quoteMint: string): Promise<StonkPricing> {
  const base =
    process.env.STONKFUN_API_BASE ||
    "https://www.stonkfun.xyz/api/public/v1";
  const response = await fetch(
    `${base}/launchlab/pricing?quoteMint=${encodeURIComponent(quoteMint)}`,
    { cache: "no-store" },
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      body?.error?.message || "Could not verify StonkFun pricing.",
    );
  }
  return body.data as StonkPricing;
}

function findProgramInstruction(
  transaction: NonNullable<
    Awaited<ReturnType<Connection["getParsedTransaction"]>>
  >,
  programId: PublicKey,
) {
  return transaction.transaction.message.instructions.find(
    (instruction) =>
      "accounts" in instruction && instruction.programId.equals(programId),
  ) as
    | {
        programId: PublicKey;
        accounts: PublicKey[];
      }
    | undefined;
}

async function verifyStonkLaunch(args: {
  connection: Connection;
  transaction: NonNullable<
    Awaited<ReturnType<Connection["getParsedTransaction"]>>
  >;
  record: NonNullable<Awaited<ReturnType<typeof getRegistryRecord>>>;
  user: PublicKey;
  mint: PublicKey;
}) {
  const config = launchConfig(args.record);
  if (!config.quoteMint) throw new Error("Missing StonkFun quote-mint proof.");

  const pricing = await fetchStonkPricing(config.quoteMint);
  const programId = new PublicKey(pricing.curve.programId);
  const instruction = findProgramInstruction(args.transaction, programId);
  if (!instruction) {
    throw new Error("Transaction did not invoke the expected StonkFun LaunchLab program.");
  }

  const rewardMode = config.mode === "reward";
  const expectedCreator = rewardMode
    ? args.user
    : new PublicKey(args.record.fee_recipient_wallet || args.user.toBase58());
  const expectedPlatform = new PublicKey(
    rewardMode ? pricing.platform.reward : pricing.platform.standard,
  );
  const expectedRule = new PublicKey(
    rewardMode ? pricing.curveRule.reward : pricing.curveRule.standard,
  );
  const expectedQuote = new PublicKey(config.quoteMint);

  const accounts = instruction.accounts;
  if (
    !accounts[0]?.equals(args.user) ||
    !accounts[1]?.equals(expectedCreator) ||
    !accounts[2]?.equals(new PublicKey(pricing.curve.configId)) ||
    !accounts[3]?.equals(expectedPlatform) ||
    !accounts[6]?.equals(args.mint) ||
    !accounts[7]?.equals(expectedQuote) ||
    !accounts.at(-1)?.equals(expectedRule)
  ) {
    throw new Error(
      "The signed LaunchLab configuration does not match the canonical XLaunch/StonkFun record.",
    );
  }

  const mintInfo = await getMint(
    args.connection,
    args.mint,
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
  const transferFee = getTransferFeeConfig(mintInfo);

  if (rewardMode) {
    const expectedBps = Number(config.rewardBps || 0);
    const actualBps = Number(
      transferFee?.newerTransferFee.transferFeeBasisPoints ?? -1,
    );
    if (!transferFee || expectedBps <= 0 || actualBps !== expectedBps) {
      throw new Error(
        "StonkFun Reward mode transfer fee does not match the reserved launch.",
      );
    }
  } else if (transferFee) {
    throw new Error(
      "A StonkFun Standard launch must not contain a transfer-fee extension.",
    );
  }
}

async function verifyPumpLaunch(args: {
  connection: Connection;
  record: NonNullable<Awaited<ReturnType<typeof getRegistryRecord>>>;
  user: PublicKey;
  mint: PublicKey;
}) {
  const config = launchConfig(args.record);
  const sdk = new OnlinePumpSdk(args.connection);
  const bondingCurve = await sdk.fetchBondingCurve(args.mint);
  const curve = bondingCurve as unknown as {
    creator: PublicKey;
    isHolderReward?: boolean;
    isMayhemMode?: boolean;
    creatorFeeBps?: { toString(): string } | number;
  };

  const holderReward = Boolean(config.holderReward);
  if (Boolean(curve.isHolderReward) !== holderReward) {
    throw new Error(
      "Pump.fun holder-reward state does not match the reserved launch.",
    );
  }
  if (Boolean(curve.isMayhemMode) !== Boolean(config.mayhemMode)) {
    throw new Error(
      "Pump.fun Mayhem state does not match the reserved launch.",
    );
  }

  const expectedCreator = holderReward
    ? holderRewardsPda(args.mint)
    : new PublicKey(args.record.fee_recipient_wallet || args.user.toBase58());
  if (!curve.creator.equals(expectedCreator)) {
    throw new Error(
      "Pump.fun creator-fee destination does not match the public XLaunch record.",
    );
  }

  const expectedCreatorFeeBps = Number(config.creatorFeeBps || 0);
  const actualCreatorFeeBps = Number(
    typeof curve.creatorFeeBps === "number"
      ? curve.creatorFeeBps
      : curve.creatorFeeBps?.toString() || 0,
  );
  if (
    expectedCreatorFeeBps > 0 &&
    actualCreatorFeeBps !== expectedCreatorFeeBps
  ) {
    throw new Error(
      "Pump.fun creator-fee rate does not match the reserved launch.",
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("Canonical registry is not configured.");
    }

    const body = await request.json();
    const postId = String(body.postId ?? "");
    const wallet = String(body.wallet ?? "");
    const txHash = String(body.txHash ?? "");
    const tokenAddress = String(body.tokenAddress ?? "");

    if (!/^\d+$/.test(postId)) throw new Error("Invalid X post id.");

    const user = new PublicKey(wallet);
    const mint = new PublicKey(tokenAddress);
    const record = await getRegistryRecord(postId);

    if (!record) throw new Error("No XLaunch reservation exists for this post.");
    if (record.status === "live") {
      if (record.tx_hash !== txHash || record.token_address !== tokenAddress) {
        return NextResponse.json(
          { error: "This post already belongs to another confirmed XLaunch token." },
          { status: 409 },
        );
      }
      return NextResponse.json({ record, alreadyConfirmed: true });
    }

    if (
      record.chain !== "solana" ||
      !["stonkfun", "pumpfun"].includes(record.venue)
    ) {
      throw new Error("This reservation is not a Solana launch.");
    }
    if (record.reserver_wallet !== user.toBase58()) {
      return NextResponse.json(
        { error: "Reservation belongs to another wallet." },
        { status: 403 },
      );
    }

    const connection = new Connection(rpcUrl(), "confirmed");
    const transaction = await connection.getParsedTransaction(txHash, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!transaction || transaction.meta?.err) {
      throw new Error("The Solana launch transaction is missing or failed.");
    }

    const keys = transaction.transaction.message.accountKeys;
    if (!keys[0]?.pubkey.equals(user) || !keys[0]?.signer) {
      throw new Error(
        "The reserved wallet was not the launch transaction fee payer.",
      );
    }

    const mintKey = keys.find((key) => key.pubkey.equals(mint));
    if (!mintKey?.signer) {
      throw new Error(
        "The claimed token mint did not sign the launch transaction.",
      );
    }

    const mintAccount = await connection.getAccountInfo(mint, "confirmed");
    if (!mintAccount || !mintAccount.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      throw new Error(
        "The launched mint is not the expected Token-2022 asset.",
      );
    }

    if (record.venue === "pumpfun") {
      if (!findProgramInstruction(transaction, PUMP_PROGRAM_ID)) {
        throw new Error(
          "Transaction did not invoke the expected Pump.fun launch program.",
        );
      }
      await verifyPumpLaunch({ connection, record, user, mint });
    } else {
      await verifyStonkLaunch({
        connection,
        transaction,
        record,
        user,
        mint,
      });
    }

    const confirmed = await confirmReservedPost({
      postId,
      wallet: user.toBase58(),
      tokenAddress: mint.toBase58(),
      txHash,
    });
    if (!confirmed) {
      return NextResponse.json(
        { error: "The canonical reservation changed before confirmation." },
        { status: 409 },
      );
    }

    const verified = await markFeeRoutingVerified({
      postId,
      feeRecipientWallet: record.fee_recipient_wallet,
    });

    return NextResponse.json({ record: verified || confirmed });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Solana confirmation failed.",
      },
      { status: 400 },
    );
  }
}
