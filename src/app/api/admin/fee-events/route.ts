import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getRegistryRecord,
  recordFeeEvent,
  type FeeEventType,
} from "@/lib/db";

export const runtime = "nodejs";

const EVENT_TYPES = new Set<FeeEventType>([
  "accrued",
  "claimed",
  "converted",
  "xmoney_sent",
  "xmoney_expired",
  "refunded",
]);

function authorized(request: NextRequest) {
  const expected = process.env.XLAUNCH_LEDGER_ADMIN_TOKEN;
  if (!expected) return false;

  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!supplied) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  try {
    if (!authorized(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const postId = String(body.postId ?? "");
    const eventType = String(body.eventType ?? "") as FeeEventType;

    if (!/^\d+$/.test(postId)) throw new Error("Invalid post id.");
    if (!EVENT_TYPES.has(eventType)) throw new Error("Invalid fee event type.");

    const record = await getRegistryRecord(postId);
    if (!record || record.status !== "live") {
      throw new Error("Fee events can only be attached to a confirmed XLaunch token.");
    }

    const proofUrl = body.proofUrl ? String(body.proofUrl).trim() : null;
    if (proofUrl) new URL(proofUrl);

    if (eventType === "xmoney_sent") {
      if (record.fee_route !== "author_xmoney") {
        throw new Error("This token is not configured for X Money author payouts.");
      }
      if (!proofUrl) {
        throw new Error("An X Money payout requires a public proof URL.");
      }
    }

    const event = await recordFeeEvent({
      postId,
      eventType,
      asset: body.asset ? String(body.asset).trim() : null,
      amount: body.amount ? String(body.amount).trim() : null,
      usdAmount: body.usdAmount ? String(body.usdAmount).trim() : null,
      chainTxHash: body.chainTxHash ? String(body.chainTxHash).trim() : null,
      proofUrl,
      note: body.note ? String(body.note).trim().slice(0, 1000) : null,
    });

    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not record fee event.",
      },
      { status: 400 },
    );
  }
}
