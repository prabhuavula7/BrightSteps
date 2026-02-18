import { NextResponse } from "next/server";
import { readVocabAssetById } from "@/server/vocab/service";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;

  try {
    const { buffer, mimeType } = await readVocabAssetById(assetId);

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
