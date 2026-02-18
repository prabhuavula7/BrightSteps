import { type ValidationResult, validatePack } from "@brightsteps/content-schema";
import {
  createVocabAudioAsset,
  createEmptyVocabPack,
  deleteVocabAsset,
  deleteVocabPack,
  getVocabPack,
  listVocabPacks,
  logVocabGeneration,
  logVocabPronunciationAttempt,
  parseVocabItemsFromPayload,
  readVocabAssetBuffer,
  summarizeVocabPack,
  toVocabAssetUrl,
  upsertVocabPack,
  type VocabPackRecord,
  type VocabPackSummary,
} from "@/server/vocab/repository";
import {
  generateVocabWordContent,
  synthesizeVocabAudio,
  transcribeVocabAudio,
} from "@/server/ai/vocab";

export type VocabPackDetails = {
  record: VocabPackRecord;
  validation: ValidationResult;
  assetUrlById: Record<string, string>;
  summary: VocabPackSummary;
};

function normalizeWord(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeSyllable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9']/g, "").trim();
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function withAssetUrls(payload: unknown): { payload: unknown; assetUrlById: Record<string, string> } {
  const pack = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const assets = Array.isArray(pack.assets) ? pack.assets : [];
  const assetUrlById: Record<string, string> = {};

  for (const asset of assets) {
    if (!asset || typeof asset !== "object") {
      continue;
    }

    const mutableAsset = asset as Record<string, unknown>;
    const assetId = typeof mutableAsset.id === "string" ? mutableAsset.id : "";
    const kind = typeof mutableAsset.kind === "string" ? mutableAsset.kind : "";
    if (!assetId || kind !== "audio") {
      continue;
    }

    const resolved = toVocabAssetUrl(assetId);
    mutableAsset.path = resolved;
    assetUrlById[assetId] = resolved;
  }

  return { payload: pack, assetUrlById };
}

function clonePayload(payload: unknown): Record<string, unknown> {
  const base = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
}

function ensureVocabPackShape(packId: string, payload: unknown): Record<string, unknown> {
  const base = clonePayload(payload);

  if (!base.schemaVersion) {
    base.schemaVersion = "2.0.0";
  }
  if (!base.packId || String(base.packId).trim().length === 0) {
    base.packId = packId;
  }
  base.moduleType = "vocabvoice";
  if (!base.title || String(base.title).trim().length === 0) {
    base.title = packId;
  }
  if (!base.version || String(base.version).trim().length === 0) {
    base.version = "1.0.0";
  }
  if (!base.language || String(base.language).trim().length === 0) {
    base.language = "en";
  }
  if (!base.ageBand || String(base.ageBand).trim().length === 0) {
    base.ageBand = "6-10";
  }
  if (!Array.isArray(base.topics) || base.topics.length === 0) {
    base.topics = ["general"];
  }
  if (!Array.isArray(base.assets)) {
    base.assets = [];
  }
  if (!Array.isArray(base.items)) {
    base.items = [];
  }
  if (!base.settings || typeof base.settings !== "object") {
    base.settings = {
      defaultSupportLevel: 2,
      audioEnabledByDefault: true,
    };
  }

  return base;
}

function cleanupGeneratedFields(item: Record<string, unknown>) {
  item.syllables = [];
  item.definition = "";
  item.exampleSentence = "";
  item.partOfSpeech = "";
  item.hints = [];
  item.review = {
    sentencePrompt: "",
    acceptedPronunciations: [String(item.word ?? "").toLowerCase()].filter(Boolean),
  };
}

export function listVocabPackSummaries(): VocabPackSummary[] {
  return listVocabPacks().map(summarizeVocabPack);
}

export function getVocabPackDetails(packId: string): VocabPackDetails | null {
  const record = getVocabPack(packId);
  if (!record) {
    return null;
  }

  const payload = ensureVocabPackShape(packId, record.payload);
  const withUrls = withAssetUrls(payload);
  const validation = validatePack(withUrls.payload);

  return {
    record: {
      ...record,
      payload: withUrls.payload,
    },
    validation,
    assetUrlById: withUrls.assetUrlById,
    summary: summarizeVocabPack({
      ...record,
      payload: withUrls.payload,
    }),
  };
}

export function createVocabPack(input: {
  packId?: string;
  title: string;
  description?: string;
  language?: string;
  ageBand?: string;
  topics?: string[];
}): VocabPackDetails {
  const safePackId = input.packId?.trim() || `vocab-${Date.now().toString(36)}`;

  const draft = createEmptyVocabPack({
    packId: safePackId,
    title: input.title,
    description: input.description,
    language: input.language,
    ageBand: input.ageBand,
    topics: input.topics,
  });

  upsertVocabPack(safePackId, draft);
  const details = getVocabPackDetails(safePackId);
  if (!details) {
    throw new Error("Failed to create vocabulary pack.");
  }

  return details;
}

export function saveVocabPack(packId: string, payload: unknown): VocabPackDetails {
  const normalized = ensureVocabPackShape(packId, payload);

  const items = Array.isArray(normalized.items) ? normalized.items : [];
  normalized.items = items
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => {
      const item = { ...(entry as Record<string, unknown>) };
      item.id = typeof item.id === "string" && item.id.trim().length > 0 ? item.id : `vw_${index + 1}`;
      item.type = "vocabword";
      item.topic = typeof item.topic === "string" && item.topic.trim().length > 0 ? item.topic : "general";
      item.word = normalizeWord(String(item.word ?? ""));
      if (!item.word) {
        item.word = `word_${index + 1}`;
      }

      const review = item.review && typeof item.review === "object"
        ? { ...(item.review as Record<string, unknown>) }
        : {};
      const accepted = safeStringArray(review.acceptedPronunciations);
      const normalizedWord = String(item.word ?? "").toLowerCase();
      review.acceptedPronunciations = Array.from(
        new Set([normalizedWord, ...accepted.map((value) => value.toLowerCase())]),
      );
      review.sentencePrompt = String(review.sentencePrompt ?? "").trim();
      item.review = review;

      if (!item.media || typeof item.media !== "object") {
        item.media = { pronunciationAudioRef: "" };
      }

      if (!Array.isArray(item.syllables)) {
        item.syllables = [];
      }
      if (!Array.isArray(item.hints)) {
        item.hints = [];
      }

      if (!item.definition || typeof item.definition !== "string") {
        item.definition = "";
      }
      if (!item.exampleSentence || typeof item.exampleSentence !== "string") {
        item.exampleSentence = "";
      }

      return item;
    });

  upsertVocabPack(packId, normalized);

  const details = getVocabPackDetails(packId);
  if (!details) {
    throw new Error("Failed to save vocabulary pack.");
  }

  return details;
}

