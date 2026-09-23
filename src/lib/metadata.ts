import { z } from "zod";

const optionalUrl = z.string().trim().url().optional();

export type TokenMetadataInput = {
  postId: string;
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  farcaster?: string;
};

function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function canonicalPostPage(postId: string) {
  if (!/^\d+$/.test(postId)) throw new Error("Invalid X post id.");
  return `${siteOrigin()}/post/${postId}`;
}

export function resolveWebsite(postId: string, website?: string) {
  const candidate = website?.trim();
  if (!candidate) return canonicalPostPage(postId);
  return optionalUrl.parse(candidate);
}

export function buildLaunchMetadata(input: TokenMetadataInput) {
  const symbol = input.symbol.trim().replace(/^\$/, "").toUpperCase();
  if (!input.name.trim()) throw new Error("Token name is required.");
  if (!symbol) throw new Error("Ticker is required.");

  return {
    name: input.name.trim(),
    symbol,
    description: input.description?.trim() || `Tokenized from X post ${input.postId} through XLaunch.`,
    image: input.image?.trim() || "",
    source: {
      platform: "x",
      postId: input.postId,
      postUrl: `https://x.com/i/status/${input.postId}`,
      registry: canonicalPostPage(input.postId),
    },
    socials: {
      twitter: input.twitter?.trim() || `https://x.com/i/status/${input.postId}`,
      telegram: input.telegram?.trim() || "",
      discord: input.discord?.trim() || "",
      website: resolveWebsite(input.postId, input.website),
      farcaster: input.farcaster?.trim() || "",
    },
  };
}
