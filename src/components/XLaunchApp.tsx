"use client";

import { useEffect, useMemo, useState } from "react";

type Registry = {
  status: "reserved" | "live";
  venue: "stonkfun" | "pons";
  chain: "solana" | "robinhood";
  token_address: string | null;
  tx_hash: string | null;
};

type Resolved = {
  post: {
    id: string;
    sourceKey: string;
    canonicalUrl: string;
    text: string;
    authorName: string;
    handle: string;
  };
  registry: Registry | null;
  registryConfigured: boolean;
};

type Pair = {
  mint?: string;
  symbol?: string;
  name?: string;
  category?: string;
  tokenProgram?: string;
};

type PonsCaps = {
  launchEnabled: boolean;
  launchFeeEth: string;
  maxCreatorTaxBps: number;
  snipeTaxStartBps: number;
  snipeTaxSeconds: number;
  configs: Array<{
    id: number;
    curveFeeBps: number;
    enabled: boolean;
    supply: string;
    graduationThreshold: string;
  }>;
};

function suggestedTicker(handle: string, text: string) {
  const firstWord = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim()
    .split(/\s+/)[0];
  return (firstWord || handle || "POST").replace(/[^a-z0-9]/gi, "").slice(0, 10).toUpperCase();
}

export default function XLaunchApp() {
  const [url, setUrl] = useState("");
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [resolveError, setResolveError] = useState("");
  const [loading, setLoading] = useState(false);
  const [venue, setVenue] = useState<"stonkfun" | "pons">("stonkfun");

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [website, setWebsite] = useState("");
  const [telegram, setTelegram] = useState("");
  const [discord, setDiscord] = useState("");
  const [farcaster, setFarcaster] = useState("");

  const [stonkPairs, setStonkPairs] = useState<Pair[]>([]);
  const [stonkPair, setStonkPair] = useState("");
  const [stonkMode, setStonkMode] = useState<"standard" | "reward">("standard");
  const [stonkPricing, setStonkPricing] = useState<any>(null);
  const [rewardBps, setRewardBps] = useState(0);
  const [stonkDevBuy, setStonkDevBuy] = useState("0");

  const [pons, setPons] = useState<PonsCaps | null>(null);
  const [ponsConfig, setPonsConfig] = useState(0);
  const [ponsPair, setPonsPair] = useState("ETH");
  const [ponsPairState, setPonsPairState] = useState<any>(null);
  const [creatorTax, setCreatorTax] = useState(0);
  const [buyback, setBuyback] = useState(false);
  const [feeRecipient, setFeeRecipient] = useState("");
  const [devBuy, setDevBuy] = useState("0");
  const [buyRecipient, setBuyRecipient] = useState("");
  const [exemptions, setExemptions] = useState("");
  const [salt, setSalt] = useState("");

  const [advanced, setAdvanced] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/venues/stonkfun").then((r) => r.json()),
      fetch("/api/venues/pons").then((r) => r.json()),
    ])
      .then(([stonk, ponsData]) => {
        const pairs = Array.isArray(stonk?.pairs) ? stonk.pairs : [];
        setStonkPairs(pairs);
        if (pairs[0]?.mint) setStonkPair(pairs[0].mint);
        if (!ponsData?.error) {
          setPons(ponsData);
          const firstEnabled = ponsData.configs?.find((x: { enabled: boolean }) => x.enabled);
          if (firstEnabled) setPonsConfig(firstEnabled.id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!stonkPair) return;
    fetch(`/api/venues/stonkfun/pricing?quoteMint=${encodeURIComponent(stonkPair)}`)
      .then((r) => r.json())
      .then((data) => {
        setStonkPricing(data);
        const tiers = data?.modes?.reward?.transferFeeBps ?? [];
        if (tiers.length) setRewardBps(Number(tiers[0]));
      })
      .catch(() => setStonkPricing(null));
  }, [stonkPair]);

  async function resolvePost() {
    setLoading(true);
    setResolveError("");
    setResolved(null);
    setStatus("");

    try {
      const response = await fetch("/api/post/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not resolve post.");

      setResolved(body);
      const text = String(body.post.text || "");
      const firstSentence = text.replace(/https?:\/\/\S+/g, "").trim().split(/[.!?\n]/)[0].slice(0, 48);
      setName(firstSentence || body.post.authorName || "X Post");
      setSymbol(suggestedTicker(body.post.handle, text));
      setDescription(text.slice(0, 500));
    } catch (error) {
      setResolveError(error instanceof Error ? error.message : "Could not resolve post.");
    } finally {
      setLoading(false);
    }
  }

  async function validatePonsPair() {
    setPonsPairState({ loading: true });
    try {
      const response = await fetch(
        `/api/venues/pons/pair?address=${encodeURIComponent(ponsPair)}&config=${ponsConfig}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Pair rejected.");
      setPonsPairState(data);
    } catch (error) {
      setPonsPairState({ error: error instanceof Error ? error.message : "Pair rejected." });
    }
  }

  const sourceX = resolved?.post.canonicalUrl || "";
  const alreadyLive = resolved?.registry?.status === "live";
  const reserved = resolved?.registry?.status === "reserved";
  const rewardTiers: number[] = stonkPricing?.modes?.reward?.transferFeeBps ?? [];
  const finalWebsite = website.trim() || "https://xlaunch.it";

  const selectedPair = useMemo(
    () => stonkPairs.find((pair) => pair.mint === stonkPair),
    [stonkPair, stonkPairs],
  );

  return (
    <main>
      <nav>
        <a className="logo" href="/">XLAUNCH</a>
        <div className="navRule">ONE POST · ONE TOKEN · ONE CHAIN · FOREVER</div>
        <button className="wallet" type="button">CONNECT</button>
      </nav>

      <section className="hero">
        <div className="kicker">END PVP TOKENS</div>
        <h1>TURN A POST<br />INTO <span>A TOKEN.</span></h1>
        <p className="lead">
          One X post becomes one canonical XLaunch token on one chain. Launch through StonkFun or
          Pons. Your wallet signs. XLaunch never takes custody.
        </p>

        <div className="paste">
          <span>𝕏</span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Paste an X post link"
            onKeyDown={(event) => event.key === "Enter" && resolvePost()}
          />
          <button type="button" onClick={resolvePost} disabled={loading}>
            {loading ? "CHECKING…" : "TOKENIZE →"}
          </button>
        </div>

        {resolveError && <div className="error">{resolveError}</div>}
        <div className="heroFine">
          The first confirmed XLaunch assignment becomes the canonical XLaunch token for that post.
        </div>
      </section>

      {resolved && (
        <section className="builder">
          <aside className="sourceColumn">
            <div className="sectionLabel">01 / SOURCE</div>

            <div className="postCard">
              <div className="postHead">
                <div className="avatar">𝕏</div>
                <div>
                  <b>{resolved.post.authorName || "X user"}</b>
                  <span>@{resolved.post.handle || "unknown"}</span>
                </div>
                <div className="xMark">𝕏</div>
              </div>

              <p>{resolved.post.text || "Post content remains tied to its immutable X status id."}</p>
              <a href={sourceX} target="_blank" rel="noreferrer">VIEW ORIGINAL ↗</a>
            </div>

            <div className="sourceStatus">
              <span>POST ID</span>
              <code>{resolved.post.id}</code>
              <span>REGISTRY</span>
              <b className={alreadyLive || reserved ? "taken" : "available"}>
                {alreadyLive ? "TOKENIZED" : reserved ? "RESERVED" : "AVAILABLE"}
              </b>
            </div>

            {alreadyLive && (
              <div className="already">
                <small>THIS POST IS ALREADY ONCHAIN</small>
                <strong>{resolved.registry?.venue.toUpperCase()}</strong>
                <span>{resolved.registry?.token_address}</span>
              </div>
            )}
          </aside>

          <div className="formColumn">
            <div className="sectionLabel">02 / TOKEN</div>

            <div className="grid two">
              <label>
                <span>NAME</span>
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                <span>TICKER</span>
                <div className="ticker">
                  <i>$</i>
                  <input
                    value={symbol}
                    onChange={(event) =>
                      setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))
                    }
                  />
                </div>
              </label>
            </div>

            <label>
              <span>DESCRIPTION</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
            </label>

            <label>
              <span>IMAGE / LOGO URL</span>
              <input
                value={image}
                onChange={(event) => setImage(event.target.value)}
                placeholder="Use post media or your own token image"
              />
            </label>

            <div className="lockedSocial">
              <div>
                <span>TWITTER / X</span>
                <b>LOCKED TO SOURCE POST</b>
              </div>
              <code>{sourceX}</code>
              <small>This cannot be replaced with another X account or post.</small>
            </div>

            <div className="sectionLabel venueLabel">03 / LAUNCH VENUE</div>

            <div className="venueCards">
              <button
                type="button"
                className={venue === "stonkfun" ? "active" : ""}
                onClick={() => setVenue("stonkfun")}
              >
                <span>STONKFUN</span>
                <small>SOLANA</small>
                <i>{stonkPairs.length ? `${stonkPairs.length} LIVE PAIRS` : "LIVE CAPABILITIES"}</i>
              </button>

              <button
                type="button"
                className={venue === "pons" ? "active" : ""}
                onClick={() => setVenue("pons")}
              >
                <span>PONS V2</span>
                <small>ROBINHOOD CHAIN</small>
                <i>{pons?.launchEnabled ? "LAUNCHING OPEN" : "CHECKING CHAIN"}</i>
              </button>
            </div>

            {venue === "stonkfun" ? (
              <div className="venueForm">
                <div className="grid two">
                  <label>
                    <span>PAIR</span>
                    <select value={stonkPair} onChange={(event) => setStonkPair(event.target.value)}>
                      {stonkPairs.map((pair, index) => (
                        <option key={pair.mint || index} value={pair.mint}>
                          {pair.symbol || pair.name || pair.mint}
                        </option>
                      ))}
                    </select>
                    <small>
                      {selectedPair?.category ? `Category: ${selectedPair.category}` : "Loaded live from StonkFun."}
                    </small>
                  </label>

                  <label>
                    <span>MODE</span>
                    <select
                      value={stonkMode}
                      onChange={(event) => setStonkMode(event.target.value as "standard" | "reward")}
                    >
                      <option value="standard">Standard</option>
                      <option value="reward">Reward</option>
                    </select>
                  </label>
                </div>

                {stonkMode === "reward" && (
                  <label>
                    <span>HOLDER REWARD TRANSFER FEE</span>
                    <select value={rewardBps} onChange={(event) => setRewardBps(Number(event.target.value))}>
                      {rewardTiers.map((bps) => (
                        <option key={bps} value={bps}>{(bps / 100).toFixed(2)}%</option>
                      ))}
                    </select>
                    <small>Only reward tiers currently published by StonkFun are available.</small>
                  </label>
                )}

                <label>
                  <span>OPENING / DEV BUY</span>
                  <input
                    value={stonkDevBuy}
                    onChange={(event) => setStonkDevBuy(event.target.value)}
                    inputMode="decimal"
                  />
                  <small>Quoted in the selected pair asset.</small>
                </label>

                {stonkPricing && (
                  <div className="liveRead">
                    <span>LIVE CURVE TERMS</span>
                    <code>{stonkPricing?.curve?.configId ? "SYNCED" : "LOADED"}</code>
                  </div>
                )}
              </div>
            ) : (
              <div className="venueForm">
                <div className="grid two">
                  <label>
                    <span>LAUNCH CONFIG</span>
                    <select value={ponsConfig} onChange={(event) => setPonsConfig(Number(event.target.value))}>
                      {(pons?.configs || [])
                        .filter((config) => config.enabled)
                        .map((config) => (
                          <option key={config.id} value={config.id}>
                            Config {config.id} · {config.curveFeeBps / 100}% curve fee
                          </option>
                        ))}
                    </select>
                  </label>

                  <label>
                    <span>CREATOR TAX</span>
                    <input
                      type="number"
                      min="0"
                      max={(pons?.maxCreatorTaxBps || 0) / 100}
                      step=".01"
                      value={creatorTax / 100}
                      onChange={(event) => setCreatorTax(Math.round(Number(event.target.value) * 100))}
                    />
                    <small>Live protocol cap: {(pons?.maxCreatorTaxBps || 0) / 100}%</small>
                  </label>
                </div>

                <label>
                  <span>PAIR TOKEN</span>
                  <div className="inline">
                    <input
                      value={ponsPair}
                      onChange={(event) => setPonsPair(event.target.value)}
                      placeholder="ETH or any approved token address"
                    />
                    <button type="button" onClick={validatePonsPair}>VERIFY</button>
                  </div>
                  <small>
                    Any Pons-approved pair is allowed. XLaunch checks the current factory instead of using a closed list.
                  </small>
                  {ponsPairState?.approved && (
                    <b className="valid">
                      ✓ {ponsPairState.symbol} APPROVED
                      {ponsPairState.graduationThreshold ? ` · GRADUATES AT ${ponsPairState.graduationThreshold}` : ""}
                    </b>
                  )}
                  {ponsPairState?.error && <b className="invalid">{ponsPairState.error}</b>}
                </label>

                <div className="grid two">
                  <label>
                    <span>OPENING / DEV BUY</span>
                    <input value={devBuy} onChange={(event) => setDevBuy(event.target.value)} inputMode="decimal" />
                  </label>

                  <label className="check">
                    <input type="checkbox" checked={buyback} onChange={(event) => setBuyback(event.target.checked)} />
                    <span>ENABLE BUYBACKS</span>
                  </label>
                </div>

                <div className="liveRead">
                  <span>LIVE PONS LAUNCH FEE</span>
                  <code>{pons?.launchFeeEth || "—"} ETH</code>
                </div>
              </div>
            )}

            <button className="advancedToggle" type="button" onClick={() => setAdvanced((value) => !value)}>
              {advanced ? "−" : "+"} ADVANCED / ALL VENUE OPTIONS
            </button>

            {advanced && (
              <div className="advanced">
                <div className="grid two">
                  <label>
                    <span>WEBSITE</span>
                    <input
                      value={website}
                      onChange={(event) => setWebsite(event.target.value)}
                      placeholder="https://xlaunch.it"
                    />
                    <small>Optional. Blank defaults permanently to https://xlaunch.it.</small>
                  </label>

                  <label>
                    <span>TELEGRAM</span>
                    <input value={telegram} onChange={(event) => setTelegram(event.target.value)} />
                  </label>

                  <label>
                    <span>DISCORD</span>
                    <input value={discord} onChange={(event) => setDiscord(event.target.value)} />
                  </label>

                  <label>
                    <span>FARCASTER</span>
                    <input value={farcaster} onChange={(event) => setFarcaster(event.target.value)} />
                  </label>
                </div>

                {venue === "pons" && (
                  <>
                    <label>
                      <span>CREATOR FEE RECIPIENT</span>
                      <input
                        value={feeRecipient}
                        onChange={(event) => setFeeRecipient(event.target.value)}
                        placeholder="Connected wallet by default"
                      />
                    </label>

                    <label>
                      <span>OPENING BUY RECIPIENT</span>
                      <input
                        value={buyRecipient}
                        onChange={(event) => setBuyRecipient(event.target.value)}
                        placeholder="Connected wallet by default"
                      />
                    </label>

                    <label>
                      <span>EXTRA OPENING-TAX EXEMPT WALLETS</span>
                      <textarea
                        value={exemptions}
                        onChange={(event) => setExemptions(event.target.value)}
                        placeholder="One 0x address per line"
                        rows={3}
                      />
                      <small>Pons currently permits up to 32 extra exemption addresses.</small>
                    </label>

                    <label>
                      <span>CREATE2 SALT</span>
                      <input
                        value={salt}
                        onChange={(event) => setSalt(event.target.value)}
                        placeholder="Randomized if blank"
                      />
                    </label>
                  </>
                )}
              </div>
            )}

            <div className="review">
              <div><span>X SOURCE</span><b>{sourceX}</b></div>
              <div><span>WEBSITE</span><b>{finalWebsite}</b></div>
              <div><span>CANONICAL REGISTRY</span><b>https://xlaunch.it/post/{resolved.post.id}</b></div>
              <div>
                <span>DESTINATION</span>
                <b>{venue === "pons" ? "PONS · ROBINHOOD CHAIN" : "STONKFUN · SOLANA"}</b>
              </div>
            </div>

            <button
              className="launch"
              type="button"
              disabled={alreadyLive}
              onClick={() =>
                setStatus(
                  resolved.registryConfigured
                    ? "Configuration valid. Wallet-signing transaction builder is next."
                    : "Preview ready. Registry database must be connected before canonical launching is enabled.",
                )
              }
            >
              {alreadyLive ? "POST ALREADY TOKENIZED" : "REVIEW & LAUNCH →"}
            </button>

            {status && <div className="status">{status}</div>}
          </div>
        </section>
      )}

      <section className="manifesto">
        <div className="sectionLabel">WHY XLAUNCH</div>
        <div className="manifestoGrid">
          <h2>END<br />PVP<br />TOKENS.</h2>
          <div>
            <p>Every post has a story. Now every story can have one canonical XLaunch token.</p>
            <p>
              The first successful XLaunch assignment binds the X status ID to one token address, one venue
              and one chain. The source X link stays with the token forever.
            </p>
            <div className="rule">
              ONE POST <span>→</span> ONE TOKEN <span>→</span> ONE CHAIN <span>→</span> FOREVER
            </div>
          </div>
        </div>
      </section>

      <footer>
        <b>XLAUNCH</b>
        <span>XLAUNCH.IT</span>
        <span>NON-CUSTODIAL · CANONICAL PROVENANCE</span>
      </footer>
    </main>
  );
}
