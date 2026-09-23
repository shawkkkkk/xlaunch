"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  isAddress,
  parseAbi,
  parseEventLogs,
  parseUnits,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { PONS_FACTORY, PONS_LAUNCH_AND_BUY, robinhoodChain } from "@/lib/pons";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

const factoryAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }",
  "function canLaunch(address launcher) view returns (bool)",
  "function launchFee() view returns (uint256)",
  "function maxCreatorTaxBps() view returns (uint256)",
  "function approvedPairTokens(address pairToken) view returns (bool)",
  "function pairTokenEconomics(address pairToken) view returns (uint256 phantomQuote,uint256 graduationThreshold,uint8 decimals)",
  "function previewLaunchEconomics(uint256 launchConfigId,address pairToken) view returns (bytes32)",
  "function launchToken(TokenParams params,uint256 launchConfigId,address pairToken) payable returns (address token,address curve)",
  "function launchToken(TokenParams params,uint256 launchConfigId,address pairToken,address[] snipeTaxExemptions) payable returns (address token,address curve)",
  "event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)",
]);

const routerAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }",
  "function launchAndBuy(TokenParams params,uint256 launchConfigId,address pairToken,uint256 quoteIn,uint256 minTokensOut,address recipient,address[] snipeTaxExemptions) payable returns (address token,address curve,uint256 tokensOut)",
]);

const erc20Abi = parseAbi([
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
]);

const publicClient = () =>
  createPublicClient({
    chain: robinhoodChain,
    transport: http(robinhoodChain.rpcUrls.default.http[0]),
  });

async function provider() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No EVM wallet found. Install MetaMask, Rabby, or another EVM wallet.");
  }
  return window.ethereum;
}

export async function connectRobinhoodWallet() {
  const p = await provider();
  const accounts = (await p.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.[0] || !isAddress(accounts[0])) throw new Error("Wallet did not return an address.");

  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1237" }] });
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code !== 4902) throw error;
    await p.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x1237",
        chainName: "Robinhood Chain",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
        blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
      }],
    });
  }

  return accounts[0] as Address;
}

export async function signRobinhoodMessage(message: string) {
  const account = await connectRobinhoodWallet();
  const p = await provider();
  const wallet = createWalletClient({
    account,
    chain: robinhoodChain,
    transport: custom(p as never),
  });
  const signature = await wallet.signMessage({ account, message });
  return { wallet: account, signature };
}

function normalizePair(value: string): Address {
  const pair = value.trim();
  if (!pair || pair.toUpperCase() === "ETH" || pair === zeroAddress) return zeroAddress;
  if (!isAddress(pair)) throw new Error("Pair token must be ETH or a valid approved token address.");
  return pair;
}

function normalizeAddress(value: string, fallback: Address): Address {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (!isAddress(trimmed)) throw new Error("One of the wallet addresses is invalid.");
  return trimmed;
}

function randomSalt(): Hex {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

function normalizeSalt(value: string): Hex {
  const trimmed = value.trim();
  if (!trimmed) return randomSalt();
  if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error("CREATE2 salt must be a 32-byte 0x-prefixed hex value.");
  }
  return trimmed as Hex;
}

function parseExemptions(value: string): Address[] {
  const entries = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (entries.length > 32) throw new Error("Pons allows at most 32 extra opening-tax exemptions.");
  return entries.map((entry) => {
    if (!isAddress(entry)) throw new Error(`Invalid exemption address: ${entry}`);
    return entry;
  });
}

export function quoteInitialPonsBuy(args: {
  quoteIn: bigint;
  supply: bigint;
  phantomQuote: bigint;
  graduationThreshold: bigint;
  curveFeeBps: number;
  creatorTaxBps: number;
  slippageBps: number;
}) {
  const BPS = 10_000n;
  const totalFeeBps = BigInt(args.curveFeeBps + args.creatorTaxBps);
  if (totalFeeBps >= BPS) throw new Error("Combined Pons fees are invalid.");

  const fee = (args.quoteIn * BigInt(args.curveFeeBps)) / BPS;
  const tax = (args.quoteIn * BigInt(args.creatorTaxBps)) / BPS;
  const net = args.quoteIn - fee - tax;

  const reserved =
    (args.supply * args.phantomQuote) /
    (args.phantomQuote + args.graduationThreshold);
  const sellable = args.supply - reserved;

  let expectedTokens =
    (net * args.supply) /
    (args.phantomQuote + net);
  if (expectedTokens > sellable) expectedTokens = sellable;

  const minTokensOut =
    (expectedTokens * BigInt(10_000 - args.slippageBps)) /
    BPS;

  return { expectedTokens, minTokensOut, reserved, sellable };
}

export type PonsLaunchInput = {
  metadata: {
    name: string;
    symbol: string;
    description: string;
    image: string;
    socials: {
      twitter: string;
      telegram: string;
      discord: string;
      website: string;
      farcaster: string;
    };
  };
  launchConfig: {
    id: number;
    supply: string;
    curveFeeBps: number;
    phantomQuote: string;
    graduationThreshold: string;
  };
  pairToken: string;
  creatorTaxBps: number;
  buybackEnabled: boolean;
  creatorFeeRecipient?: string;
  openingBuy?: string;
  openingBuyRecipient?: string;
  openingBuySlippageBps?: number;
  exemptions?: string;
  salt?: string;
};

