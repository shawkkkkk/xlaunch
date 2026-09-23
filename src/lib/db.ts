import { neon } from "@neondatabase/serverless";

export type RegistryVenue = "stonkfun" | "pons" | "pumpfun";
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
  fee_route: "author_xmoney" | "developer" | "custom" | "charity" | "holder_rewards";
  fee_recipient_handle: string | null;
  fee_recipient_wallet: string | null;
  fee_routing_status: "requested" | "onchain_verified" | "not_applicable";
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
  feeRoute: "author_xmoney" | "developer" | "custom" | "charity" | "holder_rewards";
  feeRecipientHandle?: string | null;
  feeRecipientWallet?: string | null;
  feeRoutingStatus?: "requested" | "onchain_verified" | "not_applicable";
  ttlMinutes?: number;
}) {
  const ttl = Math.max(5, Math.min(args.ttlMinutes ?? 30, 30));
  const rows = await sql()`
    INSERT INTO xlaunch_posts (
      post_id, source_key, post_url, status, venue, chain, reserver_wallet,
      reservation_expires_at, token_name, token_symbol, metadata,
      fee_route, fee_recipient_handle, fee_recipient_wallet, fee_routing_status
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
      ${JSON.stringify(args.metadata)}::jsonb,
      ${args.feeRoute},
      ${args.feeRecipientHandle ?? null},
      ${args.feeRecipientWallet ?? null},
      ${args.feeRoutingStatus ?? "requested"}
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
      metadata = EXCLUDED.metadata,
      fee_route = EXCLUDED.fee_route,
      fee_recipient_handle = EXCLUDED.fee_recipient_handle,
      fee_recipient_wallet = EXCLUDED.fee_recipient_wallet,
      fee_routing_status = EXCLUDED.fee_routing_status
    WHERE
      xlaunch_posts.status = 'reserved'
      AND xlaunch_posts.reservation_expires_at < now()
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


export async function markFeeRoutingVerified(args: {
  postId: string;
  feeRecipientWallet?: string | null;
}) {
  const rows = await sql()`
    UPDATE xlaunch_posts
    SET fee_routing_status = 'onchain_verified',
        fee_recipient_wallet = COALESCE(${args.feeRecipientWallet ?? null}, fee_recipient_wallet)
    WHERE post_id = ${args.postId}
      AND status = 'live'
    RETURNING *
  `;
  return (rows[0] as RegistryRecord | undefined) ?? null;
}

export async function getFeeEvents(postId: string) {
  return sql()`
    SELECT id, post_id, event_type, asset, amount, usd_amount, chain_tx_hash, proof_url, note, created_at
    FROM xlaunch_fee_events
    WHERE post_id = ${postId}
    ORDER BY created_at DESC
    LIMIT 100
  `;
}


export type FeeEventType =
  | "accrued"
  | "claimed"
  | "converted"
  | "xmoney_sent"
  | "xmoney_expired"
  | "refunded";

export async function recordFeeEvent(args: {
  postId: string;
  eventType: FeeEventType;
  asset?: string | null;
  amount?: string | null;
  usdAmount?: string | null;
  chainTxHash?: string | null;
  proofUrl?: string | null;
  note?: string | null;
}) {
  const rows = await sql()`
    INSERT INTO xlaunch_fee_events (
      post_id,
      event_type,
      asset,
      amount,
      usd_amount,
      chain_tx_hash,
      proof_url,
      note
    ) VALUES (
      ${args.postId},
      ${args.eventType},
      ${args.asset ?? null},
      ${args.amount ?? null},
      ${args.usdAmount ?? null},
      ${args.chainTxHash ?? null},
      ${args.proofUrl ?? null},
      ${args.note ?? null}
    )
    RETURNING *
  `;
  return rows[0];
}
