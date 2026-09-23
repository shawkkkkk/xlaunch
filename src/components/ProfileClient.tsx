"use client";

import { useEffect, useMemo, useState } from "react";

type ProfileData = {
  authenticated: boolean;
  profile: {
    x_user_id: string;
    x_handle: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  wallets: {
    evm: string | null;
    solana: string | null;
    provider: string | null;
    embeddedProvisioningConfigured: boolean;
    keyExportConfigured: boolean;
  };
  tokens: Array<any>;
  fees: Array<any>;
  activity: Array<any>;
};

type Tab = "tokens" | "fees" | "wallet" | "activity";

function short(value?: string | null) {
  if (!value) return "—";
  if (value.length < 16) return value;
  return value.slice(0, 7) + "…" + value.slice(-6);
}

export default function ProfileClient() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [tab, setTab] = useState<Tab>("tokens");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/profile/me", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.href = "/api/x/oauth/start?returnTo=/profile";
          return null;
        }
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Profile unavailable.");
        return body;
      })
      .then((body) => body && setData(body))
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Profile unavailable."),
      );
  }, []);

  const totalFeeEvents = data?.fees?.length || 0;
  const liveTokens = data?.tokens?.length || 0;
  const walletCount = Number(Boolean(data?.wallets.evm)) + Number(Boolean(data?.wallets.solana));

  const tabs: Array<{ id: Tab; label: string; count?: number }> = useMemo(
    () => [
      { id: "tokens", label: "TOKENS", count: liveTokens },
      { id: "fees", label: "FEES", count: totalFeeEvents },
      { id: "wallet", label: "WALLET", count: walletCount },
      { id: "activity", label: "ACTIVITY", count: data?.activity?.length || 0 },
    ],
    [liveTokens, totalFeeEvents, walletCount, data?.activity?.length],
  );

  async function logout() {
    await fetch("/api/profile/logout", { method: "POST" });
    window.location.href = "/";
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
  }

  if (error) {
    return <section className="profileShell"><div className="socialError">{error}</div></section>;
  }

  if (!data) {
    return <section className="profileShell"><div className="sectionLabel">LOADING PROFILE…</div></section>;
  }

  return (
    <section className="profileShell">
      <header className="profileHeader">
        <div className="profileIdentity">
          {data.profile.avatar_url ? (
            <img src={data.profile.avatar_url} alt="" />
          ) : (
            <div className="profileAvatar">X</div>
          )}
          <div>
            <div className="sectionLabel">XLAUNCH PROFILE</div>
            <h1>{data.profile.display_name || "XLAUNCHER"}</h1>
            <a
              href={"https://x.com/" + data.profile.x_handle}
              target="_blank"
              rel="noreferrer"
            >
              @{data.profile.x_handle} ↗
            </a>
          </div>
        </div>

        <div className="profileStats">
          <div><b>{liveTokens}</b><span>TOKENS</span></div>
          <div><b>{walletCount}</b><span>WALLETS</span></div>
          <div><b>{totalFeeEvents}</b><span>FEE EVENTS</span></div>
        </div>
      </header>

      <div className="profileTabs">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            <small>{item.count ?? 0}</small>
          </button>
        ))}
      </div>

      {tab === "tokens" && (
        <div className="profilePanel">
          <div className="panelHead">
            <div>
              <div className="sectionLabel">CANONICAL LAUNCHES</div>
              <h2>YOUR TOKENS.</h2>
            </div>
            <a className="profileAction" href="/">LAUNCH A POST →</a>
          </div>

          {data.tokens.length ? (
            <div className="profileRows">
              {data.tokens.map((token) => (
                <a className="profileRow" href={"/post/" + token.post_id} key={token.post_id}>
                  <div className="tokenMono">{"$" + token.token_symbol}</div>
                  <div><b>{token.token_name}</b><span>{token.venue.toUpperCase()} · {token.chain.toUpperCase()}</span></div>
                  <code>{short(token.token_address)}</code>
                  <span>{token.fee_route.replaceAll("_", " ").toUpperCase()}</span>
                  <i>VIEW →</i>
                </a>
              ))}
            </div>
          ) : (
            <div className="profileEmpty">No confirmed XLaunch tokens yet.</div>
          )}
        </div>
      )}

      {tab === "fees" && (
        <div className="profilePanel">
          <div className="panelHead">
            <div>
              <div className="sectionLabel">CREATOR FEE LEDGER</div>
              <h2>FEES.</h2>
            </div>
            <button className="profileAction disabled" disabled>
              CLAIM ALL — COMING ONLINE
            </button>
          </div>

          {data.fees.length ? (
            <div className="profileRows">
              {data.fees.map((event) => (
                <div className="profileRow" key={String(event.id)}>
                  <div className="tokenMono">{"$" + event.token_symbol}</div>
                  <div><b>{String(event.event_type).replaceAll("_", " ").toUpperCase()}</b><span>{event.venue.toUpperCase()}</span></div>
                  <code>{event.amount ? String(event.amount) + " " + String(event.asset || "") : "—"}</code>
                  <span>{new Date(event.created_at).toLocaleDateString()}</span>
                  {event.proof_url ? <a href={event.proof_url} target="_blank" rel="noreferrer">PROOF ↗</a> : <i>—</i>}
                </div>
              ))}
            </div>
          ) : (
            <div className="profileEmpty">
              Fee accruals, claims, X Money payouts, and charity settlements will appear here.
            </div>
          )}

          <div className="profileNotice">
            Claim execution is being wired venue-by-venue. XLaunch will never mark fees claimed
            until the claim transaction is confirmed.
          </div>
        </div>
      )}

      {tab === "wallet" && (
        <div className="profilePanel">
          <div className="panelHead">
            <div>
              <div className="sectionLabel">EMBEDDED + LINKED WALLETS</div>
              <h2>WALLET.</h2>
            </div>
            <div className="walletProviderState">
              {data.wallets.embeddedProvisioningConfigured ? "EMBEDDED WALLET READY" : "EMBEDDED WALLET SETUP PENDING"}
            </div>
          </div>

          <div className="walletCards">
            <div className="walletCard">
              <div className="walletCardHead"><span>EVM</span><b>ETHEREUM + ROBINHOOD</b></div>
              <code>{data.wallets.evm || "No EVM wallet linked yet."}</code>
              <div className="walletActions">
                {data.wallets.evm && <button onClick={() => copy(data.wallets.evm!)}>COPY / RECEIVE</button>}
                <button disabled={!data.wallets.evm}>SEND</button>
                <button disabled={!data.wallets.evm}>SWAP</button>
                <button disabled={!data.wallets.evm}>BRIDGE</button>
              </div>
            </div>

            <div className="walletCard">
              <div className="walletCardHead"><span>SOLANA</span><b>SOLANA</b></div>
              <code>{data.wallets.solana || "No Solana wallet linked yet."}</code>
              <div className="walletActions">
                {data.wallets.solana && <button onClick={() => copy(data.wallets.solana!)}>COPY / RECEIVE</button>}
                <button disabled={!data.wallets.solana}>SEND</button>
                <button disabled={!data.wallets.solana}>SWAP</button>
                <button disabled={!data.wallets.solana}>BRIDGE</button>
              </div>
            </div>
          </div>

          <div className="keyExportBox">
            <div>
              <span>PRIVATE KEY EXPORT</span>
              <b>USER-CONTROLLED EXPORT ONLY.</b>
              <p>
                XLaunch will never store or render plaintext private keys from its own database.
                Export will require fresh authentication and the embedded-wallet provider&apos;s
                user-authorized export flow.
              </p>
            </div>
            <button disabled={!data.wallets.keyExportConfigured}>RE-AUTH & EXPORT</button>
          </div>

          <div className="walletToolGrid">
            <button disabled>SEND</button>
            <button disabled>SWAP</button>
            <button disabled>BRIDGE</button>
            <button onClick={() => setTab("activity")}>ACTIVITY →</button>
          </div>
        </div>
      )}

      {tab === "activity" && (
        <div className="profilePanel">
          <div className="panelHead">
            <div>
              <div className="sectionLabel">WALLET HISTORY</div>
              <h2>ACTIVITY.</h2>
            </div>
          </div>
          {data.activity.length ? (
            <div className="profileRows">
              {data.activity.map((item) => (
                <div className="profileRow" key={String(item.id)}>
                  <div className="tokenMono">{String(item.operation).toUpperCase()}</div>
                  <div><b>{item.chain.toUpperCase()}</b><span>{item.status.toUpperCase()}</span></div>
                  <code>{short(item.tx_hash)}</code>
                  <span>{new Date(item.created_at).toLocaleString()}</span>
                  <i>{item.status === "confirmed" ? "✓" : "…"}</i>
                </div>
              ))}
            </div>
          ) : (
            <div className="profileEmpty">Wallet activity will appear here.</div>
          )}
        </div>
      )}

      <button className="profileLogout" onClick={logout}>SIGN OUT</button>
    </section>
  );
}
