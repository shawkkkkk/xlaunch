import "server-only";

type XMention = {
  id: string;
  text: string;
  author_id?: string;
  referenced_tweets?: Array<{ type: string; id: string }>;
};

type XUser = {
  id: string;
  username: string;
  name?: string;
};

function config() {
  const userId = process.env.X_BOT_USER_ID?.trim();
  const accessToken = process.env.X_BOT_ACCESS_TOKEN?.trim();
  if (!userId || !accessToken) {
    throw new Error("X bot credentials are not configured.");
  }
  return { userId, accessToken };
}

export async function fetchXLaunchMentions(sinceId?: string | null) {
  const { userId, accessToken } = config();
  const url = new URL(`https://api.x.com/2/users/${userId}/mentions`);
  url.searchParams.set("max_results", "100");
  url.searchParams.set("tweet.fields", "author_id,referenced_tweets,conversation_id");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username,name");
  if (sinceId) url.searchParams.set("since_id", sinceId);

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      body?.detail ||
        body?.title ||
        body?.errors?.[0]?.message ||
        "Could not read XLaunch mentions.",
    );
  }

  const users = new Map<string, XUser>();
  for (const user of body?.includes?.users || []) {
    users.set(String(user.id), {
      id: String(user.id),
      username: String(user.username || ""),
      name: String(user.name || ""),
    });
  }

  return {
    mentions: (body?.data || []) as XMention[],
    users,
  };
}

export async function postXReply(args: {
  replyToPostId: string;
  text: string;
}) {
  const { accessToken } = config();
  const response = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text: args.text,
      reply: { in_reply_to_tweet_id: args.replyToPostId },
    }),
    cache: "no-store",
  });

  const body = await response.json();
  if (!response.ok || !body?.data?.id) {
    throw new Error(
      body?.detail ||
        body?.title ||
        body?.errors?.[0]?.message ||
        "Could not post XLaunch reply.",
    );
  }
  return { id: String(body.data.id), text: String(body.data.text || args.text) };
}
