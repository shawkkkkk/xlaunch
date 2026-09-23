import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  decodeFunctionData,
  http,
  isAddress,
  parseAbi,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import {
  confirmReservedPost,
  getRegistryRecord,
  markFeeRoutingVerified,
} from "@/lib/db";
import {
  PONS_FACTORY,
  PONS_LAUNCH_AND_BUY,
  robinhoodChain,
} from "@/lib/pons";

const launchEventAbi = parseAbi([
  "event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)",
]);

const launchCallAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }",
  "function launchToken(TokenParams params,uint256 launchConfigId,address pairToken) payable returns (address token,address curve)",
  "function launchToken(TokenParams params,uint256 launchConfigId,address pairToken,address[] snipeTaxExemptions) payable returns (address token,address curve)",
  "function launchAndBuy(TokenParams params,uint256 launchConfigId,address pairToken,uint256 quoteIn,uint256 minTokensOut,address recipient,address[] snipeTaxExemptions) payable returns (address token,address curve,uint256 tokensOut)",
]);

function isTxHash(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

type DecodedTokenParams = {
  name: string;
  symbol: string;
  logo: string;
  description: string;
  socials: {
    twitter: string;
    telegram: string;
    discord: string;
    website: string;
    farcaster: string;
  };
  creatorFeeRecipient: Address;
  creatorTaxBps: number;
  buybackEnabled: boolean;
  expectedEconomics: Hex;
  salt: Hex;
};

type DecodedLaunch = {
  functionName: string;
  params: DecodedTokenParams;
  launchConfigId: bigint;
  pairToken: Address;
  quoteIn?: bigint;
  minTokensOut?: bigint;
  recipient?: Address;
  exemptions: Address[];
};

function decodePonsLaunch(input: Hex): DecodedLaunch {
  const decoded = decodeFunctionData({ abi: launchCallAbi, data: input });
  const args = decoded.args as readonly unknown[] | undefined;
  if (!args || args.length < 3) throw new Error("Could not decode the Pons launch calldata.");

  const params = args[0] as DecodedTokenParams;
  const launchConfigId = args[1] as bigint;
  const pairToken = args[2] as Address;

  if (decoded.functionName === "launchAndBuy") {
    return {
      functionName: decoded.functionName,
      params,
      launchConfigId,
      pairToken,
      quoteIn: args[3] as bigint,
      minTokensOut: args[4] as bigint,
      recipient: args[5] as Address,
      exemptions: (args[6] as Address[]) || [],
    };
  }

  return {
    functionName: decoded.functionName,
    params,
    launchConfigId,
    pairToken,
    exemptions: ((args[3] as Address[] | undefined) || []),
  };
}

function sameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function normalizePair(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.toUpperCase() === "ETH") {
    return "0x0000000000000000000000000000000000000000";
  }
  return raw;
}

