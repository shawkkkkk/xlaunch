import { neon } from "@neondatabase/serverless";

export type RegistryVenue = "stonkfun" | "pons";
export type RegistryChain = "solana" | "robinhood";

export type RegistryRecord = {
  post_id: string;
  source_key: string;
  post_url: string;
  status: "reserved" | "live";
  venue: RegistryVenue;
  chain: RegistryChain;
  reserver_wallet: string;
  reservation_expires_at: string | null;
  token_name: string;
  token_symbol: string;
  metadata: Record<string, unknown>;
  token_address: string | null;
  tx_hash: string | null;
  created_at: string;
  confirmed_at: string | null;
};

function sql() {
  if (!process.env.DATABASE_URL) throw new Error("XLaunch registry is not configured.");
  return neon(process.env.DATABASE_URL);
}

export async function getRegistryRecord(postId: string): Promise<RegistryRecord | null> {
  const rows = await sql()`SELECT * FROM xlaunch_posts WHERE post_id = ${postId} LIMIT 1`;
  return (rows[0] as RegistryRecord | undefined) ?? null;
}

export async function reservePost(args: {
  postId: string;
  postUrl: string;
  venue: RegistryVenue;
  chain: RegistryChain;
  wallet: string;
  tokenName: string;
  tokenSymbol: string;
  metadata: Record<string, unknown>;
  ttlMinutes?: number;
}) {
  const ttl = Math.max(1, Math.min(args.ttlMinutes ?? 15, 30));
  const rows = await sql()`
    INSERT INTO xlaunch_posts (
      post_id, source_key, post_url, status, venue, chain, reserver_wallet,
      reservation_expires_at, token_name, token_symbol, metadata
    ) VALUES (
      ${args.postId},
      ${`x:${args.postId}`},
      ${args.postUrl},
      'reserved',
      ${args.venue},
      ${args.chain},
      ${args.wallet},
      now() + (${ttl} * interval '1 minute'),
      ${args.tokenName},
      ${args.tokenSymbol},
      ${JSON.stringify(args.metadata)}::jsonb
    )
    ON CONFLICT (post_id) DO UPDATE SET
      post_url = EXCLUDED.post_url,
      status = 'reserved',
      venue = EXCLUDED.venue,
      chain = EXCLUDED.chain,
      reserver_wallet = EXCLUDED.reserver_wallet,
      reservation_expires_at = EXCLUDED.reservation_expires_at,
      token_name = EXCLUDED.token_name,
      token_symbol = EXCLUDED.token_symbol,
      metadata = EXCLUDED.metadata
    WHERE
      xlaunch_posts.status = 'reserved'
      AND (
        xlaunch_posts.reservation_expires_at < now()
        OR xlaunch_posts.reserver_wallet = EXCLUDED.reserver_wallet
        OR (
          xlaunch_posts.chain = 'robinhood'
          AND lower(xlaunch_posts.reserver_wallet) = lower(EXCLUDED.reserver_wallet)
        )
      )
    RETURNING *
  `;
  return (rows[0] as RegistryRecord | undefined) ?? null;
}

export async function confirmReservedPost(args: {
  postId: string;
  wallet: string;
  tokenAddress: string;
  txHash: string;
}) {
  const rows = await sql()`
    UPDATE xlaunch_posts
    SET status = 'live',
        token_address = ${args.tokenAddress},
        tx_hash = ${args.txHash},
        reservation_expires_at = NULL,
        confirmed_at = now()
    WHERE post_id = ${args.postId}
      AND status = 'reserved'
      AND (
        (chain = 'solana' AND reserver_wallet = ${args.wallet})
        OR (chain = 'robinhood' AND lower(reserver_wallet) = lower(${args.wallet}))
      )
    RETURNING *
  `;
  return (rows[0] as RegistryRecord | undefined) ?? null;
}
