import { NextRequest, NextResponse } from "next/server";
import { getRegistryRecord } from "@/lib/db";
import { resolveVerifiedXSource } from "@/lib/x-source";
import { parseXPostUrl } from "@/lib/xpost";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    const parsed = parseXPostUrl(String(url ?? ""));
    const source = await resolveVerifiedXSource(parsed.id);

    let registry = null;
    if (process.env.DATABASE_URL) {
      registry = await getRegistryRecord(parsed.id);
    }

    return NextResponse.json({
      post: {
        ...parsed,
        canonicalUrl: source.url,
        text: source.text,
        authorName: source.authorName,
        handle: source.handle,
      },
      registry,
      registryConfigured: Boolean(process.env.DATABASE_URL),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not resolve post.",
      },
      { status: 400 },
    );
  }
}