export async function removeVocabPack(packId: string): Promise<void> {
  await deleteVocabPack(packId);
}

async function generateForItem(params: {
  packId: string;
  itemId: string;
}): Promise<void> {
  const details = getVocabPackDetails(params.packId);
  if (!details) {
    throw new Error("Pack not found.");
  }

  const payload = ensureVocabPackShape(params.packId, details.record.payload);
  const items = Array.isArray(payload.items) ? [...payload.items] : [];
  const assets = Array.isArray(payload.assets) ? [...payload.assets] : [];

  const itemIndex = items.findIndex((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    return String((entry as Record<string, unknown>).id ?? "") === params.itemId;
  });

  if (itemIndex < 0) {
    throw new Error(`Word ${params.itemId} not found.`);
  }

  const item = { ...(items[itemIndex] as Record<string, unknown>) };
  const word = normalizeWord(String(item.word ?? ""));
  const topic = String(item.topic ?? "general").trim() || "general";

  if (!word) {
    throw new Error(`Word ${params.itemId} is empty.`);
  }

  const generated = await generateVocabWordContent({
    word,
    topic,
    language: String(payload.language ?? "en"),
    ageBand: String(payload.ageBand ?? "6-10"),
  });

  const existingMedia = item.media && typeof item.media === "object"
    ? (item.media as Record<string, unknown>)
    : null;
  const previousAudioRef = existingMedia && typeof existingMedia.pronunciationAudioRef === "string"
    ? existingMedia.pronunciationAudioRef
    : undefined;
  const previousImageRef = existingMedia && typeof existingMedia.imageRef === "string"
    ? existingMedia.imageRef
    : undefined;
  const previousSlowAudioRef = existingMedia && typeof existingMedia.slowAudioRef === "string"
    ? existingMedia.slowAudioRef
    : undefined;

  let pronunciationAudioRef = previousAudioRef;
  const ttsText = `${word}. ${generated.syllables.join(" - ")}. ${generated.reviewSentence}`;
  const audio = await synthesizeVocabAudio({ text: ttsText });
  if (audio) {
    const savedAsset = await createVocabAudioAsset({
      packId: params.packId,
      mimeType: audio.mimeType,
      transcript: word,
      bytes: audio.bytes,
    });

    pronunciationAudioRef = savedAsset.assetId;

    assets.push({
      id: savedAsset.assetId,
      kind: "audio",
      path: toVocabAssetUrl(savedAsset.assetId),
      transcript: word,
    });

    if (previousAudioRef && previousAudioRef !== savedAsset.assetId) {
      const nextAssets = assets.filter((entry) => {
        if (!entry || typeof entry !== "object") {
          return true;
        }

        return String((entry as Record<string, unknown>).id ?? "") !== previousAudioRef;
      });
      assets.length = 0;
      assets.push(...nextAssets);
      await deleteVocabAsset(previousAudioRef);
    }
  }

  const nextItem: Record<string, unknown> = {
    ...item,
    id: item.id,
    type: "vocabword",
    topic,
    word,
    syllables: generated.syllables,
    definition: generated.definition,
    partOfSpeech: generated.partOfSpeech,
    exampleSentence: generated.exampleSentence,
    hints: generated.hints,
    review: {
      sentencePrompt: generated.reviewSentence,
      acceptedPronunciations: generated.acceptedPronunciations,
    },
    media: {
      pronunciationAudioRef: pronunciationAudioRef ?? "",
      imageRef: previousImageRef,
      slowAudioRef: previousSlowAudioRef,
    },
    aiMeta: {
      provider: generated.provider,
      model: generated.model,
      promptVersion: generated.promptVersion,
      generatedAt: new Date().toISOString(),
    },
  };

  if (!nextItem.media || typeof nextItem.media !== "object") {
    throw new Error(`Word ${params.itemId} does not have audio metadata after generation.`);
  }

  if (!String((nextItem.media as Record<string, unknown>).pronunciationAudioRef ?? "").trim()) {
    throw new Error(`Failed to synthesize pronunciation audio for ${word}.`);
  }

  items[itemIndex] = nextItem;

  payload.items = items;
  payload.assets = assets;
  upsertVocabPack(params.packId, payload);

  logVocabGeneration({
    packId: params.packId,
    itemId: params.itemId,
    provider: generated.provider,
    model: generated.model,
    promptVersion: generated.promptVersion,
    status: "success",
    output: {
      word,
      syllables: generated.syllables,
      definition: generated.definition,
    },
  });
}

