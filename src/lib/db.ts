import { neon } from "@neondatabase/serverless";

export type RegistryVenue = "stonkfun" | "pons";
export type RegistryChain = "solana" | "robinhood";

export type RegistryRecord = {
  post_id: string;
  source_key: string;
  status: "reserved" | "live";
  venue: RegistryVenue;
  chain: RegistryChain;
  reserver_wallet: string;
  reservation_expires_at: string | null;
  token_address: string | null;
  tx_hash: string | null;
  created_at: string;
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
  venue: RegistryVenue;
  chain: RegistryChain;
  wallet: string;
  ttlMinutes?: number;
}) {
  const ttl = Math.max(1, Math.min(args.ttlMinutes ?? 5, 15));
  const rows = await sql()`
    INSERT INTO xlaunch_posts (
      post_id, source_key, status, venue, chain, reserver_wallet, reservation_expires_at
    ) VALUES (
      ${args.postId},
      ${`x:${args.postId}`},
      'reserved',
      ${args.venue},
      ${args.chain},
      ${args.wallet},
      now() + (${ttl} * interval '1 minute')
    )
    ON CONFLICT (post_id) DO UPDATE SET
      status = 'reserved',
      venue = EXCLUDED.venue,
      chain = EXCLUDED.chain,
      reserver_wallet = EXCLUDED.reserver_wallet,
      reservation_expires_at = EXCLUDED.reservation_expires_at
    WHERE
      xlaunch_posts.status = 'reserved'
      AND xlaunch_posts.reservation_expires_at < now()
    RETURNING *
  `;
  return (rows[0] as RegistryRecord | undefined) ?? null;
}

export async function confirmPost(args: {
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
      AND reserver_wallet = ${args.wallet}
      AND reservation_expires_at > now()
    RETURNING *
  `;
  return (rows[0] as RegistryRecord | undefined) ?? null;
}