export async function launchOnPons(input: PonsLaunchInput) {
  const account = await connectRobinhoodWallet();
  const p = await provider();
  const wallet = createWalletClient({
    account,
    chain: robinhoodChain,
    transport: custom(p as never),
  });
  const client = publicClient();

  const pairToken = normalizePair(input.pairToken);
  const [canLaunch, launchFee, maxCreatorTaxBps, expectedEconomics] = await Promise.all([
    client.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "canLaunch", args: [account] }),
    client.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "launchFee" }),
    client.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "maxCreatorTaxBps" }),
    client.readContract({
      address: PONS_FACTORY,
      abi: factoryAbi,
      functionName: "previewLaunchEconomics",
      args: [BigInt(input.launchConfig.id), pairToken],
    }),
  ]);

  if (!canLaunch) throw new Error("This wallet is not currently eligible to launch through the Pons factory.");
  if (input.creatorTaxBps < 0 || input.creatorTaxBps > Number(maxCreatorTaxBps)) {
    throw new Error(`Creator tax exceeds Pons's live cap of ${Number(maxCreatorTaxBps) / 100}%.`);
  }

  let pairDecimals = 18;
  let phantomQuote = BigInt(input.launchConfig.phantomQuote);
  let graduationThreshold = BigInt(input.launchConfig.graduationThreshold);

  if (pairToken !== zeroAddress) {
    const [approved, economics] = await Promise.all([
      client.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "approvedPairTokens", args: [pairToken] }),
      client.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "pairTokenEconomics", args: [pairToken] }),
    ]);
    if (!approved || economics[0] === 0n || economics[1] === 0n) {
      throw new Error("That token is not currently an approved Pons launch pair.");
    }
    phantomQuote = economics[0];
    graduationThreshold = economics[1];
    pairDecimals = Number(economics[2]);
  }

  const creatorFeeRecipient = normalizeAddress(input.creatorFeeRecipient || "", account);
  const openingBuyRecipient = normalizeAddress(input.openingBuyRecipient || "", account);
  const exemptions = parseExemptions(input.exemptions || "");
  const salt = normalizeSalt(input.salt || "");

  const params = {
    name: input.metadata.name,
    symbol: input.metadata.symbol,
    logo: input.metadata.image,
    description: input.metadata.description,
    socials: {
      twitter: input.metadata.socials.twitter,
      telegram: input.metadata.socials.telegram,
      discord: input.metadata.socials.discord,
      website: input.metadata.socials.website,
      farcaster: input.metadata.socials.farcaster,
    },
    creatorFeeRecipient,
    creatorTaxBps: input.creatorTaxBps,
    buybackEnabled: input.buybackEnabled,
    expectedEconomics,
    salt,
  } as const;

  const openingBuy = Number(input.openingBuy || "0");
  let hash: Hex;

  if (openingBuy > 0) {
    const quoteIn = parseUnits(String(input.openingBuy), pairDecimals);
    const slippageBps = Math.max(1, Math.min(input.openingBuySlippageBps ?? 300, 2_500));
    const quote = quoteInitialPonsBuy({
      quoteIn,
      supply: BigInt(input.launchConfig.supply),
      phantomQuote,
      graduationThreshold,
      curveFeeBps: input.launchConfig.curveFeeBps,
      creatorTaxBps: input.creatorTaxBps,
      slippageBps,
    });

    if (pairToken !== zeroAddress) {
      const allowance = await client.readContract({
        address: pairToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, PONS_LAUNCH_AND_BUY],
      });
      if (allowance < quoteIn) {
        const approvalHash = await wallet.writeContract({
          address: pairToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [PONS_LAUNCH_AND_BUY, quoteIn],
        });
        const approvalReceipt = await client.waitForTransactionReceipt({ hash: approvalHash });
        if (approvalReceipt.status !== "success") throw new Error("Pair-token approval failed.");
      }
    }

    hash = await wallet.writeContract({
      address: PONS_LAUNCH_AND_BUY,
      abi: routerAbi,
      functionName: "launchAndBuy",
      args: [
        params,
        BigInt(input.launchConfig.id),
        pairToken,
        quoteIn,
        quote.minTokensOut,
        openingBuyRecipient,
        exemptions,
      ],
      value: pairToken === zeroAddress ? launchFee + quoteIn : launchFee,
    });
  } else {
    if (exemptions.length) {
      hash = await wallet.writeContract({
        address: PONS_FACTORY,
        abi: factoryAbi,
        functionName: "launchToken",
        args: [params, BigInt(input.launchConfig.id), pairToken, exemptions],
        value: launchFee,
      });
    } else {
      hash = await wallet.writeContract({
        address: PONS_FACTORY,
        abi: factoryAbi,
        functionName: "launchToken",
        args: [params, BigInt(input.launchConfig.id), pairToken],
        value: launchFee,
      });
    }
  }

  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Pons launch transaction reverted.");

  const factoryLogs = receipt.logs.filter(
    (log) => log.address.toLowerCase() === PONS_FACTORY.toLowerCase(),
  );
  const parsed = parseEventLogs({
    abi: factoryAbi,
    eventName: "TokenLaunched",
    logs: factoryLogs,
    strict: false,
  });
  const launch = parsed[0];
  if (!launch || !("token" in launch.args) || !("curve" in launch.args)) {
    throw new Error("Launch confirmed, but XLaunch could not decode the Pons token address.");
  }

  return {
    wallet: account,
    txHash: hash,
    tokenAddress: launch.args.token as Address,
    curveAddress: launch.args.curve as Address,
  };
}
