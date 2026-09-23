import { NextRequest, NextResponse } from "next/server";
import {
  createReservationChallenge,
  type ChallengeVenue,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const venue = String(body.venue ?? "") as ChallengeVenue;
    if (!["stonkfun", "pons", "pumpfun"].includes(venue)) {
      throw new Error("Invalid venue.");
    }

    return NextResponse.json(
      createReservationChallenge({
        postId: String(body.postId ?? ""),
        venue,
        wallet: String(body.wallet ?? ""),
      }),
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create reservation challenge.",
      },
      { status: 400 },
    );
  }
}
