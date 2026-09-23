# XLaunch

**End PvP tokens. One post. One token. One chain. Forever.**

XLaunch turns an X post into one canonical token on one of three venues:

- **StonkFun** — Solana / Raydium LaunchLab
- **Pons v2** — Robinhood Chain
- **Pump.fun** — Solana

The launcher's wallet signs the actual launch transaction. XLaunch never needs custody of launch funds, a seed phrase, or a private key.

## Canonical rule

Every X URL is normalized to the immutable numeric status ID. Variants such as x.com, twitter.com, query strings, and media suffixes therefore resolve to the same `x:<status-id>` key.

Before a venue transaction is signed, XLaunch atomically reserves that key. Only a server-verified successful onchain launch makes the assignment permanent. A post confirmed on any one venue cannot later be launched through XLaunch on either of the other two.

This is an **XLaunch canonical-registry guarantee**. XLaunch cannot prevent unrelated third-party launchers from copying public post content outside XLaunch.

## Metadata and provenance

The token's **X/Twitter link is always the source post** and cannot be replaced with another post.

The **Website** field is independent: a custom website is preserved; if it is blank, it defaults to `https://xlaunch.it`.

Every assignment also has a public provenance page at `https://xlaunch.it/post/<x-status-id>`. It shows the source post, venue, chain, token address, launch transaction, creator-fee destination, routing-verification state, and public fee/payout events.

## Creator-fee routing

Where the selected venue and mode has creator fees, the launcher can choose **Original X author via X Money**, **Developer / connected wallet**, or **Custom wallet / charity**. Holder-reward modes are displayed separately.

X Money settlement is explicit. XLaunch does not claim a public third-party X Money send API exists. When author routing is selected, creator fees are directed to an XLaunch settlement wallet, and the public ledger distinguishes onchain accrual, claim and conversion from an actual recorded X Money payout. Author routing fails closed unless the correct settlement treasury is configured.

## Venue parity

XLaunch reads capabilities live rather than maintaining a stale XLaunch-specific subset.

### StonkFun

Live LaunchLab-ready pairs, Standard/Reward modes, currently published reward tiers, exact venue-published curve/config/platform parameters, creator-fee recipient on Standard launches, and Token-2022 quote support.

### Pons v2

Live launch configurations, ETH or any currently approved pair, live creator-tax cap, fee recipient, buybacks, atomic opening buy, opening-buy recipient, opening-tax exemptions, and CREATE2 salt. Confirmation verifies the official launch event and signed creator-fee recipient.

### Pump.fun

Live supported quote mints, optional opening buy, Mayhem Mode where supported, Holder Rewards when enabled, custom creator fee where supported by the selected quote configuration, and creator/custom/settlement-wallet routing.

## Launch state machine

`X URL → normalize → AVAILABLE → reserve → RESERVED → wallet signs → onchain confirmation → server verification → LIVE`

A rejected or failed wallet transaction never becomes a permanent assignment. The same wallet can retry an active reservation, and abandoned reservations expire.

## Development

Run `npm install`, then `npm run dev`. Verification commands are `npm run typecheck`, `npm test`, and `npm run build`.

Copy `.env.example` and configure `DATABASE_URL` before enabling canonical launches.

## Security model

- never request or store a seed phrase/private key
- wallet signs venue transactions locally
- server verifies successful onchain launches before consuming a post forever
- post uniqueness is enforced in the database, not only the browser
- fee selections are not displayed as verified until checked against the confirmed transaction
- financial routing fails closed when required treasury infrastructure is missing


## Social launches

XLaunch is designed to support launching from X itself.

Reply to the exact post you want to tokenize and mention the XLaunch account with an explicit venue, for example:

```
@xlaunch launch this on pumpfun as $DOG
@xlaunch launch this on stonkfun reward mode 2% as $POST
@xlaunch launch this on pons paired with AAPL, fees to author
```

The reply's parent X status id is the canonical source. The command cannot substitute another source post. Social commands are parsed server-side, but launching remains disabled until the command author has an authenticated linked wallet and the X ingestion service verifies the mention/reply relationship.

The same one-post/one-token invariant applies across web and social surfaces.
