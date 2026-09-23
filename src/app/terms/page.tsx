export default function TermsPage() {
  return (
    <main className="legalPage">
      <nav>
        <a className="logo" href="/">XLAUNCH</a>
        <div className="navRule">TERMS</div>
        <a className="wallet tokenBack" href="/">BACK</a>
      </nav>
      <article>
        <div className="sectionLabel">XLAUNCH.IT</div>
        <h1>TERMS OF USE.</h1>
        <p className="legalUpdated">Last updated: September 23, 2026</p>

        <h2>1. What XLaunch does</h2>
        <p>
          XLaunch is software that helps users create tokens from public X posts
          through supported third-party launch venues. XLaunch maintains its own
          canonical registry so one X post can correspond to one confirmed XLaunch
          token. That registry does not prevent unrelated third parties from creating
          similar tokens elsewhere on public blockchains.
        </p>

        <h2>2. You control your wallet</h2>
        <p>
          Launch transactions are signed by the wallet you control. Never provide a
          seed phrase or private key to XLaunch. Blockchain transactions may be
          irreversible and network, venue, gas, tax and trading costs may apply.
        </p>

        <h2>3. Public posts and affiliation</h2>
        <p>
          Creating a token from a public post does not establish that the post author
          created, endorsed, sponsored or is affiliated with the token. Do not use
          XLaunch to impersonate another person, misrepresent affiliation, infringe
          rights, deceive users, or violate applicable law or a supported venue&apos;s
          rules.
        </p>

        <h2>4. Tokens and markets</h2>
        <p>
          XLaunch does not guarantee liquidity, price, market capitalization,
          availability, profitability, fee income, listing, graduation, or continued
          support by any launch venue. Market data may be delayed or unavailable.
          Nothing on XLaunch is investment advice or a recommendation to buy, sell,
          or hold a token.
        </p>

        <h2>5. Third-party systems</h2>
        <p>
          XLaunch relies on public blockchains, wallets, X, Pump.fun, StonkFun, Pons
          and optional third-party services. Their availability, rules and interfaces
          can change independently of XLaunch.
        </p>

        <h2>6. Fee routing</h2>
        <p>
          Fee destinations shown as verified are based on the corresponding onchain
          configuration or recorded settlement event. An intended X Money or charity
          route is not represented as paid until a payout event is recorded.
        </p>

        <h2>7. Your responsibility</h2>
        <p>
          You are responsible for the content you tokenize, the wallet you use, the
          launch settings you approve, taxes, legal compliance and any losses arising
          from your transactions. Do not launch or trade assets where doing so is
          prohibited.
        </p>

        <h2>8. Changes and availability</h2>
        <p>
          XLaunch may change, suspend or remove features to maintain security,
          compatibility or legal compliance. A failed or unsupported integration may
          be disabled rather than silently routed through a different destination.
        </p>

        <p className="legalFine">
          These product terms are a practical baseline for launch. Before materially
          scaling a public token-launch service across jurisdictions, obtain legal
          review tailored to the business and users you actually serve.
        </p>
      </article>
    </main>
  );
}
