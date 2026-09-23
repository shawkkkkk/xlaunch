import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFeeEvents, getMarketSnapshot, getRegistryRecord } from "@/lib/db";
import { fetchDexScreenerMarket } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};

  const record = await getRegistryRecord(id).catch(() => null);
  if (!record) {
    return {
      title: "XLaunch — Canonical token",
      robots: { index: false, follow: false },
    };
  }

  const title = record.token_symbol
    ? `${record.token_symbol} — XLaunch`
    : `${record.token_name} — XLaunch`;
  const description =
    `${record.token_name} was launched from one canonical X post through ` +
    `${record.venue === "pumpfun" ? "Pump.fun" : record.venue === "stonkfun" ? "StonkFun" : "Pons"} on XLaunch.`;
  const url = `https://launchonx.net/post/${id}`;
  const image = `https://launchonx.net/api/post-card/${id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "XLaunch",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

function feeRouteLabel(record: Awaited<ReturnType<typeof getRegistryRecord>>) {
  if (!record) return "";
  if (record.fee_route === "author_xmoney") {
    return record.fee_recipient_handle
      ? `@${record.fee_recipient_handle} via X Money`
      : "Original X author via X Money";
  }
  if (record.fee_route === "custom") return "Custom wallet";
  if (record.fee_route === "charity") return "Charity via Donate.gg";
  if (record.fee_route === "holder_rewards") return "Holder rewards";
  return "Developer wallet";
}

function compactUsd(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (number >= 1_000_000_000) return "$" + (number / 1_000_000_000).toFixed(2) + "B";
  if (number >= 1_000_000) return "$" + (number / 1_000_000).toFixed(2) + "M";
  if (number >= 1_000) return "$" + (number / 1_000).toFixed(1) + "K";
  if (number > 0 && number < 0.01) return "$" + number.toPrecision(4);
  return "$" + number.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function percent(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return (number >= 0 ? "+" : "") + number.toFixed(1) + "%";
}

function statusLabel(status: string) {
  if (status === "onchain_verified") return "ONCHAIN VERIFIED";
  if (status === "not_applicable") return "NOT APPLICABLE";
  return "ROUTING PENDING";
}

export default async function PostTokenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const record = await getRegistryRecord(id).catch(() => null);
  if (!record) notFound();

  const [events, market, dex] = await Promise.all([
    getFeeEvents(id).catch(() => []),
    getMarketSnapshot(id).catch(() => null),
    record.token_address
      ? fetchDexScreenerMarket(record.token_address, record.chain).catch(() => null)
      : Promise.resolve(null),
  ]);

  const dexChartUrl =
    dex?.pairAddress && dex?.chainId
      ? `https://dexscreener.com/${encodeURIComponent(dex.chainId)}/${encodeURIComponent(dex.pairAddress)}?embed=1&loadChartSettings=0&trades=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&interval=15&chartType=price`
      : null;
  const xMoneyPayouts = events.filter(
    (event: any) => event.event_type === "xmoney_sent",
  );
  const lastXMoneyPayout = xMoneyPayouts[0] as any | undefined;
  const donatePayouts = events.filter(
    (event: any) => event.event_type === "donate_gg_sent",
  );
  const lastDonatePayout = donatePayouts[0] as any | undefined;
  const metadata = record.metadata as {
    description?: string;
    image?: string;
    socials?: { website?: string; twitter?: string };
    xlaunch?: {
      donationConfig?: {
        configId?: { base58?: string; hex?: string };
        feeBps?: string;
        charity?: {
          id?: string;
          slug?: string;
          name?: string;
          logo?: string;
          website?: string;
          status?: string;
        };
      } | null;
    };
  };
  const donationConfig = metadata.xlaunch?.donationConfig;
  const storedWebsite = String(metadata.socials?.website || "").trim();
  const tokenWebsite =
    !storedWebsite || storedWebsite.replace(/\/$/, "") === "https://launchonx.net"
      ? `https://launchonx.net/post/${record.post_id}`
      : storedWebsite;

  return (
    <main className="tokenPage">
      <nav>
        <a className="logo" href="/">XLAUNCH</a>
        <div className="navRule">CANONICAL POST REGISTRY</div>
        <a className="wallet tokenBack" href="/">LAUNCH A POST</a>
      </nav>

      <section className="tokenHero">
        <div className="sectionLabel">X POST / {record.post_id}</div>
        <h1>{record.token_symbol ? "$" + record.token_symbol : "TOKEN"}</h1>
        <p>{record.token_name}</p>
        <div className="tokenBadges">
          <span>{record.venue.toUpperCase()}</span>
          <span>{record.chain.toUpperCase()}</span>
          <span>{record.status.toUpperCase()}</span>
          {dex?.url && (
            <a href={dex.url} target="_blank" rel="noreferrer">
              DEXSCREENER ↗
            </a>
          )}
        </div>
      </section>

      {(dex || market) && (
        <section className="tokenMarket">
          <div>
            <span>PRICE</span>
            <b>{compactUsd(dex?.priceUsd ?? (market as any)?.price_usd)}</b>
          </div>
          <div>
            <span>MARKET CAP</span>
            <b>{compactUsd(dex?.marketCap ?? dex?.fdv ?? (market as any)?.market_cap_usd)}</b>
          </div>
          <div>
            <span>24H VOLUME</span>
            <b>{compactUsd(dex?.volume24h ?? (market as any)?.volume_24h_usd)}</b>
          </div>
          <div>
            <span>24H</span>
            <b className={Number(dex?.priceChange24h ?? (market as any)?.price_change_24h_pct) >= 0 ? "up" : "down"}>
              {percent(dex?.priceChange24h ?? (market as any)?.price_change_24h_pct)}
            </b>
          </div>
          <div>
            <span>LIQUIDITY</span>
            <b>{compactUsd(dex?.liquidityUsd ?? (market as any)?.liquidity_usd)}</b>
          </div>
        </section>
      )}

      <section className="dexPanel">
        <div className="dexPanelHead">
          <div>
            <div className="sectionLabel">LIVE MARKET</div>
            <h2>DEXSCREENER</h2>
          </div>
          {dex?.url && (
            <a href={dex.url} target="_blank" rel="noreferrer">
              OPEN DEXSCREENER ↗
            </a>
          )}
        </div>

        {dex && dexChartUrl ? (
          <>
            <div className="dexChart">
              <iframe
                src={dexChartUrl}
                title={`${record.token_symbol || record.token_name} DexScreener chart`}
                loading="lazy"
                allowFullScreen
              />
            </div>
            <div className="dexStats">
              <div><span>DEX</span><b>{String(dex.dexId || "—").toUpperCase()}</b></div>
              <div><span>PAIR</span><b>{dex.quoteToken?.symbol || "—"}</b></div>
              <div><span>FDV</span><b>{compactUsd(dex.fdv)}</b></div>
              <div><span>LIQUIDITY</span><b>{compactUsd(dex.liquidityUsd)}</b></div>
              <div><span>24H VOLUME</span><b>{compactUsd(dex.volume24h)}</b></div>
              <div>
                <span>24H TRADES</span>
                <b>
                  {dex.buys24h == null && dex.sells24h == null
                    ? "—"
                    : `${Number(dex.buys24h || 0).toLocaleString()} buys · ${Number(dex.sells24h || 0).toLocaleString()} sells`}
                </b>
              </div>
            </div>
          </>
        ) : (
          <div className="dexPending">
            <b>DEXSCREENER IS STILL INDEXING THIS TOKEN.</b>
            <p>
              The contract is live onchain. The chart and trading statistics will
              appear here automatically once DexScreener discovers a market for it.
            </p>
            {record.token_address && <code>{record.token_address}</code>}
          </div>
        )}
      </section>

      <section className="sourceDisclosure">
        <b>SOURCE ≠ ENDORSEMENT</b>
        <p>
          This token was created from a public X post. Unless the page explicitly
          displays verified author-launch status, XLaunch does not claim that the
          original post author created, endorsed, sponsored, or is affiliated with
          this token.
        </p>
        <div>
          <a href="/risk">RISK DISCLOSURE →</a>
          <a href="/terms">TERMS →</a>
        </div>
      </section>

      <section className="tokenProofGrid">
        <div className="proofPanel">
          <div className="sectionLabel">SOURCE</div>
          <h2>ONE POST.<br />ONE TOKEN.</h2>
          <dl>
            <div><dt>X POST</dt><dd><a href={record.post_url} target="_blank" rel="noreferrer">{record.post_url}</a></dd></div>
            <div><dt>POST ID</dt><dd>{record.post_id}</dd></div>
            <div><dt>TOKEN</dt><dd>{record.token_address || "Pending confirmation"}</dd></div>
            <div><dt>LAUNCH TX</dt><dd>{record.tx_hash || "Pending confirmation"}</dd></div>
            <div><dt>WEBSITE</dt><dd><a href={tokenWebsite}>{tokenWebsite}</a></dd></div>
          </dl>
        </div>

        <div className="proofPanel">
          <div className="sectionLabel">CREATOR FEES</div>
          <h2>{feeRouteLabel(record)}</h2>
          <div className="feeVerification">
            <span>ROUTING STATUS</span>
            <b>{statusLabel(record.fee_routing_status)}</b>
          </div>
          {record.fee_recipient_handle && (
            <div className="feeLine"><span>X RECIPIENT</span><b>{"@" + record.fee_recipient_handle}</b></div>
          )}
          {record.fee_recipient_wallet && (
            <div className="feeLine"><span>ONCHAIN RECIPIENT</span><code>{record.fee_recipient_wallet}</code></div>
          )}
          {record.fee_route === "charity" && donationConfig?.charity?.name && (
            <>
              <div className="feeLine">
                <span>CHARITY</span>
                <b>{donationConfig.charity.name}</b>
              </div>
              <div className="feeLine">
                <span>DONATE.GG CONFIG</span>
                <code>{donationConfig.configId?.base58 || "—"}</code>
              </div>
              <div className="feeLine">
                <span>CHARITY STATUS</span>
                <b>{donationConfig.charity.status?.replaceAll("_", " ") || "—"}</b>
              </div>
            </>
          )}
          {record.fee_route === "charity" && (
            <div className="feeLine">
              <span>DONATE.GG PAYOUT</span>
              <b>
                {lastDonatePayout
                  ? "SENT · " + new Date(lastDonatePayout.created_at).toLocaleDateString()
                  : "NOT YET RECORDED"}
              </b>
            </div>
          )}
          {record.fee_route === "author_xmoney" && (
            <div className="feeLine">
              <span>X MONEY PAYOUT</span>
              <b>
                {lastXMoneyPayout
                  ? "PAID · " + new Date(lastXMoneyPayout.created_at).toLocaleDateString()
                  : "NOT YET RECORDED"}
              </b>
            </div>
          )}
          <p className="proofNote">
            XLaunch reports the configured fee destination and verification state separately.
            An X Money payout or Donate.gg donation is only shown as completed after a
            corresponding public ledger event is recorded.
          </p>
        </div>
      </section>

      <section className="ledger">
        <div className="sectionLabel">PUBLIC FEE LEDGER</div>
        <h2>EVERY STEP.<br />PUBLIC.</h2>
        {events.length ? (
          <div className="ledgerRows">
            {events.map((event: any) => (
              <div className="ledgerRow" key={String(event.id)}>
                <b>{String(event.event_type).replaceAll("_", " ").toUpperCase()}</b>
                <span>
                  {event.amount
                    ? String(event.amount) + " " + String(event.asset || "")
                    : event.usd_amount
                      ? "$" + String(event.usd_amount)
                      : "—"}
                </span>
                <span>{new Date(event.created_at).toLocaleString()}</span>
                {event.proof_url ? <a href={event.proof_url} target="_blank" rel="noreferrer">PROOF ↗</a> : <span>—</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="emptyLedger">No fee claims or payouts have been recorded yet.</div>
        )}
      </section>
    </main>
  );
}
