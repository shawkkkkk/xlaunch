# XLaunch

**End PvP tokens. One post. One token. One chain. Forever.**

XLaunch turns an X post into one canonical token and lets the launcher choose the venue:

- **StonkFun** — Solana / Raydium LaunchLab
- **Pons v2** — Robinhood Chain

The user's wallet signs the actual launch. XLaunch never needs custody of funds, a seed phrase, or a private key.

## Canonical rule

XLaunch keys every launch by the immutable numeric X status id — never by the pasted URL. URL variants therefore resolve to one source:

```
https://x.com/user/status/123?s=20
https://twitter.com/user/status/123/photo/1
https://x.com/i/status/123
                         ↓
                       x:123
```

A production registry enforces a database-level unique constraint on that id. The first confirmed XLaunch assignment permanently records the token, venue and chain.

This guarantee is the **XLaunch canonical registry**: unrelated third-party launchers can still copy public content outside XLaunch, so the product must never imply control over every token deployment on a public chain.

## Built-in provenance

When a launcher supplies a website, XLaunch preserves it. When they leave Website blank, token metadata automatically points to the canonical XLaunch source page:

```
https://<xlaunch-domain>/post/<status-id>
```

That means launches advertise their origin without a watermark and every token has a durable route back to its source record.

## Venue parity

XLaunch should expose every creator-facing option that the selected venue currently permits instead of inventing a smaller XLaunch-specific subset.

### StonkFun

Capabilities are read from the live StonkFun public API. Quote pairs come from `/pairs?launchable=true&launchLabReady=true`; launch economics and allowed reward tiers come from `/launchlab/pricing`. XLaunch must use the venue-published pricing values exactly so the pool is adoptable by StonkFun.

### Pons v2

Launch configs, creator-tax ceiling, launch fee, launch gate and pair-token economics are read from the live Robinhood Chain contracts. The create flow supports metadata/social fields, fee recipient, creator tax, buybacks, CREATE2 salt, optional atomic opening buy, recipient and extra opening-snipe-tax exemptions.

## Development

```bash
npm install
npm run dev
```

Production registry persistence requires `DATABASE_URL`. Without it, the app may preview posts and venue capabilities but must fail closed before claiming a post or broadcasting a canonical launch.
