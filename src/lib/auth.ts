import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  isAddress,
  verifyMessage,
  type Address,
  type Hex,
} from "viem";

export type ChallengeVenue = "stonkfun" | "pons" | "pumpfun";

type ChallengePayload = {
  version: 1;
  postId: string;
  venue: ChallengeVenue;
  wallet: string;
  chain: "solana" | "robinhood";
  expiresAt: number;
  nonce: string;
};

function secret() {
  const value = process.env.XLAUNCH_AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "XLaunch reservation authentication is not configured.",
    );
  }
  return value;
}

function chainForVenue(venue: ChallengeVenue) {
  return venue === "pons" ? "robinhood" : "solana";
}

function canonicalWallet(wallet: string, venue: ChallengeVenue) {
  if (venue === "pons") {
    if (!isAddress(wallet)) throw new Error("Invalid EVM wallet.");
    return wallet.toLowerCase();
  }
  return new PublicKey(wallet).toBase58();
}

function messageFor(payload: ChallengePayload) {
  return [
    "XLaunch canonical reservation",
    "",
    `Post: ${payload.postId}`,
    `Venue: ${payload.venue}`,
    `Wallet: ${payload.wallet}`,
    `Expires: ${new Date(payload.expiresAt).toISOString()}`,
    `Nonce: ${payload.nonce}`,
  ].join("\n");
}

function mac(encoded: string) {
  return createHmac("sha256", secret()).update(encoded).digest("base64url");
}

export function createReservationChallenge(args: {
  postId: string;
  venue: ChallengeVenue;
  wallet: string;
}) {
  if (!/^\d+$/.test(args.postId)) throw new Error("Invalid X post id.");

  const payload: ChallengePayload = {
    version: 1,
    postId: args.postId,
    venue: args.venue,
    wallet: canonicalWallet(args.wallet, args.venue),
    chain: chainForVenue(args.venue),
    expiresAt: Date.now() + 5 * 60 * 1000,
    nonce: randomBytes(16).toString("hex"),
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encoded}.${mac(encoded)}`;

  return {
    token,
    message: messageFor(payload),
    expiresAt: payload.expiresAt,
  };
}

function decodeChallenge(token: string) {
  const [encoded, suppliedMac, ...rest] = token.split(".");
  if (!encoded || !suppliedMac || rest.length) {
    throw new Error("Invalid reservation challenge.");
  }

  const expectedMac = mac(encoded);
  const a = Buffer.from(expectedMac);
  const b = Buffer.from(suppliedMac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid reservation challenge.");
  }

  let payload: ChallengePayload;
  try {
    payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as ChallengePayload;
  } catch {
    throw new Error("Invalid reservation challenge.");
  }

  if (
    payload.version !== 1 ||
    !/^\d+$/.test(payload.postId) ||
    !["stonkfun", "pons", "pumpfun"].includes(payload.venue) ||
    payload.chain !== chainForVenue(payload.venue) ||
    !Number.isSafeInteger(payload.expiresAt)
  ) {
    throw new Error("Invalid reservation challenge.");
  }

  if (payload.expiresAt < Date.now()) {
    throw new Error("Reservation signature expired. Sign a new challenge.");
  }
  if (payload.expiresAt > Date.now() + 6 * 60 * 1000) {
    throw new Error("Invalid reservation challenge expiry.");
  }

  payload.wallet = canonicalWallet(payload.wallet, payload.venue);
  return payload;
}

export async function verifyReservationProof(args: {
  token: string;
  signature: string;
  postId: string;
  venue: ChallengeVenue;
  wallet: string;
}) {
  const payload = decodeChallenge(args.token);
  const wallet = canonicalWallet(args.wallet, args.venue);

  if (
    payload.postId !== args.postId ||
    payload.venue !== args.venue ||
    payload.wallet !== wallet
  ) {
    throw new Error(
      "Reservation signature does not match this post, venue, and wallet.",
    );
  }

  const message = messageFor(payload);

  if (payload.chain === "robinhood") {
    if (!/^0x[0-9a-fA-F]+$/.test(args.signature)) {
      throw new Error("Invalid EVM reservation signature.");
    }
    const valid = await verifyMessage({
      address: wallet as Address,
      message,
      signature: args.signature as Hex,
    });
    if (!valid) throw new Error("Wallet reservation signature is invalid.");
  } else {
    const signature = Buffer.from(args.signature, "base64");
    if (signature.length !== nacl.sign.signatureLength) {
      throw new Error("Invalid Solana reservation signature.");
    }
    const valid = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      signature,
      new PublicKey(wallet).toBytes(),
    );
    if (!valid) throw new Error("Wallet reservation signature is invalid.");
  }

  return payload;
}
