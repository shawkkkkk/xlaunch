import "server-only";

export type VerifiedXSource = {
  postId: string;
  url: string;
  text: string;
  authorName: string;
  handle: string;
  media: Array<{
    type: "photo" | "video" | "animated_gif";
    url: string;
  }>;
};

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

async function resolvePostMedia(postId: string) {
  const bearer = process.env.X_API_BEARER_TOKEN?.trim();
  if (!bearer) return [] as VerifiedXSource["media"];

  try {
    const url = new URL(`https://api.x.com/2/tweets/${postId}`);
    url.searchParams.set("expansions", "attachments.media_keys");
    url.searchParams.set("media.fields", "type,url,preview_image_url");

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${bearer}` },
      cache: "no-store",
    });
    if (!response.ok) return [] as VerifiedXSource["media"];

    const body = await response.json();
    const media = Array.isArray(body?.includes?.media) ? body.includes.media : [];
    return media
      .map((item: any) => {
        const type = String(item?.type || "");
        const mediaUrl = String(item?.url || item?.preview_image_url || "");
        if (!["photo", "video", "animated_gif"].includes(type) || !mediaUrl) {
          return null;
        }
        return {
          type: type as "photo" | "video" | "animated_gif",
          url: mediaUrl,
        };
      })
      .filter(Boolean) as VerifiedXSource["media"];
  } catch {
    return [] as VerifiedXSource["media"];
  }
}

export async function resolveVerifiedXSource(
  postId: string,
): Promise<VerifiedXSource> {
  if (!/^\d+$/.test(postId)) throw new Error("Invalid X post id.");

  const oembedUrl = new URL("https://publish.twitter.com/oembed");
  oembedUrl.searchParams.set("url", `https://x.com/i/status/${postId}`);
  oembedUrl.searchParams.set("omit_script", "true");
  oembedUrl.searchParams.set("dnt", "true");

  const response = await fetch(oembedUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      "XLaunch could not verify that this is a currently public X post.",
    );
  }

  const embed = await response.json();
  const authorUrl = String(embed.author_url || "");
  const handle =
    authorUrl.match(/(?:x|twitter)\.com\/([^/?#]+)/i)?.[1] || "";
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    throw new Error("XLaunch could not verify the source post author.");
  }

  const paragraph = String(embed.html || "").match(
    /<p[^>]*>([\s\S]*?)<\/p>/i,
  )?.[1];

  const media = await resolvePostMedia(postId);

  return {
    postId,
    url: `https://x.com/${handle}/status/${postId}`,
    text: paragraph ? stripHtml(paragraph) : "",
    authorName: String(embed.author_name || ""),
    handle,
    media,
  };
}
