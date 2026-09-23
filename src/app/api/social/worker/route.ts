import { NextRequest, NextResponse } from "next/server";
import {
  getBotState,
  getRegistryRecord,
  getSocialAccount,
  getSocialCommand,
  setBotState,
  setSocialCommandReply,
  upsertSocialCommand,
} from "@/lib/db";
import { parseSocialLaunchCommand } from "@/lib/social-command";
import { createSocialConfirmationToken } from "@/lib/social-token";
import { fetchXLaunchMentions, postXReply } from "@/lib/x-bot";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const expected =
    process.env.XLAUNCH_SOCIAL_WORKER_SECRET ||
    process.env.CRON_SECRET;
  return Boolean(
    expected && request.headers.get("authorization") === `Bearer ${expected}`,
  );
}

function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://xlaunch.it").replace(/\/$/, "");
}

function venueName(venue: string) {
  if (venue === "pumpfun") return "Pump.fun";
  if (venue === "stonkfun") return "StonkFun";
  return "Pons";
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const sinceId = await getBotState("x_mentions_since_id");
    const { mentions, users } = await fetchXLaunchMentions(sinceId);
    const ordered = [...mentions].sort((a, b) => {
      const aa = BigInt(a.id);
      const bb = BigInt(b.id);
      return aa < bb ? -1 : aa > bb ? 1 : 0;
    });

    const results: Array<Record<string, unknown>> = [];
    let highest = sinceId ? BigInt(sinceId) : 0n;

    for (const mention of ordered) {
      const mentionId = String(mention.id);
      const numericId = BigInt(mentionId);
      if (numericId > highest) highest = numericId;

      const existingCommand = await getSocialCommand(mentionId) as any;
      if (existingCommand?.reply_post_id) {
        results.push({ commandPostId: mentionId, state: "already_replied" });
        continue;
      }

      const parent = mention.referenced_tweets?.find(
        (item) => item.type === "replied_to",
      )?.id;
      if (!parent) {
        results.push({ commandPostId: mentionId, state: "ignored_not_reply" });
        continue;
      }

      const author = mention.author_id ? users.get(String(mention.author_id)) : undefined;
      if (!author?.id || !author.username) {
        results.push({ commandPostId: mentionId, state: "ignored_unknown_author" });
        continue;
      }

      let intent;
      try {
        intent = parseSocialLaunchCommand(mention.text);
      } catch {
        results.push({ commandPostId: mentionId, state: "ignored_unrecognized_command" });
        continue;
      }

      const registry = await getRegistryRecord(parent);
      if (registry?.status === "live") {
        const reply = await postXReply({
          replyToPostId: mentionId,
          text:
            `This post already has its canonical XLaunch token on ${venueName(registry.venue)}.\n\n` +
            `${siteOrigin()}/post/${parent}`,
        });
        results.push({
          commandPostId: mentionId,
          state: "already_tokenized",
          replyPostId: reply.id,
        });
        continue;
      }

      const account = await getSocialAccount(author.id) as any;
      const hasWallet =
        intent.venue === "pons"
          ? Boolean(account?.evm_wallet)
          : Boolean(account?.solana_wallet);

      const { hash } = createSocialConfirmationToken({
        commandPostId: mentionId,
        sourcePostId: parent,
        xUserId: author.id,
      });

      const command = await upsertSocialCommand({
        commandPostId: mentionId,
        sourcePostId: parent,
        xUserId: author.id,
        authorHandle: author.username,
        venue: intent.venue,
        intent: intent as unknown as Record<string, unknown>,
        confirmationTokenHash: hash,
        status: hasWallet ? "ready" : "awaiting_wallet",
      }) as any;

      if (command?.reply_post_id) {
        results.push({ commandPostId: mentionId, state: "already_replied" });
        continue;
      }

      const ticker = intent.symbol ? ` $${intent.symbol}` : "";
      const reply = await postXReply({
        replyToPostId: mentionId,
        text:
          `Ready to launch${ticker} on ${venueName(intent.venue)}.\n\n` +
          `Verify this X account and sign with your wallet:\n` +
          `${siteOrigin()}/social/confirm/${mentionId}`,
      });
      await setSocialCommandReply({
        commandPostId: mentionId,
        replyPostId: reply.id,
      });

      results.push({
        commandPostId: mentionId,
        sourcePostId: parent,
        state: hasWallet ? "ready" : "wallet_link_required",
        replyPostId: reply.id,
      });
    }

    if (ordered.length && highest > 0n) {
      await setBotState("x_mentions_since_id", highest.toString());
    }

    return NextResponse.json({
      processed: ordered.length,
      sinceId: highest ? highest.toString() : sinceId,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "X bot worker failed." },
      { status: 500 },
    );
  }
}
