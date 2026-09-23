import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  isAddress,
  parseAbi,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { confirmReservedPost, getRegistryRecord } from "@/lib/db";
import { PONS_FACTORY, robinhoodChain } from "@/lib/pons";

const launchEventAbi = parseAbi([
  "event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)",
]);

function isTxHash(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("Canonical registry is not configured.");

    const body = await request.json();
    const postId = String(body.postId ?? "");
    const wallet = String(body.wallet ?? "");
    const txHash = String(body.txHash ?? "");
    const tokenAddress = String(body.tokenAddress ?? "");

    if (!/^\d+$/.test(postId)) throw new Error("Invalid post.");
    if (!isTxHash(txHash)) throw new Error("Invalid transaction hash.");

    const record = await getRegistryRecord(postId);
    if (!record) throw new Error("No XLaunch reservation exists for this post.");

    if (record.status === "live") {
      if (record.tx_hash?.toLowerCase() !== txHash.toLowerCase()) {
        return NextResponse.json({ error: "This post already belongs to another confirmed XLaunch token." }, { status: 409 });
      }
      return NextResponse.json({ record, alreadyConfirmed: true });
    }

    if (record.venue !== "pons" || record.chain !== "robinhood") {
      throw new Error("This confirmation endpoint currently expects a Pons launch.");
    }
    if (!isAddress(wallet) || !isAddress(tokenAddress)) throw new Error("Invalid Robinhood Chain address.");
    if (record.reserver_wallet.toLowerCase() !== wallet.toLowerCase()) {
      return NextResponse.json({ error: "Reservation belongs to a different wallet." }, { status: 403 });
    }

    const client = createPublicClient({
      chain: robinhoodChain,
      transport: http(robinhoodChain.rpcUrls.default.http[0]),
    });
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new Error("Pons launch transaction did not succeed.");

    const parsed = parseEventLogs({
      abi: launchEventAbi,
      eventName: "TokenLaunched",
      logs: receipt.logs.filter((log) => log.address.toLowerCase() === PONS_FACTORY.toLowerCase()),
      strict: false,
    });

    const event = parsed.find((item) => {
      const args = item.args as { token?: Address; deployer?: Address };
      return (
        args.token?.toLowerCase() === tokenAddress.toLowerCase() &&
        args.deployer?.toLowerCase() === wallet.toLowerCase()
      );
    });
    if (!event) throw new Error("Transaction does not contain the expected Pons launch for this wallet.");

    const confirmed = await confirmReservedPost({
      postId,
      wallet,
      tokenAddress,
      txHash,
    });
    if (!confirmed) {
      return NextResponse.json({ error: "The canonical reservation changed before confirmation." }, { status: 409 });
    }

    return NextResponse.json({ record: confirmed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Confirmation failed." },
      { status: 400 },
    );
  }
}
