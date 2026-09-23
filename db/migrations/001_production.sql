BEGIN;

-- Bring an early XLaunch registry forward to the production schema without
-- deleting or recreating canonical assignments.

ALTER TABLE xlaunch_posts
  ADD COLUMN IF NOT EXISTS post_url TEXT,
  ADD COLUMN IF NOT EXISTS creator_x_user_id TEXT,
  ADD COLUMN IF NOT EXISTS token_name TEXT,
  ADD COLUMN IF NOT EXISTS token_symbol TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fee_route TEXT DEFAULT 'developer',
  ADD COLUMN IF NOT EXISTS fee_recipient_handle TEXT,
  ADD COLUMN IF NOT EXISTS fee_recipient_wallet TEXT,
  ADD COLUMN IF NOT EXISTS fee_routing_status TEXT DEFAULT 'requested';

UPDATE xlaunch_posts
SET
  post_url = COALESCE(post_url, 'https://x.com/i/status/' || post_id),
  token_name = COALESCE(NULLIF(token_name, ''), 'X Post'),
  token_symbol = COALESCE(NULLIF(token_symbol, ''), 'POST'),
  metadata = COALESCE(metadata, '{}'::jsonb),
  fee_route = COALESCE(fee_route, 'developer'),
  fee_routing_status = COALESCE(fee_routing_status, 'requested');

ALTER TABLE xlaunch_posts
  ALTER COLUMN post_url SET NOT NULL,
  ALTER COLUMN token_name SET NOT NULL,
  ALTER COLUMN token_symbol SET NOT NULL,
  ALTER COLUMN metadata SET NOT NULL,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN fee_route SET NOT NULL,
  ALTER COLUMN fee_route SET DEFAULT 'developer',
  ALTER COLUMN fee_routing_status SET NOT NULL,
  ALTER COLUMN fee_routing_status SET DEFAULT 'requested';

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'xlaunch_posts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%venue%'
  LOOP
    EXECUTE format('ALTER TABLE xlaunch_posts DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE xlaunch_posts
  ADD CONSTRAINT xlaunch_posts_venue_check
  CHECK (venue IN ('stonkfun', 'pons', 'pumpfun'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'xlaunch_posts'::regclass
      AND conname = 'xlaunch_posts_fee_route_check'
  ) THEN
    ALTER TABLE xlaunch_posts
      ADD CONSTRAINT xlaunch_posts_fee_route_check
      CHECK (fee_route IN ('author_xmoney','developer','custom','charity','holder_rewards'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'xlaunch_posts'::regclass
      AND conname = 'xlaunch_posts_fee_routing_status_check'
  ) THEN
    ALTER TABLE xlaunch_posts
      ADD CONSTRAINT xlaunch_posts_fee_routing_status_check
      CHECK (fee_routing_status IN ('requested','onchain_verified','not_applicable'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS xlaunch_posts_status_idx ON xlaunch_posts(status);
CREATE INDEX IF NOT EXISTS xlaunch_posts_creator_idx ON xlaunch_posts(reserver_wallet);
CREATE INDEX IF NOT EXISTS xlaunch_posts_x_user_idx
  ON xlaunch_posts(creator_x_user_id, confirmed_at DESC);

CREATE TABLE IF NOT EXISTS xlaunch_fee_events (
  id BIGSERIAL PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES xlaunch_posts(post_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'accrued','claimed','converted','xmoney_sent',
      'xmoney_expired','donate_gg_sent','refunded'
    )
  ),
  asset TEXT,
  amount TEXT,
  usd_amount NUMERIC(20,6),
  chain_tx_hash TEXT,
  proof_url TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS xlaunch_fee_events_post_idx
  ON xlaunch_fee_events(post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS xlaunch_social_accounts (
  x_user_id TEXT PRIMARY KEY,
  x_handle TEXT NOT NULL,
  solana_wallet TEXT,
  evm_wallet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (solana_wallet IS NOT NULL OR evm_wallet IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS xlaunch_social_accounts_handle_idx
  ON xlaunch_social_accounts(lower(x_handle));

CREATE TABLE IF NOT EXISTS xlaunch_social_commands (
  command_post_id TEXT PRIMARY KEY CHECK (command_post_id ~ '^[0-9]+$'),
  source_post_id TEXT NOT NULL CHECK (source_post_id ~ '^[0-9]+$'),
  x_user_id TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  venue TEXT NOT NULL CHECK (venue IN ('stonkfun','pons','pumpfun')),
  intent JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_wallet'
    CHECK (status IN ('awaiting_wallet','ready','reserved','launched','failed','cancelled')),
  confirmation_token_hash TEXT NOT NULL,
  token_address TEXT,
  tx_hash TEXT,
  reply_post_id TEXT,
  completion_reply_post_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE xlaunch_social_commands
  ADD COLUMN IF NOT EXISTS reply_post_id TEXT,
  ADD COLUMN IF NOT EXISTS completion_reply_post_id TEXT;
CREATE INDEX IF NOT EXISTS xlaunch_social_commands_source_idx
  ON xlaunch_social_commands(source_post_id);
CREATE INDEX IF NOT EXISTS xlaunch_social_commands_author_idx
  ON xlaunch_social_commands(x_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS xlaunch_bot_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS xlaunch_profiles (
  x_user_id TEXT PRIMARY KEY,
  x_handle TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  evm_wallet_address TEXT,
  evm_wallet_provider_id TEXT,
  solana_wallet_address TEXT,
  solana_wallet_provider_id TEXT,
  wallet_provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS xlaunch_profiles_handle_idx
  ON xlaunch_profiles(lower(x_handle));

CREATE TABLE IF NOT EXISTS xlaunch_wallet_activity (
  id BIGSERIAL PRIMARY KEY,
  x_user_id TEXT NOT NULL REFERENCES xlaunch_profiles(x_user_id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('send','swap','bridge','receive','key_export')),
  chain TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('quoted','pending','confirmed','failed')),
  tx_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS xlaunch_wallet_activity_user_idx
  ON xlaunch_wallet_activity(x_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS xlaunch_market_snapshots (
  post_id TEXT PRIMARY KEY REFERENCES xlaunch_posts(post_id) ON DELETE CASCADE,
  price_usd NUMERIC(38,18),
  market_cap_usd NUMERIC(30,6),
  volume_24h_usd NUMERIC(30,6),
  liquidity_usd NUMERIC(30,6),
  price_change_24h_pct NUMERIC(18,6),
  trades_24h BIGINT,
  holders BIGINT,
  venue_rank_score NUMERIC(30,10),
  source TEXT,
  source_updated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS xlaunch_market_cap_idx
  ON xlaunch_market_snapshots(market_cap_usd DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS xlaunch_volume_24h_idx
  ON xlaunch_market_snapshots(volume_24h_usd DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS xlaunch_market_updated_idx
  ON xlaunch_market_snapshots(updated_at DESC);

COMMIT;
