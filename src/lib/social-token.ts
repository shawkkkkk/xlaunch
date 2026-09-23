import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

function secret() {
  const value =
    process.env.XLAUNCH_SOCIAL_CONFIRM_SECRET ||
    process.env.XLAUNCH_AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("XLaunch social confirmation signing is not configured.");
  }
  return value;
}

function payload(args: {
  commandPostId: string;
  sourcePostId: string;
  xUserId: string;
}) {
  return [
    "xlaunch-social-v1",
    args.commandPostId,
    args.sourcePostId,
    args.xUserId,
  ].join(":");
}

export function createSocialConfirmationToken(args: {
  commandPostId: string;
  sourcePostId: string;
  xUserId: string;
}) {
  const token = createHmac("sha256", secret())
    .update(payload(args))
    .digest("base64url");
  return { token, hash: hashSocialConfirmationToken(token) };
}

export function hashSocialConfirmationToken(token: string) {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

export function verifySocialConfirmationToken(token: string, expectedHash: string) {
  const actual = Buffer.from(hashSocialConfirmationToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
