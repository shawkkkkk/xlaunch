import { getExploreTokens, type ExploreSort } from "@/lib/db";

export const dynamic = "force-dynamic";

const tabs: Array<{ key: ExploreSort; label: string }> = [
  { key: "newest", label: "NEWEST" },
  { key: "volume", label: "24H VOLUME" },
  { key: "trending", label: "TRENDING" },
  { key: "marketcap", label: "HIGHEST MARKET CAP" },
];

function money(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function percent(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: rawSort } = await searchParams;
  const sort: ExploreSort =
    rawSort === "volume" || rawSort === "trending" || rawSort === "marketcap"
      ? rawSort
      : "newest";

  const tokens = await getExploreTokens(sort, 60).catch(() => []);

  return (
    <main>
      <nav>
        <a className="logo" href="/">XLAUNCH</a>
        <div className="navRule">EXPLORE</div>
        <div className="navActions">
          <a className="profileLink" href="/profile">PROFILE</a>
          <a className="wallet tokenBack" href="/">LAUNCH</a>
        </div>
      </nav>

      <header className="exploreHero">
        <div className="sectionLabel">DISCOVER XLAUNCH</div>
        <h1>WHAT&apos;S<br />MOVING?</h1>
        <p>
          One feed across Pump.fun, StonkFun and Pons. Every token traces back to
          exactly one canonical X post.
        </p>
      </header>

      <div className="exploreTabs">
        {tabs.map((tab) => (
          <a
            key={tab.key}
            className={sort === tab.key ? "active" : ""}
            href={"/explore?sort=" + tab.key}
          >
            {tab.label}
          </a>
        ))}
      </div>

      <section className="exploreBody">
        {tokens.length ? (
          <div className="exploreTable">
            <div className="exploreHead">
              <span>TOKEN</span>
              <span>VENUE</span>
              <span>MARKET CAP</span>
              <span>24H VOLUME</span>
              <span>24H</span>
              <span>POST</span>
            </div>

            {tokens.map((token: any, index: number) => {
              const metadata = token.metadata || {};
              const sourceAuthor = metadata?.xlaunch?.sourceAuthor;
              return (
                <a className="exploreRow" key={token.post_id} href={"/post/" + token.post_id}>
                  <div className="exploreToken">
                    <em>{String(index + 1).padStart(2, "0")}</em>
                    <div>
                      <b>{"$" + token.token_symbol}</b>
                      <span>{token.token_name}</span>
                    </div>
                  </div>
                  <div className="exploreVenue">
                    <b>{String(token.venue).toUpperCase()}</b>
                    <span>{String(token.chain).toUpperCase()}</span>
                  </div>
                  <strong>{money(token.market_cap_usd)}</strong>
                  <strong>{money(token.volume_24h_usd)}</strong>
                  <strong className={Number(token.price_change_24h_pct) >= 0 ? "up" : "down"}>
                    {percent(token.price_change_24h_pct)}
                  </strong>
                  <div className="exploreSource">
                    <span>
                      {sourceAuthor?.handle ? "@" + sourceAuthor.handle : "X POST"}
                    </span>
                    <b>{token.post_id}</b>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <div className="exploreEmpty">
            <b>NO TOKENS TO SHOW YET.</b>
            <p>
              Newest will populate as XLaunch tokens confirm. Market rankings appear
              once the market-data index has a verified snapshot.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
