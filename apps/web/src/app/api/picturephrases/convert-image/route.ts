import { NextResponse } from "next/server";
import heicConvert from "heic-convert";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "image file is required" }, { status: 400 });
    }

    const mimeType = image.type || "application/octet-stream";
    if (!mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are supported" }, { status: 400 });
    }

    const inputBuffer = Buffer.from(await image.arrayBuffer());

    if (mimeType.includes("heic") || mimeType.includes("heif")) {
      const converted = await heicConvert({
        buffer: inputBuffer,
        format: "JPEG",
        quality: 0.92,
      });

      return new NextResponse(new Uint8Array(converted), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store",
        },
      });
    }

    return new NextResponse(new Uint8Array(inputBuffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to convert image" },
      { status: 500 },
    );
  }
}
