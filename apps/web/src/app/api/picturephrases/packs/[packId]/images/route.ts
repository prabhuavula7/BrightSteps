import { NextResponse } from "next/server";
import heicConvert from "heic-convert";
import { serverEnv } from "@/server/env";
import { addImageCardToPack, generateForPicturePhrasePack } from "@/server/picturephrases/service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ packId: string }> }) {
  const { packId } = await context.params;

  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "image file is required" }, { status: 400 });
    }

    const mimeType = image.type || "application/octet-stream";
    const isImageMime = mimeType.startsWith("image/");

    if (!isImageMime) {
      return NextResponse.json(
        {
          error: `Unsupported image type (${mimeType}). Upload a valid image file.`,
        },
        { status: 400 },
      );
    }

    const maxBytes = serverEnv.uploadMaxImageMb * 1024 * 1024;
    if (image.size > maxBytes) {
      return NextResponse.json(
        { error: `Image exceeds ${serverEnv.uploadMaxImageMb} MB limit.` },
        { status: 400 },
      );
    }

    const altTextRaw = formData.get("altText");
    const topicRaw = formData.get("topic");
    const autoGenerateRaw = formData.get("autoGenerate");
    const autoGenerate = String(autoGenerateRaw ?? "true") !== "false";

    let buffer = Buffer.from(await image.arrayBuffer());
    let normalizedMimeType = mimeType;

    if (mimeType.includes("heic") || mimeType.includes("heif")) {
      const converted = await heicConvert({
        buffer,
        format: "JPEG",
        quality: 0.92,
      });
      buffer = Buffer.from(converted);
      normalizedMimeType = "image/jpeg";
    }

    const added = await addImageCardToPack({
      packId,
      fileBuffer: buffer,
      mimeType: normalizedMimeType,
      altText: typeof altTextRaw === "string" ? altTextRaw : undefined,
      topic: typeof topicRaw === "string" ? topicRaw : undefined,
    });

    const details = autoGenerate
      ? await generateForPicturePhrasePack({ packId, itemId: added.itemId })
      : added.details;

    return NextResponse.json({
      pack: details.record.payload,
      assetUrlById: details.assetUrlById,
      summary: details.summary,
      valid: details.validation.success,
      issues: details.validation.success ? [] : details.validation.issues,
      createdItemId: added.itemId,
      createdAssetId: added.assetId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload image" },
      { status: 500 },
    );
  }
}
