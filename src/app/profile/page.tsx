import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getProfile,
  getProfileFeeEvents,
  getProfileTokens,
  getWalletActivity,
} from "@/lib/db";
import { readXSession } from "@/lib/x-oauth";
import ProfileClient from "@/components/ProfileClient";
import PrivyProfileProvider from "@/components/PrivyProfileProvider";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const jar = await cookies();
  const session = readXSession(jar.get("xlaunch_x_session")?.value);

  if (!session) {
    return (
      <main>
        <nav>
          <a className="logo" href="/">XLAUNCH</a>
          <div className="navRule">PROFILE</div>
          <a className="wallet tokenBack" href="/api/x/oauth/start?returnTo=%2Fprofile">
            SIGN IN WITH X
          </a>
        </nav>
        <section className="profileSignedOut">
          <div className="sectionLabel">XLAUNCH ACCOUNT</div>
          <h1>YOUR TOKENS.<br />YOUR FEES.<br />YOUR WALLETS.</h1>
          <p>
            Sign in with X to view launches tied to your X identity, creator-fee
            activity and your XLaunch wallets.
          </p>
          <a className="socialPrimary" href="/api/x/oauth/start?returnTo=%2Fprofile">
            CONTINUE WITH X →
          </a>
        </section>
      </main>
    );
  }

  const [profile, tokens, fees, activity] = await Promise.all([
    getProfile(session.xUserId),
    getProfileTokens(session.xUserId),
    getProfileFeeEvents(session.xUserId),
    getWalletActivity(session.xUserId),
  ]);

  if (!profile) redirect("/api/x/oauth/start?returnTo=%2Fprofile");

  return (
    <main>
      <nav>
        <a className="logo" href="/">XLAUNCH</a>
        <div className="navRule">PROFILE / @{profile.x_handle}</div>
        <div className="navActions"><a className="profileLink" href="/explore">EXPLORE</a><a className="profileLink" href="/docs">DOCS</a><a className="wallet tokenBack" href="/">LAUNCH</a></div>
      </nav>
      {process.env.NEXT_PUBLIC_PRIVY_APP_ID ? (
        <PrivyProfileProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID}>
          <ProfileClient
            profile={profile}
            tokens={tokens as any[]}
            fees={fees as any[]}
            activity={activity as any[]}
            walletProviderConfigured
          />
        </PrivyProfileProvider>
      ) : (
        <ProfileClient
          profile={profile}
          tokens={tokens as any[]}
          fees={fees as any[]}
          activity={activity as any[]}
          walletProviderConfigured={false}
        />
      )}
    </main>
  );
}
