import { NextRequest, NextResponse } from "next/server";
import { getSocialCommand, upsertProfile } from "@/lib/db";
import {
  oauthConfig,
  openPayload,
  sealPayload,
} from "@/lib/x-oauth";

export const runtime = "nodejs";

type OAuthCookie = {
  commandPostId?: string;
  returnTo?: string;
  state: string;
  verifier: string;
};

function safeReturnTo(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/profile";
  return value.slice(0, 500);
}

export async function GET(request: NextRequest) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://xlaunch.it").replace(/\/$/, "");
  const fail = (message: string) =>
    NextResponse.redirect(
      new URL("/?xAuthError=" + encodeURIComponent(message), origin),
    );

  try {
    const code = request.nextUrl.searchParams.get("code") || "";
    const state = request.nextUrl.searchParams.get("state") || "";
    const oauthCookie = request.cookies.get("xlaunch_x_oauth")?.value;
    const flow = oauthCookie ? openPayload<OAuthCookie>(oauthCookie) : null;

    if (!code || !state || !flow || flow.state !== state) {
      return fail("X sign-in session is invalid or expired.");
    }

    let command: any = null;
    if (flow.commandPostId) {
      command = await getSocialCommand(flow.commandPostId);
      if (!command) return fail("X launch command no longer exists.");
    }

    const { clientId, clientSecret, callbackUrl } = oauthConfig();
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      code_verifier: flow.verifier,
      client_id: clientId,
    });

    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
    };
    if (clientSecret) {
      headers.authorization =
        "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    }

    const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers,
      body: form,
      cache: "no-store",
    });
    const tokenBody = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenBody.access_token) {
      return fail("X did not complete authorization.");
    }

    const meUrl = new URL("https://api.x.com/2/users/me");
    meUrl.searchParams.set("user.fields", "name,username,profile_image_url");
    const meResponse = await fetch(meUrl, {
      headers: { authorization: `Bearer ${tokenBody.access_token}` },
      cache: "no-store",
    });
    const me = await meResponse.json();
    if (!meResponse.ok || !me?.data?.id || !me?.data?.username) {
      return fail("XLaunch could not verify the signed-in X account.");
    }

    if (command && String(me.data.id) !== String(command.x_user_id)) {
      return fail(
        `Sign in as @${command.author_handle}, the X account that wrote the launch command.`,
      );
    }

    await upsertProfile({
      xUserId: String(me.data.id),
      xHandle: String(me.data.username),
      displayName: String(me.data.name || ""),
      avatarUrl: String(me.data.profile_image_url || ""),
    });

    const destination = command
      ? `/social/confirm/${flow.commandPostId}`
      : safeReturnTo(flow.returnTo);

    const response = NextResponse.redirect(new URL(destination, origin));
    response.cookies.delete("xlaunch_x_oauth");
    response.cookies.set(
      "xlaunch_x_session",
      sealPayload(
        {
          xUserId: String(me.data.id),
          handle: String(me.data.username),
          displayName: String(me.data.name || ""),
          avatarUrl: String(me.data.profile_image_url || ""),
        },
        24 * 60 * 60 * 1000,
      ),
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 24 * 60 * 60,
      },
    );
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "X sign-in failed.");
  }
}
