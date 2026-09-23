import { ImageResponse } from "next/og";

export const runtime = "edge";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return new Response("Invalid X post id.", { status: 400 });
  }

  let text = "Tokenized from an X post.";
  let authorName = "X";
  let handle = "";

  try {
    const endpoint = new URL("https://publish.twitter.com/oembed");
    endpoint.searchParams.set("url", `https://x.com/i/status/${id}`);
    endpoint.searchParams.set("omit_script", "true");
    endpoint.searchParams.set("dnt", "true");

    const response = await fetch(endpoint, { cache: "no-store" });
    if (response.ok) {
      const embed = await response.json();
      authorName = String(embed.author_name || "X");
      const authorUrl = String(embed.author_url || "");
      handle =
        authorUrl.match(/(?:x|twitter)\.com\/([^/?#]+)/i)?.[1] || "";
      const paragraph = String(embed.html || "").match(
        /<p[^>]*>([\s\S]*?)<\/p>/i,
      )?.[1];
      if (paragraph) text = stripHtml(paragraph);
    }
  } catch {
    // The card still renders with its immutable post id if X oEmbed is down.
  }

  const displayText =
    text.length > 300 ? text.slice(0, 297).trimEnd() + "…" : text;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#000",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 34,
            fontWeight: 800,
          }}
        >
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <span style={{ fontSize: 48 }}>𝕏</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span>{authorName}</span>
              <span style={{ color: "#777", fontSize: 24 }}>
                {handle ? "@" + handle : "X post"}
              </span>
            </div>
          </div>
          <span style={{ color: "#666", fontSize: 24 }}>XLAUNCH</span>
        </div>

        <div
          style={{
            fontSize: displayText.length > 180 ? 48 : 58,
            lineHeight: 1.18,
            letterSpacing: "-0.035em",
            whiteSpace: "pre-wrap",
            maxWidth: "920px",
          }}
        >
          {displayText}
        </div>

        <div
          style={{
            borderTop: "2px solid #252525",
            paddingTop: "28px",
            display: "flex",
            justifyContent: "space-between",
            color: "#777",
            fontSize: 22,
            letterSpacing: "0.08em",
          }}
        >
          <span>POST {id}</span>
          <span>ONE POST · ONE TOKEN · ONE CHAIN</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 1200,
      headers: {
        "cache-control": "public, max-age=300, s-maxage=3600",
      },
    },
  );
}
