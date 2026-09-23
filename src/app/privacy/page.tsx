export default function PrivacyPage() {
  return (
    <main className="legalPage">
      <nav>
        <a className="logo" href="/">XLAUNCH</a>
        <div className="navRule">PRIVACY</div>
        <a className="wallet tokenBack" href="/">BACK</a>
      </nav>
      <article>
        <div className="sectionLabel">XLAUNCH.IT</div>
        <h1>PRIVACY.</h1>
        <p className="legalUpdated">Last updated: September 23, 2026</p>

        <h2>What we store</h2>
        <p>
          XLaunch stores canonical launch records, public token and transaction
          identifiers, launch configuration, fee-routing state, public X profile
          identifiers for signed-in accounts, linked public wallet addresses and
          product activity needed to operate your profile.
        </p>

        <h2>What we do not need</h2>
        <p>
          XLaunch should never request or store your seed phrase. When embedded
          wallets are enabled, private-key export is designed to occur through the
          wallet provider&apos;s isolated user-facing export flow rather than through
          XLaunch&apos;s backend.
        </p>

        <h2>X sign-in</h2>
        <p>
          X OAuth is used to verify the X account connected to an XLaunch profile or
          social launch command. XLaunch uses the stable X user identifier so a
          username change does not transfer account ownership.
        </p>

        <h2>Public blockchain information</h2>
        <p>
          Wallet addresses, token addresses and blockchain transactions are public by
          nature. XLaunch provenance and fee-ledger pages intentionally make certain
          launch information public for transparency.
        </p>

        <h2>Third parties</h2>
        <p>
          Wallet providers, blockchains, launch venues, X and optional payout or
          charity providers process information under their own terms and privacy
          practices.
        </p>
      </article>
    </main>
  );
}
