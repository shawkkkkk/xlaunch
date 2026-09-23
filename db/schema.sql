CREATE TABLE IF NOT EXISTS xlaunch_posts (
  post_id TEXT PRIMARY KEY CHECK (post_id ~ '^[0-9]+$'),
  source_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'live')),
  venue TEXT NOT NULL CHECK (venue IN ('stonkfun', 'pons')),
  chain TEXT NOT NULL CHECK (chain IN ('solana', 'robinhood')),
  reserver_wallet TEXT NOT NULL,
  reservation_expires_at TIMESTAMPTZ,
  token_address TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  CHECK (
    (status = 'reserved' AND token_address IS NULL AND tx_hash IS NULL AND reservation_expires_at IS NOT NULL)
    OR
    (status = 'live' AND token_address IS NOT NULL AND tx_hash IS NOT NULL AND reservation_expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS xlaunch_posts_status_idx ON xlaunch_posts(status);
CREATE INDEX IF NOT EXISTS xlaunch_posts_token_idx ON xlaunch_posts(token_address);
