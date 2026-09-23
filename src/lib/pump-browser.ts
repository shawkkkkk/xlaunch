"use client";

import BN from "bn.js";
import { getWallets } from "@wallet-standard/app";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  getBuyTokenAmountFromSolAmount,
  OnlinePumpSdk,
  PUMP_SDK,
} from "@pump-fun/pump-sdk";

type InjectedSolanaProvider = {
  publicKey?: { toString(): string } | null;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signMessage?: (
    message: Uint8Array,
    encoding?: "utf8",
  ) => Promise<{ signature: Uint8Array }>;
};

export type SolanaWalletChoice = string;

declare global {
  interface Window {
    solana?: InjectedSolanaProvider;
    phantom?: { solana?: InjectedSolanaProvider };
    backpack?: { solana?: InjectedSolanaProvider };
    solflare?: InjectedSolanaProvider;
    okxwallet?: { solana?: InjectedSolanaProvider };
    trustwallet?: { solana?: InjectedSolanaProvider };
    braveSolana?: InjectedSolanaProvider;
    glowSolana?: InjectedSolanaProvider;
    nightly?: { solana?: InjectedSolanaProvider };
    exodus?: { solana?: InjectedSolanaProvider };
  }
}

type WalletOption = {
  id: SolanaWalletChoice;
  label: string;
  available: boolean;
};

const standardAccounts = new Map<string, any>();

const SOLANA_CATALOGUE = [
  { id: "phantom", label: "Phantom" },
  { id: "solflare", label: "Solflare" },
  { id: "backpack", label: "Backpack" },
  { id: "okx", label: "OKX Wallet" },
  { id: "coinbase", label: "Coinbase Wallet" },
  { id: "trust", label: "Trust Wallet" },
  { id: "brave", label: "Brave Wallet" },
  { id: "nightly", label: "Nightly" },
  { id: "glow", label: "Glow" },
  { id: "exodus", label: "Exodus" },
  { id: "jupiter", label: "Jupiter Wallet" },
] as const;

function normalizeWalletName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function legacyProvider(choice: SolanaWalletChoice): InjectedSolanaProvider | undefined {
  if (typeof window === "undefined") return undefined;
  switch (choice) {
    case "phantom":
      return window.phantom?.solana;
    case "backpack":
      return window.backpack?.solana;
    case "solflare":
      return window.solflare;
    case "okx":
      return window.okxwallet?.solana;
    case "trust":
      return window.trustwallet?.solana;
    case "brave":
      return window.braveSolana;
    case "nightly":
      return window.nightly?.solana;
    case "glow":
      return window.glowSolana;
    case "exodus":
      return window.exodus?.solana;
    case "browser":
      return window.solana;
    default:
      return undefined;
  }
}

function standardWallet(choice: SolanaWalletChoice) {
  if (!choice.startsWith("standard:")) return null;
  const name = decodeURIComponent(choice.slice("standard:".length));
  return getWallets().get().find((wallet) => wallet.name === name) || null;
}

async function standardAccount(choice: SolanaWalletChoice, wallet: any) {
  const cached = standardAccounts.get(choice);
  if (cached) return cached;
  const connectFeature = wallet.features?.["standard:connect"];
  if (!connectFeature?.connect) {
    throw new Error(`${wallet.name} does not expose Wallet Standard connect support.`);
  }
  const result = await connectFeature.connect();
  const accounts = result?.accounts || wallet.accounts || [];
  const account =
    accounts.find((item: any) => item.chains?.includes?.("solana:mainnet")) ||
    accounts[0];
  if (!account) throw new Error(`${wallet.name} did not return a Solana account.`);
  standardAccounts.set(choice, account);
  return account;
}

function standardProvider(choice: SolanaWalletChoice, wallet: any): InjectedSolanaProvider {
  return {
    async connect() {
      const account = await standardAccount(choice, wallet);
      return { publicKey: { toString: () => String(account.address) } };
    },
    async signTransaction(transaction: Transaction) {
      const account = await standardAccount(choice, wallet);
      const feature = wallet.features?.["solana:signTransaction"];
      if (!feature?.signTransaction) {
        throw new Error(`${wallet.name} does not support Solana transaction signing.`);
      }
      const serialized = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      const outputs = await feature.signTransaction({
        transaction: new Uint8Array(serialized),
        account,
        chain: "solana:mainnet",
      });
      const signed = outputs?.[0]?.signedTransaction;
      if (!signed) throw new Error(`${wallet.name} returned no signed transaction.`);
      return Transaction.from(signed);
    },
    async signMessage(message: Uint8Array) {
      const account = await standardAccount(choice, wallet);
      const feature = wallet.features?.["solana:signMessage"];
      if (!feature?.signMessage) {
        throw new Error(`${wallet.name} does not support message signing required by XLaunch.`);
      }
      const outputs = await feature.signMessage({ account, message });
      const signature = outputs?.[0]?.signature;
      if (!signature) throw new Error(`${wallet.name} returned no message signature.`);
      return { signature: new Uint8Array(signature) };
    },
  };
}