export async function generateForVocabPack(input: {
  packId: string;
  itemId?: string;
}): Promise<VocabPackDetails> {
  const details = getVocabPackDetails(input.packId);
  if (!details) {
    throw new Error("Pack not found.");
  }

  const payload = ensureVocabPackShape(input.packId, details.record.payload);
  const items = parseVocabItemsFromPayload(payload);
  if (items.length === 0) {
    throw new Error("Add at least one word before running the AI pipeline.");
  }

  const targetIds = input.itemId
    ? [input.itemId]
    : items.map((item) => item.id);

  const failures: string[] = [];

  for (const itemId of targetIds) {
    try {
      await generateForItem({ packId: input.packId, itemId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed";
      failures.push(`${itemId}: ${message}`);
      logVocabGeneration({
        packId: input.packId,
        itemId,
        provider: "openai",
        model: "unknown",
        promptVersion: "unknown",
        status: "error",
        errorMessage: message,
      });
    }
  }

  const refreshed = getVocabPackDetails(input.packId);
  if (!refreshed) {
    throw new Error("Failed to refresh pack after generation.");
  }

  if (failures.length > 0) {
    throw new Error(`Some words failed generation: ${failures.join(" | ")}`);
  }

  return refreshed;
}

export type PronunciationCheckInput = {
  packId: string;
  itemId: string;
  mode: "learn" | "review";
  word: string;
  syllables: string[];
  acceptedPronunciations: string[];
  audioBytes?: Uint8Array;
  audioMimeType?: string;
  audioFileName?: string;
  typedAttempt?: string;
};

export type PronunciationCheckResult = {
  transcript: string;
  expectedWord: string;
  isCorrect: boolean;
  score: number;
  syllableMatches: Array<{ syllable: string; correct: boolean }>;
};

function computeSyllableMatches(transcript: string, syllables: string[]) {
  const flattened = normalizeForCompare(transcript).replace(/\s+/g, "");
  let cursor = 0;

  return syllables.map((rawSyllable) => {
    const syllable = normalizeSyllable(rawSyllable);
    if (!syllable) {
      return { syllable: rawSyllable, correct: false };
    }

    const foundAt = flattened.indexOf(syllable, cursor);
    if (foundAt < 0) {
      return { syllable: rawSyllable, correct: false };
    }

    cursor = foundAt + syllable.length;
    return { syllable: rawSyllable, correct: true };
  });
}

export async function checkVocabPronunciation(input: PronunciationCheckInput): Promise<PronunciationCheckResult> {
  const expectedWord = normalizeForCompare(input.word);
  const accepted = Array.from(
    new Set([
      expectedWord,
      ...input.acceptedPronunciations.map((value) => normalizeForCompare(value)),
    ]),
  ).filter(Boolean);

  let transcript = normalizeForCompare(input.typedAttempt ?? "");

  if (input.audioBytes && input.audioBytes.byteLength > 0) {
    transcript = normalizeForCompare(
      await transcribeVocabAudio({
        audioBytes: input.audioBytes,
        mimeType: input.audioMimeType ?? "audio/mpeg",
        fileName: input.audioFileName,
      }),
    );
  }

  const syllableMatches = computeSyllableMatches(transcript, input.syllables);
  const hitCount = syllableMatches.filter((entry) => entry.correct).length;
  const totalCount = Math.max(1, syllableMatches.length);
  const rawScore = hitCount / totalCount;

  const transcriptFlat = transcript.replace(/\s+/g, "");
  const expectedFlat = expectedWord.replace(/\s+/g, "");
  const acceptedFlats = accepted.map((value) => value.replace(/\s+/g, ""));

  let isCorrect = accepted.includes(transcript) || acceptedFlats.includes(transcriptFlat);
  if (!isCorrect && transcriptFlat.length > 0 && expectedFlat.length > 0 && rawScore >= 1) {
    isCorrect = true;
  }

  const score = Number((isCorrect ? Math.max(rawScore, 0.95) : rawScore).toFixed(2));

  logVocabPronunciationAttempt({
    packId: input.packId,
    itemId: input.itemId,
    expectedWord: input.word,
    transcript,
    score,
    isCorrect,
    mode: input.mode,
  });

  return {
    transcript,
    expectedWord: input.word,
    isCorrect,
    score,
    syllableMatches,
  };
}

export async function readVocabAssetById(assetId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  return readVocabAssetBuffer(assetId);
}

export function createDraftVocabItem(word: string, topic = "general"): Record<string, unknown> {
  const cleanWord = normalizeWord(word);

  const item: Record<string, unknown> = {
    id: `vw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type: "vocabword",
    topic,
    word: cleanWord,
    media: {
      pronunciationAudioRef: "",
    },
  };

  cleanupGeneratedFields(item);
  return item;
}
