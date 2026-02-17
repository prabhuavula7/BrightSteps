import { NextResponse } from "next/server";
import { generateForPicturePhrasePack } from "@/server/picturephrases/service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ packId: string }> }) {
  const { packId } = await context.params;

  try {
    const body = (await request.json().catch(() => ({}))) as { itemId?: string };

    const details = await generateForPicturePhrasePack({
      packId,
      itemId: body.itemId,
    });

    return NextResponse.json({
      pack: details.record.payload,
      assetUrlById: details.assetUrlById,
      summary: details.summary,
      valid: details.validation.success,
      issues: details.validation.success ? [] : details.validation.issues,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 },
    );
  }
}
