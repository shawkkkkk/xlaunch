export default function RiskPage() {
  return (
    <main className="legalPage">
      <nav>
        <a className="logo" href="/">XLAUNCH</a>
        <div className="navRule">RISK DISCLOSURE</div>
        <a className="wallet tokenBack" href="/">BACK</a>
      </nav>
      <article>
        <div className="sectionLabel">BEFORE YOU LAUNCH OR TRADE</div>
        <h1>CRYPTO IS RISKY.</h1>

        <h2>Tokens can lose all value</h2>
        <p>
          Newly launched tokens can be extremely volatile, illiquid, manipulated,
          abandoned or worthless. Past activity, volume, market cap or social
          attention does not predict future value.
        </p>

        <h2>Transactions are difficult to reverse</h2>
        <p>
          Wallet signatures and blockchain transactions can transfer assets
          permanently. Verify the network, token, amount, recipient, fee destination
          and launch venue before signing.
        </p>

        <h2>A post is not an endorsement</h2>
        <p>
          A public X post being used as a token&apos;s source does not mean its author
          endorsed the token. XLaunch&apos;s canonical registry records provenance
          inside XLaunch; it does not grant ownership of the underlying post or stop
          third parties from deploying similar assets elsewhere.
        </p>

        <h2>Third-party and smart-contract risk</h2>
        <p>
          XLaunch depends on smart contracts, RPC providers, wallets, launch venues
          and external APIs. Bugs, outages, upgrades, exploits, congestion or changed
          venue rules can affect launches, trading, claims and market data.
        </p>

        <h2>Do your own assessment</h2>
        <p>
          XLaunch&apos;s Explore rankings are discovery tools, not investment
          recommendations. You are responsible for deciding whether any token or
          transaction is appropriate for you.
        </p>
      </article>
    </main>
  );
}
