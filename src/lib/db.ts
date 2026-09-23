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
  | "donate_gg_sent"
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


export type SocialCommandStatus =
  | "awaiting_wallet"
  | "ready"
  | "reserved"
  | "launched"
  | "failed"
  | "cancelled";

export async function upsertSocialCommand(args: {
  commandPostId: string;
  sourcePostId: string;
  xUserId: string;
  authorHandle: string;
  venue: RegistryVenue;
  intent: Record<string, unknown>;
  confirmationTokenHash: string;
  status: SocialCommandStatus;
}) {
  const rows = await sql()`
    INSERT INTO xlaunch_social_commands (
      command_post_id,
      source_post_id,
      x_user_id,
      author_handle,
      venue,
      intent,
      confirmation_token_hash,
      status
    ) VALUES (
      ${args.commandPostId},
      ${args.sourcePostId},
      ${args.xUserId},
      ${args.authorHandle},
      ${args.venue},
      ${JSON.stringify(args.intent)}::jsonb,
      ${args.confirmationTokenHash},
      ${args.status}
    )
    ON CONFLICT (command_post_id) DO UPDATE SET
      updated_at = now()
    RETURNING *
  `;
  return rows[0];
}

export async function getSocialCommand(commandPostId: string) {
  const rows = await sql()`
    SELECT *
    FROM xlaunch_social_commands
    WHERE command_post_id = ${commandPostId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getSocialAccount(xUserId: string) {
  const rows = await sql()`
    SELECT *
    FROM xlaunch_social_accounts
    WHERE x_user_id = ${xUserId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function upsertSocialAccount(args: {
  xUserId: string;
  xHandle: string;
  solanaWallet?: string | null;
  evmWallet?: string | null;
}) {
  const rows = await sql()`
    INSERT INTO xlaunch_social_accounts (
      x_user_id, x_handle, solana_wallet, evm_wallet
    ) VALUES (
      ${args.xUserId},
      ${args.xHandle},
      ${args.solanaWallet ?? null},
      ${args.evmWallet ?? null}
    )
    ON CONFLICT (x_user_id) DO UPDATE SET
      x_handle = EXCLUDED.x_handle,
      solana_wallet = COALESCE(EXCLUDED.solana_wallet, xlaunch_social_accounts.solana_wallet),
      evm_wallet = COALESCE(EXCLUDED.evm_wallet, xlaunch_social_accounts.evm_wallet),
      updated_at = now()
    RETURNING *
  `;
  return rows[0];
}

export async function updateSocialCommandStatus(args: {
  commandPostId: string;
  status: SocialCommandStatus;
  tokenAddress?: string | null;
  txHash?: string | null;
  error?: string | null;
}) {
  const rows = await sql()`
    UPDATE xlaunch_social_commands
    SET status = ${args.status},
        token_address = COALESCE(${args.tokenAddress ?? null}, token_address),
        tx_hash = COALESCE(${args.txHash ?? null}, tx_hash),
        error = ${args.error ?? null},
        updated_at = now()
    WHERE command_post_id = ${args.commandPostId}
    RETURNING *
  `;
  return rows[0] ?? null;
}


export async function getBotState(key: string) {
  const rows = await sql()`
    SELECT value FROM xlaunch_bot_state WHERE key = ${key} LIMIT 1
  `;
  return rows[0] ? String((rows[0] as { value: string }).value) : null;
}

export async function setBotState(key: string, value: string) {
  const rows = await sql()`
    INSERT INTO xlaunch_bot_state (key, value)
    VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = now()
    RETURNING *
  `;
  return rows[0];
}


export async function setSocialCommandReply(args: {
  commandPostId: string;
  replyPostId: string;
}) {
  const rows = await sql()`
    UPDATE xlaunch_social_commands
    SET reply_post_id = ${args.replyPostId},
        updated_at = now()
    WHERE command_post_id = ${args.commandPostId}
    RETURNING *
  `;
  return rows[0] ?? null;
}
