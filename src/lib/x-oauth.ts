import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

type SignedPayload<T> = {
  data: T;
  exp: number;
};

function secret() {
  const value =
    process.env.XLAUNCH_X_SESSION_SECRET ||
    process.env.XLAUNCH_AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("XLaunch X-session signing is not configured.");
  }
  return value;
}

function sign(encoded: string) {
  return createHmac("sha256", secret()).update(encoded).digest("base64url");
}

export function sealPayload<T>(data: T, ttlMs: number) {
  const payload: SignedPayload<T> = { data, exp: Date.now() + ttlMs };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function openPayload<T>(token: string): T | null {
  const [encoded, signature, ...rest] = String(token || "").split(".");
  if (!encoded || !signature || rest.length) return null;
  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SignedPayload<T>;
    if (!Number.isFinite(payload.exp) || payload.exp < Date.now()) return null;
    return payload.data;
  } catch {
    return null;
  }
}

export function createPkce() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createOAuthState() {
  return randomBytes(24).toString("base64url");
}

export function oauthConfig() {
  const clientId = process.env.X_API_CLIENT_ID?.trim();
  if (!clientId) throw new Error("X OAuth client id is not configured.");

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://xlaunch.it").replace(/\/$/, "");
  return {
    clientId,
    clientSecret: process.env.X_API_CLIENT_SECRET?.trim() || "",
    callbackUrl: `${origin}/api/x/oauth/callback`,
  };
}

export type XSession = {
  xUserId: string;
  handle: string;
};

export function readXSession(cookieValue?: string | null) {
  return cookieValue ? openPayload<XSession>(cookieValue) : null;
}
