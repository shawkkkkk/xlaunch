import { NextRequest, NextResponse } from "next/server";
import { getRegistryRecord } from "@/lib/db";
import { parseXPostUrl } from "@/lib/xpost";

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

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    const parsed = parseXPostUrl(String(url ?? ""));

    const oembedUrl = new URL("https://publish.twitter.com/oembed");
    oembedUrl.searchParams.set("url", parsed.canonicalUrl);
    oembedUrl.searchParams.set("omit_script", "true");
    oembedUrl.searchParams.set("dnt", "true");

    const response = await fetch(oembedUrl, { cache: "no-store" });
    const embed = response.ok ? await response.json() : null;
    const authorUrl = typeof embed?.author_url === "string" ? embed.author_url : "";
    const handle = authorUrl.match(/(?:x|twitter)\.com\/([^/?#]+)/i)?.[1] ?? "";
    const paragraph = typeof embed?.html === "string" ? embed.html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] : "";

    let registry = null;
    if (process.env.DATABASE_URL) registry = await getRegistryRecord(parsed.id);

    return NextResponse.json({
      post: {
        ...parsed,
        text: paragraph ? stripHtml(paragraph) : "",
        authorName: embed?.author_name ?? "",
        handle,
      },
      registry,
      registryConfigured: Boolean(process.env.DATABASE_URL),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not resolve post." }, { status: 400 });
  }
}
