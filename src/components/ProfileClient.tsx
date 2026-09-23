"use client";

import { useMemo, useState } from "react";
import PrivyWalletPanel from "@/components/PrivyWalletPanel";

type Profile = {
  x_user_id: string;
  x_handle: string;
  display_name: string | null;
  avatar_url: string | null;
  evm_wallet_address: string | null;
  solana_wallet_address: string | null;
  wallet_provider: string | null;
};

type Token = {
  post_id: string;
  post_url: string;
  venue: string;
  chain: string;
  token_name: string;
  token_symbol: string;
  token_address: string | null;
  tx_hash: string | null;
  fee_route: string;
  fee_routing_status: string;
  confirmed_at: string | null;
};

type FeeEvent = {
  id: string | number;
  post_id: string;
  event_type: string;
  asset: string | null;
  amount: string | null;
  usd_amount: string | null;
  chain_tx_hash: string | null;
  created_at: string;
  token_name: string;
  token_symbol: string;
  venue: string;
};

type Activity = {
  id: string | number;
  operation: string;
  chain: string;
  status: string;
  tx_hash: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function compact(address?: string | null) {
  if (!address) return "NOT PROVISIONED";
  if (address.length < 16) return address;
  return address.slice(0, 7) + "…" + address.slice(-6);
}

function WalletCard({
  title,
  networks,
  address,
  providerReady,
}: {
  title: string;
  networks: string;
  address?: string | null;
  providerReady: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <article className="profileWalletCard">
      <div className="profileWalletTop">
        <div>
          <span>{networks}</span>
          <h3>{title}</h3>
        </div>
        <i>{address ? "ACTIVE" : providerReady ? "READY TO CREATE" : "SETUP REQUIRED"}</i>
      </div>
      <code>{address || "Wallet will be generated for this X account."}</code>
      <div className="walletActions">
        <button disabled={!address} onClick={copyAddress}>
          {copied ? "COPIED" : "RECEIVE"}
        </button>
        <button disabled={!address}>SEND</button>
        <button disabled={!address}>SWAP</button>
        <button disabled={!address}>BRIDGE</button>
        <button className="dangerAction" disabled={!address}>
          EXPORT KEY
        </button>
      </div>
      {!address && (
        <p>
          {providerReady
            ? "Embedded-wallet provisioning is enabled for this deployment."
            : "Embedded-wallet provider credentials are not configured on this deployment yet."}
        </p>
      )}
    </article>
  );
}

export default function ProfileClient({
  profile,
  tokens,
  fees,
  activity,
  walletProviderConfigured,
}: {
  profile: Profile;
  tokens: Token[];
  fees: FeeEvent[];
  activity: Activity[];
  walletProviderConfigured: boolean;
}) {
  const [tab, setTab] = useState<"tokens" | "fees" | "wallets" | "activity">("tokens");

  const totalFees = useMemo(
    () =>
      fees
        .filter((item) => item.usd_amount)
        .reduce((sum, item) => sum + Number(item.usd_amount || 0), 0),
    [fees],
  );

  return (
    <>
      <header className="profileHero">
        <div className="profileIdentity">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" />
          ) : (
            <div className="profileAvatar">X</div>
          )}
          <div>
            <div className="sectionLabel">XLAUNCH PROFILE</div>
            <h1>{profile.display_name || "@" + profile.x_handle}</h1>
            <p>@{profile.x_handle}</p>
          </div>
        </div>

        <div className="profileStats">
          <div><span>LAUNCHED</span><b>{tokens.length}</b></div>
          <div><span>FEE EVENTS</span><b>{fees.length}</b></div>
          <div><span>RECORDED USD</span><b>{"$" + totalFees.toFixed(2)}</b></div>
        </div>
      </header>

      <div className="profileTabs">
        {(["tokens", "fees", "wallets", "activity"] as const).map((item) => (
          <button
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </div>

      <section className="profileBody">
        {tab === "tokens" && (
          <div>
            <div className="sectionLabel">CANONICAL LAUNCHES</div>
            <h2>YOUR TOKENS.</h2>
            {tokens.length ? (
              <div className="profileRows">
                {tokens.map((token) => (
                  <a className="profileRow" key={token.post_id} href={"/post/" + token.post_id}>
                    <div>
                      <b>{"$" + token.token_symbol}</b>
                      <span>{token.token_name}</span>
                    </div>
                    <span>{token.venue.toUpperCase()}</span>
                    <span>{token.fee_route.replaceAll("_", " ").toUpperCase()}</span>
                    <code>{compact(token.token_address)}</code>
                    <strong>VIEW →</strong>
                  </a>
                ))}
              </div>
            ) : (
              <div className="profileEmpty">No confirmed XLaunch tokens yet.</div>
            )}
          </div>
        )}

        {tab === "fees" && (
          <div>
            <div className="sectionLabel">CREATOR FEES</div>
            <h2>CLAIM & TRACK.</h2>
            <div className="profileNotice">
              Claimability is verified per venue. XLaunch never marks a fee as claimed
              until the venue transaction or settlement record confirms it.
            </div>
            {fees.length ? (
              <div className="profileRows">
                {fees.map((fee) => (
                  <div className="profileRow" key={String(fee.id)}>
                    <div><b>{"$" + fee.token_symbol}</b><span>{fee.event_type.replaceAll("_", " ")}</span></div>
                    <span>{fee.venue.toUpperCase()}</span>
                    <span>{fee.amount ? fee.amount + " " + (fee.asset || "") : "—"}</span>
                    <code>{fee.usd_amount ? "$" + fee.usd_amount : "—"}</code>
                    <strong>{new Date(fee.created_at).toLocaleDateString()}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="profileEmpty">No recorded fee activity yet.</div>
            )}
          </div>
        )}

        {tab === "wallets" && (
          <div>
            <div className="sectionLabel">EMBEDDED WALLETS</div>
            <h2>ONE ACCOUNT.<br />TWO KEYS.</h2>
            <p className="profileIntro">
              One EVM wallet works across Ethereum and Robinhood Chain. A separate
              Solana wallet covers StonkFun and Pump.fun.
            </p>
            {walletProviderConfigured ? (
              <PrivyWalletPanel
                xHandle={profile.x_handle}
                initialEvmAddress={profile.evm_wallet_address}
                initialSolanaAddress={profile.solana_wallet_address}
              />
            ) : (
              <>
                <div className="profileWalletGrid">
                  <WalletCard
                    title="EVM WALLET"
                    networks="ETHEREUM + ROBINHOOD CHAIN"
                    address={profile.evm_wallet_address}
                    providerReady={false}
                  />
                  <WalletCard
                    title="SOLANA WALLET"
                    networks="SOLANA"
                    address={profile.solana_wallet_address}
                    providerReady={false}
                  />
                </div>
                <div className="keySafety">
                  <b>PRIVY SETUP REQUIRED</b>
                  <p>
                    Add NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET to enable
                    embedded-wallet creation and export.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div>
            <div className="sectionLabel">WALLET ACTIVITY</div>
            <h2>EVERY ACTION.</h2>
            {activity.length ? (
              <div className="profileRows">
                {activity.map((item) => (
                  <div className="profileRow" key={String(item.id)}>
                    <div><b>{item.operation.toUpperCase()}</b><span>{item.chain}</span></div>
                    <span>{item.status.toUpperCase()}</span>
                    <span>—</span>
                    <code>{compact(item.tx_hash)}</code>
                    <strong>{new Date(item.created_at).toLocaleDateString()}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="profileEmpty">No wallet activity yet.</div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
