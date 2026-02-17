import { createHash } from "node:crypto";
import { z } from "zod";
import { generateLearnText, learnPromptVersion, synthesizeLearnAudio, type LearnGenerationInput } from "@/server/ai/learn";
import {
  getLearnContentCache,
  readLearnAudio,
  upsertLearnContentCache,
  writeLearnAudio,
  type LearnContentPayload,
} from "@/server/learn/repository";

const requestSchema = z.object({
  moduleType: z.enum(["factcards", "picturephrases"]),
  packId: z.string().min(1),
  itemId: z.string().min(1),
  language: z.string().min(1).default("en"),
  ageBand: z.string().min(1).default("6-10"),
  item: z.unknown(),
});

const factCardItemSchema = z.object({
  topic: z.string().min(1).default("general"),
  prompt: z.string().min(1),
  answer: z.string().min(1),
  hints: z.array(z.string().min(1)).default([]),
});

const picturePhraseItemSchema = z.object({
  topic: z.string().min(1).default("general"),
  canonical: z.string().min(1),
  variants: z.array(z.string().min(1)).default([]),
  wordBank: z.array(z.string().min(1)).default([]),
});

export type LearnContentRequest = z.infer<typeof requestSchema>;

export type LearnContentResponse = {
  cacheKey: string;
  moduleType: "factcards" | "picturephrases";
  packId: string;
  itemId: string;
  fromCache: boolean;
  provider: "openai" | "gemini";
  model: string;
  promptVersion: string;
  flagged: boolean;
  content: LearnContentPayload;
  audioUrl?: string;
};

function getAudioUrl(cacheKey: string): string {
  return `/api/learn/audio/${encodeURIComponent(cacheKey)}`;
}

function buildLearnInput(params: LearnContentRequest): LearnGenerationInput {
  if (params.moduleType === "factcards") {
    const parsed = factCardItemSchema.parse(params.item);
    return {
      moduleType: "factcards",
      language: params.language,
      ageBand: params.ageBand,
      topic: parsed.topic,
      factCard: {
        prompt: parsed.prompt,
        answer: parsed.answer,
        hints: parsed.hints,
      },
    };
  }

  const parsed = picturePhraseItemSchema.parse(params.item);
  return {
    moduleType: "picturephrases",
    language: params.language,
    ageBand: params.ageBand,
    topic: parsed.topic,
    picturePhrase: {
      canonical: parsed.canonical,
      variants: parsed.variants,
      wordBank: parsed.wordBank,
    },
  };
}

function computeCacheKey(params: {
  moduleType: "factcards" | "picturephrases";
  packId: string;
  itemId: string;
  promptVersion: string;
  payload: LearnGenerationInput;
}): string {
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        moduleType: params.moduleType,
        packId: params.packId,
        itemId: params.itemId,
        promptVersion: params.promptVersion,
        payload: params.payload,
      }),
    )
    .digest("hex");

  return hash;
}

export function parseLearnContentRequest(raw: unknown): LearnContentRequest {
  return requestSchema.parse(raw);
}

export async function getOrCreateLearnContent(rawRequest: unknown): Promise<LearnContentResponse> {
  const request = parseLearnContentRequest(rawRequest);
  const learnInput = buildLearnInput(request);

  const cacheKey = computeCacheKey({
    moduleType: request.moduleType,
    packId: request.packId,
    itemId: request.itemId,
    promptVersion: learnPromptVersion,
    payload: learnInput,
  });

  const existing = getLearnContentCache(cacheKey);
  if (existing) {
    return {
      cacheKey,
      moduleType: existing.moduleType,
      packId: existing.packId,
      itemId: existing.itemId,
      fromCache: true,
      provider: existing.provider,
      model: existing.model,
      promptVersion: existing.promptVersion,
      flagged: existing.flagged,
      content: existing.content,
      audioUrl: existing.audioRelativePath ? getAudioUrl(cacheKey) : undefined,
    };
  }

  const generated = await generateLearnText(learnInput);
  const audio = await synthesizeLearnAudio({ text: generated.speakText || generated.teachText });

  let audioRelativePath: string | undefined;
  let audioMimeType: string | undefined;

  if (audio) {
    audioRelativePath = await writeLearnAudio(cacheKey, audio.mimeType, audio.bytes);
    audioMimeType = audio.mimeType;
  }

  const saved = upsertLearnContentCache({
    cacheKey,
    moduleType: request.moduleType,
    packId: request.packId,
    itemId: request.itemId,
    promptVersion: generated.promptVersion,
    provider: generated.provider,
    model: generated.model,
    content: {
      headline: generated.headline,
      teachText: generated.teachText,
      speakText: generated.speakText,
      keyPoints: generated.keyPoints,
      practicePrompt: generated.practicePrompt,
    },
    audioRelativePath,
    audioMimeType,
    flagged: generated.flagged,
  });

  return {
    cacheKey,
    moduleType: saved.moduleType,
    packId: saved.packId,
    itemId: saved.itemId,
    fromCache: false,
    provider: saved.provider,
    model: saved.model,
    promptVersion: saved.promptVersion,
    flagged: saved.flagged,
    content: saved.content,
    audioUrl: saved.audioRelativePath ? getAudioUrl(cacheKey) : undefined,
  };
}

export async function readLearnAudioByCacheKey(cacheKey: string): Promise<{ buffer: Buffer; mimeType: string }> {
  return readLearnAudio(cacheKey);
}
