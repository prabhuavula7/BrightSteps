import { NextResponse } from "next/server";
import { readLearnAudioByCacheKey } from "@/server/learn/service";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ cacheKey: string }> }) {
  const { cacheKey } = await context.params;

  try {
    const { buffer, mimeType } = await readLearnAudioByCacheKey(cacheKey);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  }
}
