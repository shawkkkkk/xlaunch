import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { isAddress } from "viem";
import { setProfileWallets } from "@/lib/db";
import { readXSession } from "@/lib/x-oauth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = readXSession(
      request.cookies.get("xlaunch_x_session")?.value,
    );
    if (!session) {
      return NextResponse.json({ error: "Sign in with X." }, { status: 401 });
    }

    const body = await request.json();
    const chain = String(body.chain || "");
    const address = String(body.address || "").trim();

    if (chain === "ethereum") {
      if (!isAddress(address)) {
        return NextResponse.json(
          { error: "Invalid EVM wallet address." },
          { status: 400 },
        );
      }

      const profile = await setProfileWallets({
        xUserId: session.xUserId,
        provider: "privy",
        evmAddress: address,
        evmProviderId: "privy",
      });
      if (!profile) {
        return NextResponse.json(
          { error: "XLaunch profile was not found." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, profile });
    }

    if (chain === "solana") {
      let canonical: string;
      try {
        canonical = new PublicKey(address).toBase58();
      } catch {
        return NextResponse.json(
          { error: "Invalid Solana wallet address." },
          { status: 400 },
        );
      }

      const profile = await setProfileWallets({
        xUserId: session.xUserId,
        provider: "privy",
        solanaAddress: canonical,
        solanaProviderId: "privy",
      });
      if (!profile) {
        return NextResponse.json(
          { error: "XLaunch profile was not found." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, profile });
    }

    return NextResponse.json(
      { error: "Unsupported wallet chain." },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Wallet sync failed.",
      },
      { status: 500 },
    );
  }
}