export function availableSolanaWallets(): WalletOption[] {
  if (typeof window === "undefined") return [];

  const options: WalletOption[] = [];
  const seen = new Set<string>();

  for (const wallet of getWallets().get()) {
    const features = wallet.features as Record<string, unknown>;
    const supportsSolana =
      wallet.chains?.some((chain) => String(chain).startsWith("solana:")) &&
      Boolean(features["standard:connect"]) &&
      Boolean(features["solana:signTransaction"]) &&
      Boolean(features["solana:signMessage"]);
    if (!supportsSolana) continue;

    const key = normalizeWalletName(wallet.name);
    seen.add(key);
    options.push({
      id: `standard:${encodeURIComponent(wallet.name)}`,
      label: wallet.name,
      available: true,
    });
  }

  for (const item of SOLANA_CATALOGUE) {
    const key = normalizeWalletName(item.label);
    if (seen.has(key)) continue;
    const available = Boolean(legacyProvider(item.id));
    options.push({
      id: item.id,
      label: available ? item.label : `${item.label} · not detected`,
      available,
    });
  }

  const knownLegacy = SOLANA_CATALOGUE
    .map((item) => legacyProvider(item.id))
    .filter(Boolean);
  if (window.solana && !knownLegacy.includes(window.solana)) {
    options.push({ id: "browser", label: "Other browser Solana wallet", available: true });
  }

  return options;
}

export function solanaProvider(choice?: SolanaWalletChoice): InjectedSolanaProvider {
  if (typeof window === "undefined") throw new Error("Solana wallet is unavailable.");
  if (!choice) throw new Error("Choose a Solana wallet before connecting.");

  const standard = standardWallet(choice);
  if (standard) return standardProvider(choice, standard as any);

  const wallet = legacyProvider(choice);
  if (!wallet) {
    throw new Error(
      "That wallet is not detected in this browser. Install/enable it, refresh XLaunch, then try again.",
    );
  }
  return wallet;
}

export async function connectSolanaWallet(choice?: SolanaWalletChoice) {
  const wallet = solanaProvider(choice);
  const result = await wallet.connect();
  return new PublicKey(result.publicKey.toString());
}

export async function signSolanaMessage(message: string, choice?: SolanaWalletChoice) {
  const wallet = solanaProvider(choice);
  const publicKey = await connectSolanaWallet(choice);
  if (!wallet.signMessage) {
    throw new Error(
      "This Solana wallet does not support message signing required to reserve an X post.",
    );
  }
  const signed = await wallet.signMessage(
    new TextEncoder().encode(message),
    "utf8",
  );
  return {
    wallet: publicKey.toBase58(),
    signature: btoa(
      Array.from(signed.signature, (byte) => String.fromCharCode(byte)).join(""),
    ),
  };
}

function rpcUrl() {
  return (
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com"
  );
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
  walletProvider?: SolanaWalletChoice;
};

export async function launchOnPump(input: PumpLaunchInput) {
  const wallet = solanaProvider(input.walletProvider);
  const user = await connectSolanaWallet(input.walletProvider);
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

  let signed: Transaction;
  try {
    signed = await wallet.signTransaction(transaction);
  } catch (error) {
    const tagged = error instanceof Error ? error : new Error("Wallet signature failed.");
    (tagged as Error & { launchBroadcasted?: boolean }).launchBroadcasted = false;
    throw tagged;
  }

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
  } catch (error) {
    const tagged = error instanceof Error ? error : new Error("Pump.fun broadcast failed.");
    (tagged as Error & { launchBroadcasted?: boolean }).launchBroadcasted = true;
    throw tagged;
  }

  try {
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      "confirmed",
    );
    if (confirmation.value.err) {
      const failed = new Error("Pump.fun launch transaction failed.");
      (failed as Error & { launchBroadcasted?: boolean }).launchBroadcasted = true;
      throw failed;
    }
  } catch (error) {
    const tagged = error instanceof Error ? error : new Error("Pump.fun confirmation failed.");
    (tagged as Error & { launchBroadcasted?: boolean }).launchBroadcasted = true;
    throw tagged;
  }

  return {
    wallet: user.toBase58(),
    txHash: signature,
    tokenAddress: mint.toBase58(),
    feeRecipient: feeRecipient.toBase58(),
  };
}


export async function claimPumpCreatorFees(args: {
  quoteMint: string;
  expectedRecipient?: string | null;
  walletProvider?: SolanaWalletChoice;
}) {
  const wallet = solanaProvider(args.walletProvider);
  const payer = await connectSolanaWallet(args.walletProvider);
  if (
    args.expectedRecipient &&
    payer.toBase58() !== args.expectedRecipient
  ) {
    throw new Error(
      "Connect the Pump.fun creator-fee recipient wallet shown on the token before claiming.",
    );
  }

  const connection = new Connection(rpcUrl(), "confirmed");
  const online = new OnlinePumpSdk(connection);
  const quoteMint = new PublicKey(args.quoteMint);
  const quote = await online.resolveQuoteMint(quoteMint);

  const instructions = quoteMint.equals(NATIVE_MINT)
    ? await online.collectCoinCreatorFeeInstructions(payer, payer)
    : await online.collectCoinCreatorFeeV2Instructions(
        payer,
        quoteMint,
        quote.quoteTokenProgram,
        payer,
      );

  if (!instructions.length) {
    throw new Error("Pump.fun returned no creator-fee claim instructions.");
  }

  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer,
    recentBlockhash: latest.blockhash,
  }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
    ...instructions,
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
    throw new Error("Pump.fun creator-fee claim failed.");
  }

  return {
    wallet: payer.toBase58(),
    txHash: signature,
    quoteMint: quoteMint.toBase58(),
  };
}
