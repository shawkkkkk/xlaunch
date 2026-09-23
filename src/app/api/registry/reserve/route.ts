import { NextRequest, NextResponse } from "next/server";
import { buildLaunchMetadata } from "@/lib/metadata";
import {
  getSocialAccount,
  getSocialCommand,
  reservePost,
  updateSocialCommandStatus,
} from "@/lib/db";
import { parseXPostUrl } from "@/lib/xpost";
import { resolveFeeDestination, type FeeRoute } from "@/lib/fees";
import { verifyReservationProof } from "@/lib/auth";
import { resolveVerifiedXSource } from "@/lib/x-source";
import { createDonateCharityConfig } from "@/lib/donate";
import { readXSession } from "@/lib/x-oauth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("Canonical registry is not configured yet.");

    const body = await request.json();
    const accountSession = readXSession(request.cookies.get("xlaunch_x_session")?.value);
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

    const socialCommandId = String(body.socialCommandId || "");
    let socialCommand: any = null;
    if (socialCommandId) {
      if (!/^\d+$/.test(socialCommandId)) {
        throw new Error("Invalid X social command id.");
      }

      socialCommand = await getSocialCommand(socialCommandId);
      if (!socialCommand) {
        throw new Error("The X social launch command no longer exists.");
      }

      if (!accountSession || String(accountSession.xUserId) !== String(socialCommand.x_user_id)) {
        return NextResponse.json(
          { error: "Sign in with the X account that wrote this launch command." },
          { status: 403 },
        );
      }

      if (
        String(socialCommand.source_post_id) !== post.id ||
        String(socialCommand.venue) !== venue
      ) {
        throw new Error("The X social command does not match this post and venue.");
      }

      const account = await getSocialAccount(String(socialCommand.x_user_id)) as any;
      const linkedWallet =
        venue === "pons" ? account?.evm_wallet : account?.solana_wallet;
      if (!linkedWallet) {
        throw new Error("Link the required wallet to this X account before launching.");
      }

      const walletMatches =
        venue === "pons"
          ? String(linkedWallet).toLowerCase() === wallet.toLowerCase()
          : String(linkedWallet) === wallet;
      if (!walletMatches) {
        throw new Error("Connect the wallet linked to this X account for the social launch.");
      }
    }

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
      creatorXUserId: accountSession?.xUserId ?? null,
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

    if (socialCommand) {
      await updateSocialCommandStatus({
        commandPostId: socialCommandId,
        status: "reserved",
      });
    }

    return NextResponse.json({ record, metadata, feeDestination });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reservation failed." },
      { status: 400 },
    );
  }
}
