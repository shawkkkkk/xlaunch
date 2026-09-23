"use client";

import { useEffect, useMemo, useState } from "react";
import { connectRobinhoodWallet, signRobinhoodMessage } from "@/lib/pons-browser";
import { connectSolanaWallet, signSolanaMessage } from "@/lib/pump-browser";

type ConfirmData = {
  state: "ready" | "wallet_link_required" | "already_tokenized";
  sourceUrl?: string;
  linkedWallet?: string | null;
  identityVerified?: boolean;
  registry?: {
    token_address?: string | null;
    venue?: string;
  };
  command?: {
    commandPostId: string;
    sourcePostId: string;
    authorHandle: string;
    venue: "stonkfun" | "pons" | "pumpfun";
    intent: {
      symbol?: string;
      name?: string;
      feeRoute?: "author_xmoney" | "developer" | "custom";
      customFeeTarget?: string;
      stonkMode?: "standard" | "reward";
      rewardPercent?: number;
      pair?: string;
    };
    status: string;
  };
};

function launcherUrl(data: ConfirmData) {
  if (!data.command) return "/";
  const params = new URLSearchParams();
  params.set("social", data.command.commandPostId);
  params.set("post", data.command.sourcePostId);
  params.set("venue", data.command.venue);
  if (data.command.intent.symbol) params.set("symbol", data.command.intent.symbol);
  if (data.command.intent.name) params.set("name", data.command.intent.name);
  if (data.command.intent.feeRoute) params.set("feeRoute", data.command.intent.feeRoute);
  if (data.command.intent.customFeeTarget) params.set("customFeeWallet", data.command.intent.customFeeTarget);
  if (data.command.intent.stonkMode) params.set("stonkMode", data.command.intent.stonkMode);
  if (data.command.intent.rewardPercent != null) {
    params.set("rewardPercent", String(data.command.intent.rewardPercent));
  }
  if (data.command.intent.pair) params.set("pair", data.command.intent.pair);
  return `/?${params.toString()}`;
}

export default function SocialConfirmClient({
  commandPostId,
}: {
  commandPostId: string;
}) {
  const [data, setData] = useState<ConfirmData | null>(null);
  const [error, setError] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ command: commandPostId });
    fetch(`/api/social/confirm?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not verify launch command.");
        setData(body);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not verify launch command."));
  }, [commandPostId]);

  const continueUrl = useMemo(() => (data ? launcherUrl(data) : "/"), [data]);

  async function linkWallet() {
    if (!data?.command) return;
    setLinking(true);
    setError("");
    try {
      const venue = data.command.venue;
      const wallet =
        venue === "pons"
          ? await connectRobinhoodWallet()
          : (await connectSolanaWallet()).toBase58();

      const challengeResponse = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          postId: data.command.sourcePostId,
          venue,
          wallet,
        }),
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok) throw new Error(challenge.error || "Could not create wallet proof.");

      const proof =
        venue === "pons"
          ? await signRobinhoodMessage(challenge.message)
          : await signSolanaMessage(challenge.message);

      const linkResponse = await fetch("/api/social/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandPostId,
          wallet,
          auth: {
            token: challenge.token,
            signature: proof.signature,
          },
        }),
      });
      const linked = await linkResponse.json();
      if (!linkResponse.ok) throw new Error(linked.error || "Could not link wallet.");

      setData((current) =>
        current
          ? {
              ...current,
              state: "ready",
              linkedWallet: linked.linkedWallet || wallet,
            }
          : current,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not link wallet.");
    } finally {
      setLinking(false);
    }
  }

  if (error) {
    return <section className="socialConfirm"><div className="socialError">{error}</div></section>;
  }
  if (!data) {
    return <section className="socialConfirm"><div className="sectionLabel">VERIFYING X COMMAND…</div></section>;
  }

  if (data.state === "already_tokenized") {
    return (
      <section className="socialConfirm">
        <div className="sectionLabel">POST ALREADY TOKENIZED</div>
        <h1>ONE POST.<br />ONE TOKEN.</h1>
        <p>This X post already has its canonical XLaunch token.</p>
        <a className="socialPrimary" href={`/post/${data.command?.sourcePostId || ""}`}>
          VIEW TOKEN →
        </a>
      </section>
    );
  }

  const intent = data.command!.intent;

  return (
    <section className="socialConfirm">
      <div className="sectionLabel">X SOCIAL LAUNCH / {data.command!.commandPostId}</div>
      <h1>READY TO<br />LAUNCH.</h1>

      <div className="socialCommandGrid">
        <div>
          <span>SOURCE POST</span>
          <a href={data.sourceUrl} target="_blank" rel="noreferrer">
            x.com/i/status/{data.command!.sourcePostId} ↗
          </a>
        </div>
        <div><span>REQUESTED BY</span><b>@{data.command!.authorHandle}</b></div>
        <div><span>VENUE</span><b>{data.command!.venue.toUpperCase()}</b></div>
        <div><span>TICKER</span><b>{intent.symbol ? "$" + intent.symbol : "SET BEFORE LAUNCH"}</b></div>
        {intent.stonkMode && <div><span>MODE</span><b>{intent.stonkMode.toUpperCase()}</b></div>}
        {intent.rewardPercent != null && <div><span>REWARD FEE</span><b>{intent.rewardPercent}%</b></div>}
        {intent.pair && <div><span>PAIR</span><b>{intent.pair}</b></div>}
        {intent.feeRoute && <div><span>CREATOR FEES</span><b>{intent.feeRoute.replaceAll("_", " ").toUpperCase()}</b></div>}
      </div>

      {!data.identityVerified ? (
        <div className="socialWallet">
          <span>X IDENTITY REQUIRED</span>
          <code>Verify @{data.command!.authorHandle} before linking a wallet.</code>
          <a
            className="socialLinkWallet"
            href={`/api/x/oauth/start?command=${encodeURIComponent(commandPostId)}`}
          >
            VERIFY WITH X →
          </a>
        </div>
      ) : (
        <div className="socialWallet">
          <span>{data.linkedWallet ? "LINKED WALLET" : "WALLET REQUIRED"}</span>
          <code>{data.linkedWallet || "Connect once to link this X account."}</code>
          {!data.linkedWallet && (
            <button type="button" className="socialLinkWallet" onClick={linkWallet} disabled={linking}>
              {linking
                ? "LINKING…"
                : data.command!.venue === "pons"
                  ? "LINK EVM WALLET"
                  : "LINK SOLANA WALLET"}
            </button>
          )}
        </div>
      )}

      <p className="socialFine">
        XLaunch stores only the public wallet address linked to this verified X user. It never
        receives a seed phrase or private key. The next screen revalidates live venue settings,
        reserves the parent X post across all three venues, and asks your wallet to sign the
        actual launch transaction.
      </p>

      {data.identityVerified && data.linkedWallet ? (
        <a className="socialPrimary" href={continueUrl}>
          REVIEW & SIGN →
        </a>
      ) : (
        <div className="socialBlocked">
          Verify the command author and link the required wallet to continue.
        </div>
      )}
    </section>
  );
}
