import { NextRequest, NextResponse } from "next/server";
import { getSocialCommand } from "@/lib/db";
import {
  createOAuthState,
  createPkce,
  oauthConfig,
  sealPayload,
} from "@/lib/x-oauth";

export const runtime = "nodejs";

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/profile";
  return value.slice(0, 500);
}

export async function GET(request: NextRequest) {
  try {
    const commandPostId = request.nextUrl.searchParams.get("command") || "";
    const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));

    if (commandPostId) {
      if (!/^\d+$/.test(commandPostId)) throw new Error("Invalid X launch command.");
      const command = await getSocialCommand(commandPostId);
      if (!command) {
        return NextResponse.json({ error: "Unknown X launch command." }, { status: 404 });
      }
    }

    const { clientId, callbackUrl } = oauthConfig();
    const { verifier, challenge } = createPkce();
    const state = createOAuthState();

    const authUrl = new URL("https://x.com/i/oauth2/authorize");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("scope", "tweet.read users.read");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    const response = NextResponse.redirect(authUrl);
    response.cookies.set(
      "xlaunch_x_oauth",
      sealPayload({ commandPostId, returnTo, state, verifier }, 10 * 60 * 1000),
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60,
      },
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start X sign-in." },
      { status: 400 },
    );
  }
}
