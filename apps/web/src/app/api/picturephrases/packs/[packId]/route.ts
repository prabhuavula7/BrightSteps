import { NextResponse } from "next/server";
import {
  getPicturePhrasePackDetails,
  removePicturePhrasePack,
  savePicturePhrasePack,
} from "@/server/picturephrases/service";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ packId: string }> }) {
  const { packId } = await context.params;

  const details = getPicturePhrasePackDetails(packId);
  if (!details) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  return NextResponse.json({
    pack: details.record.payload,
    assetUrlById: details.assetUrlById,
    summary: details.summary,
    valid: details.validation.success,
    issues: details.validation.success ? [] : details.validation.issues,
  });
}

export async function PUT(request: Request, context: { params: Promise<{ packId: string }> }) {
  const { packId } = await context.params;

  try {
    const body = (await request.json()) as {
      payload?: unknown;
    };

    if (body.payload === undefined) {
      return NextResponse.json({ error: "payload is required" }, { status: 400 });
    }

    const details = savePicturePhrasePack(packId, body.payload);

    return NextResponse.json({
      pack: details.record.payload,
      assetUrlById: details.assetUrlById,
      summary: details.summary,
      valid: details.validation.success,
      issues: details.validation.success ? [] : details.validation.issues,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save pack" },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ packId: string }> }) {
  const { packId } = await context.params;

  try {
    await removePicturePhrasePack(packId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete pack" },
      { status: 500 },
    );
  }
}
