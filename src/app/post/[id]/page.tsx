import { notFound } from "next/navigation";
import { getFeeEvents, getRegistryRecord } from "@/lib/db";

export const dynamic = "force-dynamic";

function feeRouteLabel(record: Awaited<ReturnType<typeof getRegistryRecord>>) {
  if (!record) return "";
  if (record.fee_route === "author_xmoney") {
    return record.fee_recipient_handle
      ? `@${record.fee_recipient_handle} via X Money`
      : "Original X author via X Money";
  }
  if (record.fee_route === "custom") return "Custom wallet / charity";
  if (record.fee_route === "holder_rewards") return "Holder rewards";
  return "Developer wallet";
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

  const events = await getFeeEvents(id).catch(() => []);
  const metadata = record.metadata as {
    description?: string;
    image?: string;
    socials?: { website?: string; twitter?: string };
  };

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
            <div><dt>WEBSITE</dt><dd>{metadata.socials?.website || "https://xlaunch.it"}</dd></div>
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
          <p className="proofNote">
            XLaunch reports the configured fee destination and verification state separately.
            An X Money payout is only shown as paid after a payout event is recorded.
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
