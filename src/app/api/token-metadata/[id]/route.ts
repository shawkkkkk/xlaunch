import { NextResponse } from "next/server";
import { getRegistryRecord } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid X post id." }, { status: 400 });
  }

  const record = await getRegistryRecord(id).catch(() => null);
  if (!record) {
    return NextResponse.json({ error: "Unknown XLaunch post." }, { status: 404 });
  }

  const metadata = record.metadata as any;
  const configuredWebsite = String(metadata?.socials?.website || "").trim();
  const website =
    !configuredWebsite ||
    configuredWebsite.replace(/\/$/, "") === "https://launchonx.net"
      ? `https://launchonx.net/post/${id}`
      : configuredWebsite;

  return NextResponse.json(
    {
      name: record.token_name,
      symbol: record.token_symbol,
      description: metadata?.description || "Tokenized from X post " + id + " through XLaunch.",
      image: metadata?.image || "",
      external_url: website,
      website,
      twitter: metadata?.socials?.twitter || record.post_url,
      telegram: metadata?.socials?.telegram || "",
      discord: metadata?.socials?.discord || "",
      farcaster: metadata?.socials?.farcaster || "",
      xlaunch: {
        postId: id,
        source: record.post_url,
        registry: "https://launchonx.net/post/" + id,
        venue: record.venue,
        chain: record.chain,
      },
    },
    {
      headers: {
        "cache-control": record.status === "live"
          ? "public, max-age=300, s-maxage=3600"
          : "no-store",
      },
    },
  );
}
