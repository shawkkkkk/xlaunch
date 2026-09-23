CREATE TABLE IF NOT EXISTS xlaunch_posts (
  post_id TEXT PRIMARY KEY CHECK (post_id ~ '^[0-9]+$'),
  source_key TEXT NOT NULL UNIQUE,
  post_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'live')),
  venue TEXT NOT NULL CHECK (venue IN ('stonkfun', 'pons', 'pumpfun')),
  chain TEXT NOT NULL CHECK (chain IN ('solana', 'robinhood')),
  reserver_wallet TEXT NOT NULL,
  reservation_expires_at TIMESTAMPTZ,
  token_name TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  fee_route TEXT NOT NULL DEFAULT 'developer' CHECK (fee_route IN ('author_xmoney', 'developer', 'custom', 'charity', 'holder_rewards')),
  fee_recipient_handle TEXT,
  fee_recipient_wallet TEXT,
  fee_routing_status TEXT NOT NULL DEFAULT 'requested' CHECK (fee_routing_status IN ('requested', 'onchain_verified', 'not_applicable')),
  token_address TEXT UNIQUE,
  tx_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  CHECK (
    (status = 'reserved' AND token_address IS NULL AND tx_hash IS NULL AND reservation_expires_at IS NOT NULL)
    OR
    (status = 'live' AND token_address IS NOT NULL AND tx_hash IS NOT NULL AND reservation_expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS xlaunch_posts_status_idx ON xlaunch_posts(status);
CREATE INDEX IF NOT EXISTS xlaunch_posts_creator_idx ON xlaunch_posts(reserver_wallet);


CREATE TABLE IF NOT EXISTS xlaunch_fee_events (
  id BIGSERIAL PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES xlaunch_posts(post_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('accrued', 'claimed', 'converted', 'xmoney_sent', 'xmoney_expired', 'donate_gg_sent', 'refunded')),
  asset TEXT,
  amount TEXT,
  usd_amount NUMERIC(20, 6),
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
  ON xlaunch_social_accounts (lower(x_handle));

CREATE TABLE IF NOT EXISTS xlaunch_social_commands (
  command_post_id TEXT PRIMARY KEY CHECK (command_post_id ~ '^[0-9]+$'),
  source_post_id TEXT NOT NULL CHECK (source_post_id ~ '^[0-9]+$'),
  x_user_id TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  venue TEXT NOT NULL CHECK (venue IN ('stonkfun', 'pons', 'pumpfun')),
  intent JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_wallet'
    CHECK (status IN ('awaiting_wallet', 'ready', 'reserved', 'launched', 'failed', 'cancelled')),
  confirmation_token_hash TEXT NOT NULL,
  token_address TEXT,
  tx_hash TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS xlaunch_social_commands_source_idx
  ON xlaunch_social_commands(source_post_id);

CREATE INDEX IF NOT EXISTS xlaunch_social_commands_author_idx
  ON xlaunch_social_commands(x_user_id, created_at DESC);
