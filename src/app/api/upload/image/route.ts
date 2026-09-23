import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Token image uploads are not configured yet." },
        { status: 503 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Use a PNG, JPG, or WEBP image." },
        { status: 400 },
      );
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Image must be smaller than 4 MB." },
        { status: 400 },
      );
    }

    const extension =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";

    const blob = await put(
      `xlaunch/token-images/${Date.now()}.${extension}`,
      file,
      {
        access: "public",
        addRandomSuffix: true,
        contentType: file.type,
      },
    );

    return NextResponse.json({
      ok: true,
      url: blob.url,
      size: file.size,
      contentType: file.type,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Image upload failed.",
      },
      { status: 500 },
    );
  }
}
