# XLaunch production runbook

This file separates **code-complete** work from account-level infrastructure that must be configured before opening launches to the public.

## 1. Required core infrastructure

A public launch should not be enabled until `GET /api/readiness` returns:

```json
{
  "publicLaunchReady": true
}
```

The hard launch requirements are:

- `DATABASE_URL`
- `NEXT_PUBLIC_SITE_URL=https://xlaunch.it`
- a 32+ character `XLAUNCH_AUTH_SECRET`
- Solana RPC via `SOLANA_RPC_URL` / `NEXT_PUBLIC_SOLANA_RPC_URL`
- Robinhood Chain RPC via `ROBINHOOD_RPC_URL` / `NEXT_PUBLIC_ROBINHOOD_RPC_URL`

Use production-grade RPC endpoints before broad public traffic. The public default RPC URLs are useful as a fallback, not a capacity plan.

## 2. Database

Apply `db/migrations/001_production.sql` to the existing XLaunch database before deploying this build.

The migration is designed to preserve existing canonical post assignments while adding:

- Pump.fun support
- fee-routing and payout records
- X social launch commands
- X profiles
- wallet activity
- Explore market snapshots

After applying it, verify that these tables exist:

- `xlaunch_posts`
- `xlaunch_fee_events`
- `xlaunch_social_accounts`
- `xlaunch_social_commands`
- `xlaunch_bot_state`
- `xlaunch_profiles`
- `xlaunch_wallet_activity`
- `xlaunch_market_snapshots`

Do not wipe or recreate `xlaunch_posts` in production. Its post-id uniqueness is the canonical one-post/one-token invariant.

## 3. X OAuth

Create/configure an X developer application used for XLaunch account sign-in.

Production callback:

```
https://xlaunch.it/api/x/oauth/callback
```

Set:

- `X_API_CLIENT_ID`
- `X_API_CLIENT_SECRET` when the X app type requires it
- `XLAUNCH_X_SESSION_SECRET` (32+ random characters; may fall back to the auth secret)

The normal account sign-in requests `tweet.read users.read`.

## 4. @xlaunchit automation

Public bot:

```
@xlaunchit
```

Human managing account:

```
@ShayanelH
```

In X account settings, enable the automated-account label for **@xlaunchit** and connect **@ShayanelH** as its managing account.

The bot needs a **user-context** X access token that can:

- read mentions
- read users/posts needed by the command flow
- post replies

Set:

- `X_BOT_USER_ID`
- `X_BOT_ACCESS_TOKEN`
- `XLAUNCH_SOCIAL_WORKER_SECRET` or `CRON_SECRET`

The bot command is only a request. X OAuth proves the command author's identity and the user's wallet still signs the actual launch.

## 5. Workers

Two protected endpoints need recurring execution:

```
GET /api/social/worker
GET /api/market/refresh
Authorization: Bearer <worker secret>
```

A GitHub Actions fallback exists at `.github/workflows/workers.yml`.

To enable it, add repository secrets:

- `XLAUNCH_PROD_URL` = `https://xlaunch.it`
- `XLAUNCH_CRON_SECRET`

and repository variable:

- `XLAUNCH_WORKERS_ENABLED=true`

The fallback runs every five minutes. A scheduler with a faster supported cadence can call the same endpoints without code changes.

## 6. Embedded wallets

The profile is already structured for one EVM wallet and one Solana wallet per X identity.

Planned production provider: Privy.

Set once the Privy app is configured:

- `NEXT_PUBLIC_PRIVY_APP_ID`
- `PRIVY_APP_SECRET`

The desired ownership model is:

- XLaunch's existing X identity is the app identity.
- one embedded EVM wallet serves Ethereum + Robinhood Chain.
- one embedded Solana wallet serves Solana.
- private-key export is a user-initiated provider UI action.
- XLaunch must never log or persist a plaintext private key.

Until the provider is configured, embedded-wallet buttons must remain disabled and external-wallet launch stays available.

## 7. Optional fee integrations

### Original author via X Money

Configure only when settlement operations are ready:

- `XLAUNCH_XMONEY_SOL_TREASURY`
- `XLAUNCH_XMONEY_EVM_TREASURY`
- `XLAUNCH_LEDGER_ADMIN_TOKEN`

The public ledger must distinguish accrued/claimed/converted fees from an actual recorded X Money payout.

### Pump.fun charity routing

Configure:

- `DONATE_GG_API_KEY`
- `XLAUNCH_DONATE_SOL_TREASURY`

If they are absent, charity routing remains unavailable rather than silently falling back elsewhere.

## 8. Deployment

Deploy the GitHub repository `shawkkkkk/xlaunch` as a Next.js project.

Set the production domain to:

```
xlaunch.it
```

Set all required environment variables in the production environment. Do not commit secrets to Git.

After deployment check:

```
https://xlaunch.it/api/health
https://xlaunch.it/api/readiness
https://xlaunch.it/explore
https://xlaunch.it/profile
```

## 9. Mainnet canary

Do not announce broad launch access before this sequence passes.

1. Resolve a disposable X test post.
2. Launch the lowest-cost controlled StonkFun test that uses currently live settings.
3. Verify the XLaunch post page points to the exact confirmed mint and transaction.
4. Confirm the same X post is blocked from Pons and Pump.fun in XLaunch.
5. Repeat with one controlled Pump.fun launch.
6. Repeat with one controlled Pons launch only when the test wallet is eligible for the live Pons factory.
7. Exercise a failed/rejected wallet signature and confirm the post is not permanently consumed.
8. Exercise an expired reservation and confirm it becomes available again.
9. Test a custom fee wallet and verify the public route matches onchain state.
10. Only after the relevant settlement infrastructure is funded/operational, test an X Money or charity route.
11. Test an @xlaunchit reply command end-to-end: mention → X verification → wallet proof → signature → launch → final bot reply.
12. Run the market refresh worker and confirm the new token appears under Explore when the market-data source indexes it.

Use controlled amounts for canaries.

## 10. Launch-day checks

- GitHub CI is green.
- `/api/readiness` shows all features intended for day one as ready.
- no secret appears in client JS or repository history.
- X OAuth callback uses the production domain.
- @xlaunchit is labeled as automated and linked to @ShayanelH.
- database backups / Neon recovery are available.
- RPC capacity is sufficient for traffic.
- workers are running.
- public token pages render correctly.
- duplicate launches are rejected across all three venues.
- wallet rejection/revert paths do not consume posts.
- fee routes are never labeled verified before onchain verification.
