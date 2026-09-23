import { z } from "zod";

const optionalUrl = z.string().trim().url().optional();

export type TokenMetadataInput = {
  postId: string;
  postUrl?: string;
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  website?: string;
  telegram?: string;
  discord?: string;
  farcaster?: string;
};

export function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return "https://launchonx.net";
}

export function canonicalPostPage(postId: string) {
  if (!/^\d+$/.test(postId)) throw new Error("Invalid X post id.");
  return `${siteOrigin()}/post/${postId}`;
}

export function defaultPostImage(postId: string) {
  if (!/^\d+$/.test(postId)) throw new Error("Invalid X post id.");
  return `${siteOrigin()}/api/post-card/${postId}`;
}

export function canonicalXPostUrl(postId: string, postUrl?: string) {
  if (!/^\d+$/.test(postId)) throw new Error("Invalid X post id.");
  const candidate = postUrl?.trim();
  if (candidate) {
    const parsed = new URL(candidate);
    if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(parsed.hostname.toLowerCase())) {
      throw new Error("Twitter link must point to X.");
    }
    if (!parsed.pathname.match(new RegExp(`/status/${postId}(?:/|$)`, "i"))) {
      throw new Error("Twitter link must match the source X post.");
    }
    parsed.protocol = "https:";
    parsed.hostname = "x.com";
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/(photo|video)\/\d+.*$/i, "");
    return parsed.toString().replace(/\/$/, "");
  }
  return `https://x.com/i/status/${postId}`;
}

export function resolveWebsite(website?: string) {
  const candidate = website?.trim();
  if (!candidate) return siteOrigin();
  return optionalUrl.parse(candidate);
}

export function buildLaunchMetadata(input: TokenMetadataInput) {
  const symbol = input.symbol.trim().replace(/^\$/, "").toUpperCase();
  if (!input.name.trim()) throw new Error("Token name is required.");
  if (!symbol) throw new Error("Ticker is required.");

  const twitter = canonicalXPostUrl(input.postId, input.postUrl);

  return {
    name: input.name.trim(),
    symbol,
    description: input.description?.trim() || `Tokenized from X post ${input.postId} through XLaunch.`,
    image: input.image?.trim() || defaultPostImage(input.postId),
    source: {
      platform: "x",
      postId: input.postId,
      postUrl: twitter,
      registry: canonicalPostPage(input.postId),
    },
    socials: {
      // Immutable by product design: a token always points back to the X post
      // it was minted from. The launcher cannot replace this with another X link.
      twitter,
      telegram: input.telegram?.trim() || "",
      discord: input.discord?.trim() || "",
      website: resolveWebsite(input.website),
      farcaster: input.farcaster?.trim() || "",
    },
  };
}
