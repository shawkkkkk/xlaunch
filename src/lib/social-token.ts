import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function createSocialConfirmationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashSocialConfirmationToken(token) };
}

export function hashSocialConfirmationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifySocialConfirmationToken(token: string, expectedHash: string) {
  const actual = Buffer.from(hashSocialConfirmationToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
