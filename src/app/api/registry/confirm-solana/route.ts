import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  confirmReservedPost,
  getRegistryRecord,
  markFeeRoutingVerified,
} from "@/lib/db";

const PUMP_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
);

function rpcUrl() {
  return (
    process.env.SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com"
  );
}

async function expectedStonkProgram(record: NonNullable<Awaited<ReturnType<typeof getRegistryRecord>>>) {
  const metadata = record.metadata as {
    xlaunch?: { launchConfig?: { quoteMint?: string } };
  };
  const quoteMint = metadata.xlaunch?.launchConfig?.quoteMint;
  if (!quoteMint) throw new Error("Missing StonkFun quote-mint proof.");

  const base =
    process.env.STONKFUN_API_BASE ||
    "https://www.stonkfun.xyz/api/public/v1";
  const response = await fetch(
    `${base}/launchlab/pricing?quoteMint=${encodeURIComponent(quoteMint)}`,
    { cache: "no-store" },
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || "Could not verify StonkFun pricing.");
  }
  return new PublicKey(body.data.curve.programId);
}

function instructionPrograms(transaction: Awaited<ReturnType<Connection["getParsedTransaction"]>>) {
  if (!transaction) return [];
  return transaction.transaction.message.instructions.flatMap((instruction) =>
    "programId" in instruction ? [instruction.programId.toBase58()] : [],
  );
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

    if (record.chain !== "solana" || !["stonkfun", "pumpfun"].includes(record.venue)) {
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
      throw new Error("The reserved wallet was not the launch transaction fee payer.");
    }

    const mintKey = keys.find((key) => key.pubkey.equals(mint));
    if (!mintKey?.signer) {
      throw new Error("The claimed token mint did not sign the launch transaction.");
    }

    const mintAccount = await connection.getAccountInfo(mint, "confirmed");
    if (!mintAccount || !mintAccount.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      throw new Error("The launched mint is not the expected Token-2022 asset.");
    }

    const invokedPrograms = instructionPrograms(transaction);
    const expectedProgram =
      record.venue === "pumpfun"
        ? PUMP_PROGRAM_ID
        : await expectedStonkProgram(record);

    if (!invokedPrograms.includes(expectedProgram.toBase58())) {
      throw new Error(
        `Transaction did not invoke the expected ${record.venue} launch program.`,
      );
    }

    if (record.fee_recipient_wallet) {
      const recipient = new PublicKey(record.fee_recipient_wallet);
      if (!keys.some((key) => key.pubkey.equals(recipient))) {
        throw new Error(
          "The configured creator-fee recipient is not present in the launch transaction.",
        );
      }
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
          error instanceof Error ? error.message : "Solana confirmation failed.",
      },
      { status: 400 },
    );
  }
}
