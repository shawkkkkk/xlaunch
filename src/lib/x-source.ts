import "server-only";

export type VerifiedXSource = {
  postId: string;
  url: string;
  text: string;
  authorName: string;
  handle: string;
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

  return {
    postId,
    url: `https://x.com/${handle}/status/${postId}`,
    text: paragraph ? stripHtml(paragraph) : "",
    authorName: String(embed.author_name || ""),
    handle,
  };
}
