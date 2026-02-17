import { NextResponse } from "next/server";
import {
  createPicturePhrasePack,
  listPicturePhrasePackSummaries,
} from "@/server/picturephrases/service";

export const runtime = "nodejs";

export async function GET() {
  const packs = listPicturePhrasePackSummaries();
  return NextResponse.json({ packs });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      packId?: string;
      title?: string;
      description?: string;
      language?: string;
      ageBand?: string;
      topics?: string[];
    };

    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const details = createPicturePhrasePack({
      packId: body.packId,
      title,
      description: body.description,
      language: body.language,
      ageBand: body.ageBand,
      topics: Array.isArray(body.topics) ? body.topics : undefined,
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
      { error: error instanceof Error ? error.message : "Failed to create pack" },
      { status: 500 },
    );
  }
}
