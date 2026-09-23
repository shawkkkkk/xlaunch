"use client";

import { useEffect, useRef, useState } from "react";
import type {
  RiskSeverity,
  TokenRiskSnapshot,
  TokenRiskWarning,
} from "@/lib/token-risk";

const POLL_MS = 30_000;

function severityLabel(severity: RiskSeverity) {
  if (severity === "critical") return "CRITICAL";
  if (severity === "danger") return "HIGH RISK";
  if (severity === "warning") return "WARNING";
  return "NOTICE";
}

function relativeTime(value: string) {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "just now";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return seconds + "s ago";
  return Math.round(seconds / 60) + "m ago";
}

function mergeRapidLiquidityWarning(
  previous: TokenRiskSnapshot | null,
  next: TokenRiskSnapshot,
) {
  const before = previous?.metrics?.liquidityUsd;
  const after = next.metrics?.liquidityUsd;
  if (
    before == null ||
    after == null ||
    before < 500 ||
    after >= before ||
    (before - after) / before < 0.25
  ) {
    return next;
  }

  const drop = ((before - after) / before) * 100;
  const rapid: TokenRiskWarning = {
    id: "rapid-liquidity-drop",
    severity: drop >= 50 ? "danger" : "warning",
    title: "RAPID LIQUIDITY DROP",
    detail:
      "Liquidity fell materially between live XLaunch scans while this page was open. Verify the pool before entering or exiting a position.",
    value: "-" + drop.toFixed(1) + "%",
    source: "XLaunch",
  };

  return {
    ...next,
    warnings: [rapid, ...next.warnings],
  };
}

export default function TokenRiskPanel({
  postId,
  chain,
}: {
  postId: string;
  chain: "solana" | "robinhood";
}) {
  const [snapshot, setSnapshot] = useState<TokenRiskSnapshot | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(true);
  const [clock, setClock] = useState(0);
  const previousRef = useRef<TokenRiskSnapshot | null>(null);

  async function refresh() {
    setRefreshing(true);
    try {
      const response = await fetch(
        "/api/post/" + encodeURIComponent(postId) + "/risk",
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error || "Live risk scan unavailable.");
      }

      const next = body as TokenRiskSnapshot;
      const merged = mergeRapidLiquidityWarning(previousRef.current, next);
      previousRef.current = next;
      setSnapshot(merged);
      setError("");
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Live risk scan unavailable.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
    // postId is stable for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock((value) => value + 1), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const warnings = snapshot?.warnings || [];
  const serious = warnings.filter(
    (warning) =>
      warning.severity === "critical" || warning.severity === "danger",
  ).length;

  const coverage = snapshot?.coverage;
  const coverageItems = [
    ["MARKET", coverage?.market],
    ["HOLDERS", coverage?.holders],
    ["AUTHORITIES", coverage?.authorities],
    ["CLUSTERS", coverage?.clusters],
    ["BUNDLES", coverage?.bundles],
  ] as const;

  return (
    <section className="riskPanel" aria-live="polite">
      <div className="riskPanelHead">
        <div>
          <div className="sectionLabel">LIVE RISK MONITOR</div>
          <h2>TOKEN WARNINGS.</h2>
          <p>
            Continuously re-checking market structure, holder concentration and
            available on-chain security signals. Signals can change after launch.
          </p>
        </div>

        <div className="riskLiveState">
          <span className={refreshing ? "riskPulse scanning" : "riskPulse"} />
          <div>
            <b>{refreshing ? "SCANNING" : "AUTO-REFRESH ON"}</b>
            <small>
              {snapshot
                ? "Updated " + relativeTime(snapshot.generatedAt) + " · every 30s"
                : "Checking current state…"}
            </small>
          </div>
        </div>
      </div>

      <div className="riskCoverage">
        {coverageItems.map(([label, active]) => (
          <div key={label} className={active ? "covered" : "limited"}>
            <span>{label}</span>
            <b>
              {active
                ? "LIVE"
                : chain === "robinhood" &&
                    (label === "CLUSTERS" ||
                      label === "BUNDLES" ||
                      label === "AUTHORITIES")
                  ? "LIMITED"
                  : "PENDING"}
            </b>
          </div>
        ))}
      </div>

      {error && !snapshot ? (
        <div className="riskUnavailable">
          <b>LIVE SCAN TEMPORARILY UNAVAILABLE</b>
          <p>{error}</p>
          <button type="button" onClick={() => void refresh()}>
            RETRY SCAN
          </button>
        </div>
      ) : snapshot ? (
        <>
          <div className="riskSummary">
            <div>
              <span>ACTIVE SIGNALS</span>
              <b>{warnings.length}</b>
            </div>
            <div>
              <span>HIGH / CRITICAL</span>
              <b>{serious}</b>
            </div>
            <div>
              <span>TOP HOLDER</span>
              <b>
                {snapshot.metrics.topHolderPct == null
                  ? "—"
                  : snapshot.metrics.topHolderPct.toFixed(1) + "%"}
              </b>
            </div>
            <div>
              <span>TOP 10</span>
              <b>
                {snapshot.metrics.top10Pct == null
                  ? "—"
                  : snapshot.metrics.top10Pct.toFixed(1) + "%"}
              </b>
            </div>
            <div>
              <span>INSIDER-LINKED</span>
              <b>
                {snapshot.metrics.insiderPct == null
                  ? "—"
                  : snapshot.metrics.insiderPct.toFixed(1) + "%"}
              </b>
            </div>
            <div>
              <span>CLUSTERS</span>
              <b>
                {snapshot.metrics.clusterCount == null
                  ? "—"
                  : snapshot.metrics.clusterCount}
              </b>
            </div>
          </div>

          {warnings.length ? (
            <div className="riskWarnings">
              {warnings.map((warning) => (
                <article
                  key={warning.id}
                  className={"riskWarning risk-" + warning.severity}
                >
                  <div className="riskWarningFlag">
                    <i />
                    <span>{severityLabel(warning.severity)}</span>
                  </div>
                  <div className="riskWarningBody">
                    <div>
                      <h3>{warning.title}</h3>
                      {warning.value && <strong>{warning.value}</strong>}
                    </div>
                    <p>{warning.detail}</p>
                  </div>
                  <small>{warning.source}</small>
                </article>
              ))}
            </div>
          ) : (
            <div className="riskClear">
              <b>NO ACTIVE WARNINGS FROM CONNECTED SOURCES</b>
              <p>
                This is not a safety guarantee. A token can still carry risks that
                current data sources cannot detect, and new warnings may appear as
                holder, liquidity or trading behavior changes.
              </p>
            </div>
          )}

          {chain === "robinhood" && (
            <div className="riskCoverageNote">
              <b>ROBINHOOD CHAIN COVERAGE</b>
              <p>
                Market and indexed holder concentration update live. Reliable
                launch-bundle and wallet-cluster attribution is not yet available
                from XLaunch&apos;s connected Robinhood Chain sources, so XLaunch
                does not present missing cluster data as a clean result.
              </p>
            </div>
          )}

          <div className="riskFinePrint">
            <span>
              Sources: {snapshot.sources.length ? snapshot.sources.join(" · ") : "indexing"}
            </span>
            <span>
              Risk signals are informational and probabilistic. They are not an
              endorsement, guarantee, or prediction.
            </span>
            {error && <span>Latest refresh error: {error}</span>}
          </div>
        </>
      ) : (
        <div className="riskLoading">
          <span />
          <b>BUILDING LIVE RISK PROFILE…</b>
        </div>
      )}
    </section>
  );
}
