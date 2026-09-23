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
  creator_x_user_id: string | null;
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
  creatorXUserId?: string | null;
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
      creator_x_user_id, reservation_expires_at, token_name, token_symbol, metadata,
      fee_route, fee_recipient_handle, fee_recipient_wallet, fee_routing_status
    ) VALUES (
      ${args.postId},
      ${`x:${args.postId}`},
      ${args.postUrl},
      'reserved',
      ${args.venue},
      ${args.chain},
      ${args.wallet},
      ${args.creatorXUserId ?? null},
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
      creator_x_user_id = EXCLUDED.creator_x_user_id,
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

export async function releaseReservedPost(args: {
  postId: string;
  wallet: string;
  venue: RegistryVenue;
}) {
  const rows = await sql()`
    DELETE FROM xlaunch_posts
    WHERE post_id = ${args.postId}
      AND status = 'reserved'
      AND venue = ${args.venue}
      AND (
        (chain = 'solana' AND reserver_wallet = ${args.wallet})
        OR (chain = 'robinhood' AND lower(reserver_wallet) = lower(${args.wallet}))
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


export async function getPendingSocialCompletionReplies(limit = 25) {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));
  return sql()`
    SELECT
      command_post_id,
      source_post_id,
      author_handle,
      venue,
      intent,
      token_address,
      tx_hash
    FROM xlaunch_social_commands
    WHERE status = 'launched'
      AND token_address IS NOT NULL
      AND completion_reply_post_id IS NULL
    ORDER BY updated_at ASC
    LIMIT ${safeLimit}
  `;
}

export async function setSocialCompletionReply(args: {
  commandPostId: string;
  replyPostId: string;
}) {
  const rows = await sql()`
    UPDATE xlaunch_social_commands
    SET completion_reply_post_id = ${args.replyPostId},
        updated_at = now()
    WHERE command_post_id = ${args.commandPostId}
      AND status = 'launched'
    RETURNING *
  `;
  return rows[0] ?? null;
}


export type XLaunchProfile = {
  x_user_id: string;
  x_handle: string;
  display_name: string | null;
  avatar_url: string | null;
  evm_wallet_address: string | null;
  evm_wallet_provider_id: string | null;
  solana_wallet_address: string | null;
  solana_wallet_provider_id: string | null;
  wallet_provider: string | null;
  created_at: string;
  updated_at: string;
};

export async function upsertProfile(args: {
  xUserId: string;
  xHandle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}) {
  const rows = await sql()`
    INSERT INTO xlaunch_profiles (
      x_user_id, x_handle, display_name, avatar_url
    ) VALUES (
      ${args.xUserId},
      ${args.xHandle},
      ${args.displayName ?? null},
      ${args.avatarUrl ?? null}
    )
    ON CONFLICT (x_user_id) DO UPDATE SET
      x_handle = EXCLUDED.x_handle,
      display_name = COALESCE(EXCLUDED.display_name, xlaunch_profiles.display_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, xlaunch_profiles.avatar_url),
      updated_at = now()
    RETURNING *
  `;
  return rows[0] as XLaunchProfile;
}

export async function getProfile(xUserId: string) {
  const rows = await sql()`
    SELECT * FROM xlaunch_profiles WHERE x_user_id = ${xUserId} LIMIT 1
  `;
  return (rows[0] as XLaunchProfile | undefined) ?? null;
}

export async function setProfileWallets(args: {
  xUserId: string;
  provider: string;
  evmAddress?: string | null;
  evmProviderId?: string | null;
  solanaAddress?: string | null;
  solanaProviderId?: string | null;
}) {
  const rows = await sql()`
    UPDATE xlaunch_profiles
    SET wallet_provider = ${args.provider},
        evm_wallet_address = COALESCE(${args.evmAddress ?? null}, evm_wallet_address),
        evm_wallet_provider_id = COALESCE(${args.evmProviderId ?? null}, evm_wallet_provider_id),
        solana_wallet_address = COALESCE(${args.solanaAddress ?? null}, solana_wallet_address),
        solana_wallet_provider_id = COALESCE(${args.solanaProviderId ?? null}, solana_wallet_provider_id),
        updated_at = now()
    WHERE x_user_id = ${args.xUserId}
    RETURNING *
  `;
  return (rows[0] as XLaunchProfile | undefined) ?? null;
}

export async function getProfileTokens(xUserId: string) {
  return sql()`
    SELECT
      post_id, post_url, venue, chain, token_name, token_symbol,
      token_address, tx_hash, fee_route, fee_routing_status, confirmed_at
    FROM xlaunch_posts
    WHERE creator_x_user_id = ${xUserId}
      AND status = 'live'
    ORDER BY confirmed_at DESC NULLS LAST
    LIMIT 100
  `;
}

export async function getProfileFeeEvents(xUserId: string) {
  return sql()`
    SELECT
      e.id, e.post_id, e.event_type, e.asset, e.amount, e.usd_amount,
      e.chain_tx_hash, e.proof_url, e.note, e.created_at,
      p.token_name, p.token_symbol, p.venue
    FROM xlaunch_fee_events e
    JOIN xlaunch_posts p ON p.post_id = e.post_id
    WHERE p.creator_x_user_id = ${xUserId}
    ORDER BY e.created_at DESC
    LIMIT 200
  `;
}

export async function getWalletActivity(xUserId: string) {
  return sql()`
    SELECT * FROM xlaunch_wallet_activity
    WHERE x_user_id = ${xUserId}
    ORDER BY created_at DESC
    LIMIT 100
  `;
}


export type ExploreSort = "newest" | "volume" | "trending" | "marketcap";

export async function getExploreTokens(sort: ExploreSort, limit = 50) {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));

  if (sort === "newest") {
    return sql()`
      SELECT
        p.post_id, p.post_url, p.venue, p.chain, p.token_name, p.token_symbol,
        p.token_address, p.fee_route, p.confirmed_at, p.metadata,
        m.price_usd, m.market_cap_usd, m.volume_24h_usd, m.liquidity_usd,
        m.price_change_24h_pct, m.trades_24h, m.holders, m.updated_at AS market_updated_at
      FROM xlaunch_posts p
      LEFT JOIN xlaunch_market_snapshots m ON m.post_id = p.post_id
      WHERE p.status = 'live'
      ORDER BY p.confirmed_at DESC NULLS LAST
      LIMIT ${safeLimit}
    `;
  }

  if (sort === "volume") {
    return sql()`
      SELECT
        p.post_id, p.post_url, p.venue, p.chain, p.token_name, p.token_symbol,
        p.token_address, p.fee_route, p.confirmed_at, p.metadata,
        m.price_usd, m.market_cap_usd, m.volume_24h_usd, m.liquidity_usd,
        m.price_change_24h_pct, m.trades_24h, m.holders, m.updated_at AS market_updated_at
      FROM xlaunch_posts p
      JOIN xlaunch_market_snapshots m ON m.post_id = p.post_id
      WHERE p.status = 'live'
      ORDER BY m.volume_24h_usd DESC NULLS LAST, p.confirmed_at DESC
      LIMIT ${safeLimit}
    `;
  }

  if (sort === "marketcap") {
    return sql()`
      SELECT
        p.post_id, p.post_url, p.venue, p.chain, p.token_name, p.token_symbol,
        p.token_address, p.fee_route, p.confirmed_at, p.metadata,
        m.price_usd, m.market_cap_usd, m.volume_24h_usd, m.liquidity_usd,
        m.price_change_24h_pct, m.trades_24h, m.holders, m.updated_at AS market_updated_at
      FROM xlaunch_posts p
      JOIN xlaunch_market_snapshots m ON m.post_id = p.post_id
      WHERE p.status = 'live'
      ORDER BY m.market_cap_usd DESC NULLS LAST, m.volume_24h_usd DESC NULLS LAST
      LIMIT ${safeLimit}
    `;
  }

  return sql()`
    SELECT
      p.post_id, p.post_url, p.venue, p.chain, p.token_name, p.token_symbol,
      p.token_address, p.fee_route, p.confirmed_at, p.metadata,
      m.price_usd, m.market_cap_usd, m.volume_24h_usd, m.liquidity_usd,
      m.price_change_24h_pct, m.trades_24h, m.holders, m.updated_at AS market_updated_at,
      (
        COALESCE(LN(1 + m.volume_24h_usd), 0) * 0.42 +
        COALESCE(LN(1 + m.market_cap_usd), 0) * 0.18 +
        COALESCE(LN(1 + m.trades_24h), 0) * 0.24 +
        GREATEST(LEAST(COALESCE(m.price_change_24h_pct, 0), 200), -100) / 100 * 0.16
      ) AS trending_score
    FROM xlaunch_posts p
    JOIN xlaunch_market_snapshots m ON m.post_id = p.post_id
    WHERE p.status = 'live'
    ORDER BY trending_score DESC NULLS LAST, m.volume_24h_usd DESC NULLS LAST
    LIMIT ${safeLimit}
  `;
}

export async function upsertMarketSnapshot(args: {
  postId: string;
  priceUsd?: string | null;
  marketCapUsd?: string | null;
  volume24hUsd?: string | null;
  liquidityUsd?: string | null;
  priceChange24hPct?: string | null;
  trades24h?: number | null;
  holders?: number | null;
  source?: string | null;
  sourceUpdatedAt?: string | null;
}) {
  const rows = await sql()`
    INSERT INTO xlaunch_market_snapshots (
      post_id, price_usd, market_cap_usd, volume_24h_usd, liquidity_usd,
      price_change_24h_pct, trades_24h, holders, source, source_updated_at
    ) VALUES (
      ${args.postId},
      ${args.priceUsd ?? null},
      ${args.marketCapUsd ?? null},
      ${args.volume24hUsd ?? null},
      ${args.liquidityUsd ?? null},
      ${args.priceChange24hPct ?? null},
      ${args.trades24h ?? null},
      ${args.holders ?? null},
      ${args.source ?? null},
      ${args.sourceUpdatedAt ?? null}
    )
    ON CONFLICT (post_id) DO UPDATE SET
      price_usd = EXCLUDED.price_usd,
      market_cap_usd = EXCLUDED.market_cap_usd,
      volume_24h_usd = EXCLUDED.volume_24h_usd,
      liquidity_usd = EXCLUDED.liquidity_usd,
      price_change_24h_pct = EXCLUDED.price_change_24h_pct,
      trades_24h = EXCLUDED.trades_24h,
      holders = EXCLUDED.holders,
      source = EXCLUDED.source,
      source_updated_at = EXCLUDED.source_updated_at,
      updated_at = now()
    RETURNING *
  `;
  return rows[0];
}


export async function getLiveTokensForMarketIndex(limit = 60) {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));
  return sql()`
    SELECT post_id, venue, chain, token_address, token_symbol
    FROM xlaunch_posts
    WHERE status = 'live'
      AND token_address IS NOT NULL
    ORDER BY COALESCE(confirmed_at, created_at) DESC
    LIMIT ${safeLimit}
  `;
}


export async function getMarketSnapshot(postId: string) {
  const rows = await sql()`
    SELECT
      post_id, price_usd, market_cap_usd, volume_24h_usd, liquidity_usd,
      price_change_24h_pct, trades_24h, holders, source,
      source_updated_at, updated_at
    FROM xlaunch_market_snapshots
    WHERE post_id = ${postId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}
