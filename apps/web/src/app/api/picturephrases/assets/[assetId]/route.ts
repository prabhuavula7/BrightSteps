import { NextResponse } from "next/server";
import { readPicturePhraseAssetBuffer } from "@/server/picturephrases/repository";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;

  try {
    const { buffer, mimeType } = await readPicturePhraseAssetBuffer(assetId);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
}