function normalizeExemptions(value: unknown) {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

function sameStringArray(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
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

    if (!/^\d+$/.test(postId)) throw new Error("Invalid post.");
    if (!isTxHash(txHash)) throw new Error("Invalid transaction hash.");

    const record = await getRegistryRecord(postId);
    if (!record) throw new Error("No XLaunch reservation exists for this post.");

    if (record.status === "live") {
      if (record.tx_hash?.toLowerCase() !== txHash.toLowerCase()) {
        return NextResponse.json(
          { error: "This post already belongs to another confirmed XLaunch token." },
          { status: 409 },
        );
      }
      return NextResponse.json({ record, alreadyConfirmed: true });
    }

    if (record.venue !== "pons" || record.chain !== "robinhood") {
      throw new Error("This confirmation endpoint expects a Pons launch.");
    }
    if (!isAddress(wallet) || !isAddress(tokenAddress)) {
      throw new Error("Invalid Robinhood Chain address.");
    }
    if (record.reserver_wallet.toLowerCase() !== wallet.toLowerCase()) {
      return NextResponse.json(
        { error: "Reservation belongs to a different wallet." },
        { status: 403 },
      );
    }

    const client = createPublicClient({
      chain: robinhoodChain,
      transport: http(robinhoodChain.rpcUrls.default.http[0]),
    });

    const [receipt, transaction] = await Promise.all([
      client.getTransactionReceipt({ hash: txHash }),
      client.getTransaction({ hash: txHash }),
    ]);
    if (receipt.status !== "success") {
      throw new Error("Pons launch transaction did not succeed.");
    }
    if (transaction.from.toLowerCase() !== wallet.toLowerCase()) {
      throw new Error("The reserved wallet did not sign this Pons transaction.");
    }

    const expectedTarget = transaction.to?.toLowerCase();
    if (
      expectedTarget !== PONS_FACTORY.toLowerCase() &&
      expectedTarget !== PONS_LAUNCH_AND_BUY.toLowerCase()
    ) {
      throw new Error("Transaction was not sent to an approved Pons launch contract.");
    }

    const decoded = decodePonsLaunch(transaction.input);
    const actualFeeRecipient = decoded.params.creatorFeeRecipient;

    if (
      record.fee_recipient_wallet &&
      !sameAddress(actualFeeRecipient, record.fee_recipient_wallet)
    ) {
      throw new Error(
        "The signed Pons transaction uses a different creator-fee recipient than the public XLaunch record.",
      );
    }

    const metadata = (record.metadata || {}) as any;
    const reservedMetadata = metadata;
    const reservedConfig = metadata?.xlaunch?.launchConfig || {};

    const expectedPair = normalizePair(reservedConfig.pairToken);
    if (!isAddress(expectedPair) || !sameAddress(decoded.pairToken, expectedPair)) {
      throw new Error("The signed Pons transaction uses a different pair token than the reservation.");
    }
    if (Number(decoded.launchConfigId) !== Number(reservedConfig.launchConfigId)) {
      throw new Error("The signed Pons transaction uses a different launch config than the reservation.");
    }
    if (Number(decoded.params.creatorTaxBps) !== Number(reservedConfig.creatorTaxBps || 0)) {
      throw new Error("The signed Pons transaction uses a different creator tax than the reservation.");
    }
    if (Boolean(decoded.params.buybackEnabled) !== Boolean(reservedConfig.buybackEnabled)) {
      throw new Error("The signed Pons transaction changes the reviewed buyback setting.");
    }

    const fields: Array<[string, string, string]> = [
      ["name", String(decoded.params.name), String(reservedMetadata?.name || "")],
      ["symbol", String(decoded.params.symbol), String(reservedMetadata?.symbol || "")],
      ["logo", String(decoded.params.logo), String(reservedMetadata?.image || "")],
      ["description", String(decoded.params.description), String(reservedMetadata?.description || "")],
      ["twitter", String(decoded.params.socials.twitter), String(reservedMetadata?.socials?.twitter || "")],
      ["telegram", String(decoded.params.socials.telegram), String(reservedMetadata?.socials?.telegram || "")],
      ["discord", String(decoded.params.socials.discord), String(reservedMetadata?.socials?.discord || "")],
      ["website", String(decoded.params.socials.website), String(reservedMetadata?.socials?.website || "")],
      ["farcaster", String(decoded.params.socials.farcaster), String(reservedMetadata?.socials?.farcaster || "")],
    ];
    const changedField = fields.find(([, actual, expected]) => actual !== expected);
    if (changedField) {
      throw new Error(
        `The signed Pons transaction changes the reviewed ${changedField[0]} field.`,
      );
    }

    const expectedExemptions = normalizeExemptions(reservedConfig.exemptions);
    const actualExemptions = decoded.exemptions.map((address) => address.toLowerCase()).sort();
    if (!sameStringArray(actualExemptions, expectedExemptions)) {
      throw new Error("The signed Pons transaction changes the opening-tax exemption list.");
    }

    const expectedOpeningBuy = Number(reservedConfig.openingBuy || "0");
    const hasOpeningBuy = decoded.functionName === "launchAndBuy";
    if ((expectedOpeningBuy > 0) !== hasOpeningBuy) {
      throw new Error("The signed Pons transaction changes the reviewed opening-buy choice.");
    }
    if (hasOpeningBuy) {
      const expectedRecipient = String(reservedConfig.openingBuyRecipient || wallet);
      if (!decoded.recipient || !isAddress(expectedRecipient) || !sameAddress(decoded.recipient, expectedRecipient)) {
        throw new Error("The signed Pons transaction changes the opening-buy recipient.");
      }
      if (!decoded.quoteIn || decoded.quoteIn <= 0n) {
        throw new Error("The Pons opening buy has an invalid quote amount.");
      }
    }

    const requestedSalt = String(reservedConfig.salt || "").trim();
    if (requestedSalt && decoded.params.salt.toLowerCase() !== requestedSalt.toLowerCase()) {
      throw new Error("The signed Pons transaction changes the requested CREATE2 salt.");
    }

    const parsed = parseEventLogs({
      abi: launchEventAbi,
      eventName: "TokenLaunched",
      logs: receipt.logs.filter(
        (log) => log.address.toLowerCase() === PONS_FACTORY.toLowerCase(),
      ),
      strict: false,
    });

    const event = parsed.find((item) => {
      const args = item.args as {
        token?: Address;
        deployer?: Address;
        pairToken?: Address;
        launchConfigId?: bigint;
      };
      return (
        args.token?.toLowerCase() === tokenAddress.toLowerCase() &&
        args.deployer?.toLowerCase() === wallet.toLowerCase() &&
        args.pairToken?.toLowerCase() === decoded.pairToken.toLowerCase() &&
        Number(args.launchConfigId) === Number(decoded.launchConfigId)
      );
    });
    if (!event) {
      throw new Error(
        "Transaction does not contain the expected Pons launch for this wallet.",
      );
    }

    const confirmed = await confirmReservedPost({
      postId,
      wallet,
      tokenAddress,
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
      feeRecipientWallet: actualFeeRecipient,
    });

    return NextResponse.json({ record: verified || confirmed });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Confirmation failed.",
      },
      { status: 400 },
    );
  }
}
