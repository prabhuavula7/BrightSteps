import { NextResponse } from "next/server";
import { checkVocabPronunciation } from "@/server/vocab/service";

export const runtime = "nodejs";

function parseJsonArray(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const packId = String(formData.get("packId") ?? "").trim();
    const itemId = String(formData.get("itemId") ?? "").trim();
    const modeRaw = String(formData.get("mode") ?? "learn").trim().toLowerCase();
    const mode = modeRaw === "review" ? "review" : "learn";
    const word = String(formData.get("word") ?? "").trim();
    const typedAttempt = String(formData.get("typedAttempt") ?? "").trim();

    if (!packId || !itemId || !word) {
      return NextResponse.json(
        { error: "packId, itemId, and word are required" },
        { status: 400 },
      );
    }

    const syllables = parseJsonArray(formData.get("syllables"));
    const acceptedPronunciations = parseJsonArray(formData.get("acceptedPronunciations"));

    const audioFile = formData.get("audio");
    const audioBuffer =
      audioFile instanceof File ? new Uint8Array(await audioFile.arrayBuffer()) : undefined;
    const audioMimeType = audioFile instanceof File ? audioFile.type || "audio/webm" : undefined;
    const audioFileName = audioFile instanceof File ? audioFile.name : undefined;

    const result = await checkVocabPronunciation({
      packId,
      itemId,
      mode,
      word,
      syllables,
      acceptedPronunciations,
      typedAttempt,
      audioBytes: audioBuffer,
      audioMimeType,
      audioFileName,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pronunciation check failed" },
      { status: 500 },
    );
  }
}
