const sections = [
  {
    id: "overview",
    title: "OVERVIEW",
    body: "XLaunch turns one X post into one canonical token on exactly one supported launch venue. The X status id is the permanent source key across Pump.fun, StonkFun and Pons.",
  },
  {
    id: "launch",
    title: "LAUNCHING",
    body: "Paste an X post or launch from an @xlaunchit reply. Choose Pump.fun, StonkFun or Pons, configure the venue's available options, review the canonical source and sign the actual transaction with your wallet.",
  },
  {
    id: "canonical",
    title: "ONE POST · ONE TOKEN",
    body: "XLaunch atomically reserves the immutable X status id before broadcast. Once a launch is verified onchain, that source post cannot be launched again through XLaunch on any other supported venue.",
  },
  {
    id: "fees",
    title: "CREATOR FEES",
    body: "Where supported, creator fees can route to the developer wallet, a custom wallet or charity, holder rewards, or the original X author through XLaunch's documented X Money settlement flow.",
  },
  {
    id: "social",
    title: "X BOT",
    body: "Reply directly under the source X post and mention @xlaunchit with an explicit venue. The parent post becomes the source automatically. X OAuth and wallet signatures protect social launches from command hijacking.",
  },
  {
    id: "profile",
    title: "PROFILE & WALLETS",
    body: "X identities own profiles, not individual addresses. A profile can aggregate launches and fees across external wallets and future embedded EVM and Solana wallets.",
  },
  {
    id: "explore",
    title: "EXPLORE",
    body: "Browse Newest, 24H Volume, Trending and Highest Market Cap across every XLaunch venue in one market surface.",
  },
  {
    id: "security",
    title: "SECURITY",
    body: "XLaunch never asks for a seed phrase. Wallet signatures stay client-side. Canonical assignments only become permanent after server-side verification of successful onchain launches.",
  },
];

export default function DocsPage() {
  return (
    <main className="docsPage">
      <nav>
        <a className="logo" href="/">XLAUNCH</a>
        <div className="navRule">DOCUMENTATION</div>
        <div className="navActions">
          <a className="profileLink" href="/explore">EXPLORE</a>
          <a className="profileLink" href="/profile">PROFILE</a>
          <a className="wallet tokenBack" href="/">LAUNCH</a>
        </div>
      </nav>

      <header className="docsHero">
        <div className="sectionLabel">XLAUNCH DOCS</div>
        <h1>BUILD ON<br />THE SOURCE.</h1>
        <p>
          How canonical post launches, venue adapters, fee routing, social commands,
          profiles and XLaunch security work.
        </p>
      </header>

      <section className="docsShell">
        <aside className="docsSidebar">
          {sections.map((section) => (
            <a key={section.id} href={"#" + section.id}>{section.title}</a>
          ))}
        </aside>

        <div className="docsContent">
          {sections.map((section, index) => (
            <article id={section.id} key={section.id} className="docsSection">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
