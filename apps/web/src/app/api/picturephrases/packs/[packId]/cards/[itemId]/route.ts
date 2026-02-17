import { NextResponse } from "next/server";
import { removeImageCardFromPack } from "@/server/picturephrases/service";

export const runtime = "nodejs";

export async function DELETE(
  _: Request,
  context: { params: Promise<{ packId: string; itemId: string }> },
) {
  const { packId, itemId } = await context.params;

  try {
    const details = await removeImageCardFromPack({ packId, itemId });

    return NextResponse.json({
      pack: details.record.payload,
      assetUrlById: details.assetUrlById,
      summary: details.summary,
      valid: details.validation.success,
      issues: details.validation.success ? [] : details.validation.issues,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete card" },
      { status: 500 },
    );
  }
}
