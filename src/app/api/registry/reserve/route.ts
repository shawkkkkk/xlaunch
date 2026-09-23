import { NextRequest, NextResponse } from "next/server";
import { buildLaunchMetadata } from "@/lib/metadata";
import { reservePost } from "@/lib/db";
import { parseXPostUrl } from "@/lib/xpost";
import { resolveFeeDestination, type FeeRoute } from "@/lib/fees";
import { verifyReservationProof } from "@/lib/auth";
import { resolveVerifiedXSource } from "@/lib/x-source";
import { createDonateCharityConfig } from "@/lib/donate";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("Canonical registry is not configured yet.");

    const body = await request.json();
    const venue =
      body.venue === "pons"
        ? "pons"
        : body.venue === "stonkfun"
          ? "stonkfun"
          : body.venue === "pumpfun"
            ? "pumpfun"
            : null;
    if (!venue) throw new Error("Invalid venue.");

    const post = parseXPostUrl(String(body.postUrl ?? ""));
    if (post.id !== String(body.postId ?? "")) throw new Error("Source post does not match.");

    const wallet = String(body.wallet ?? "").trim();
    if (!wallet) throw new Error("Wallet is required.");

    await verifyReservationProof({
      token: String(body.auth?.token ?? ""),
      signature: String(body.auth?.signature ?? ""),
      postId: post.id,
      venue,
      wallet,
    });

    const source = await resolveVerifiedXSource(post.id);

    const requestedFeeRoute = String(body.feeRoute || "developer") as FeeRoute;
    const forcedHolderRewards =
      (venue === "stonkfun" && body.stonkMode === "reward") ||
      (venue === "pumpfun" && Boolean(body.pumpHolderReward));

    const feeDestination = resolveFeeDestination({
      venue,
      stonkMode: body.stonkMode === "reward" ? "reward" : "standard",
      route: forcedHolderRewards ? "holder_rewards" : requestedFeeRoute,
      developerWallet: wallet,
      customWallet: String(body.customFeeWallet ?? ""),
      authorHandle: source.handle,
    });

    const donationConfig =
      feeDestination.route === "charity"
        ? await createDonateCharityConfig(String(body.charityId ?? ""))
        : null;

    const metadata = buildLaunchMetadata({
      postId: post.id,
      postUrl: source.url,
      name: String(body.name ?? ""),
      symbol: String(body.symbol ?? ""),
      description: String(body.description ?? ""),
      image: String(body.image ?? ""),
      website: String(body.website ?? ""),
      telegram: String(body.telegram ?? ""),
      discord: String(body.discord ?? ""),
      farcaster: String(body.farcaster ?? ""),
    });

    const launchConfig =
      venue === "stonkfun"
        ? {
            quoteMint: String(body.launchConfig?.quoteMint ?? ""),
            mode: body.launchConfig?.mode === "reward" ? "reward" : "standard",
            rewardBps: Number(body.launchConfig?.rewardBps ?? 0),
            openingBuy: String(body.launchConfig?.openingBuy ?? "0"),
          }
        : venue === "pumpfun"
          ? {
              quoteMint: String(body.launchConfig?.quoteMint ?? ""),
              quoteSource: String(body.launchConfig?.quoteSource ?? ""),
              mayhemMode: Boolean(body.launchConfig?.mayhemMode),
              holderReward: Boolean(body.launchConfig?.holderReward),
              creatorFeeBps: Number(body.launchConfig?.creatorFeeBps ?? 0),
            }
          : {
              pairToken: String(body.launchConfig?.pairToken ?? "ETH"),
              launchConfigId: Number(body.launchConfig?.launchConfigId ?? 0),
              creatorTaxBps: Number(body.launchConfig?.creatorTaxBps ?? 0),
              buybackEnabled: Boolean(body.launchConfig?.buybackEnabled),
            };

    const storedMetadata = {
      ...metadata,
      xlaunch: {
        venue,
        launchConfig,
        feeDestination,
        sourceAuthor: {
          handle: source.handle,
          name: source.authorName,
        },
        donationConfig: donationConfig
          ? {
              configId: donationConfig.configId,
              feeBps: donationConfig.feeBps,
              charity: {
                id: donationConfig.charity.id,
                slug: donationConfig.charity.slug,
                name: donationConfig.charity.name,
                logo: donationConfig.charity.logo,
                website: donationConfig.charity.website,
                status: donationConfig.charity.status,
              },
            }
          : null,
      },
    };

    const record = await reservePost({
      postId: post.id,
      postUrl: metadata.source.postUrl,
      venue,
      chain: venue === "pons" ? "robinhood" : "solana",
      wallet,
      tokenName: metadata.name,
      tokenSymbol: metadata.symbol,
      metadata: storedMetadata,
      feeRoute: feeDestination.route,
      feeRecipientHandle: feeDestination.recipientHandle,
      feeRecipientWallet: feeDestination.recipientWallet,
      // A user's selection is only a request until the confirmed launch
      // transaction proves the venue and fee recipient onchain.
      feeRoutingStatus: "requested",
    });

    if (!record) {
      return NextResponse.json(
        { error: "This post is already reserved or tokenized through XLaunch." },
        { status: 409 },
      );
    }

    return NextResponse.json({ record, metadata, feeDestination });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reservation failed." },
      { status: 400 },
    );
  }
}
