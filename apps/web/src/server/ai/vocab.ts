import { z } from "zod";
import { serverEnv } from "@/server/env";

export const vocabPromptVersion = "vocab-v1";

const vocabSchema = z.object({
  syllables: z.array(z.string().min(1)).min(1).max(8),
  definition: z.string().min(1),
  partOfSpeech: z.string().optional(),
  exampleSentence: z.string().min(1),
  reviewSentence: z.string().min(1),
  hints: z.array(z.string().min(1)).max(4).default([]),
  acceptedPronunciations: z.array(z.string().min(1)).default([]),
});

export type VocabGenerationInput = {
  word: string;
  topic: string;
  language: string;
  ageBand: string;
};

export type VocabGenerationOutput = z.infer<typeof vocabSchema> & {
  provider: "openai" | "gemini";
  model: string;
  promptVersion: string;
  flagged: boolean;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSyllable(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9']/g, "")
    .trim()
    .toLowerCase();
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function toFallback(input: VocabGenerationInput): z.infer<typeof vocabSchema> {
  const cleanWord = normalizeText(input.word);
  const letters = cleanWord.toLowerCase().replace(/[^a-z]/g, "");
  const midpoint = Math.max(1, Math.floor(letters.length / 2));
  const syllables = letters.length >= 4
    ? [letters.slice(0, midpoint), letters.slice(midpoint)].filter(Boolean)
    : [letters || cleanWord.toLowerCase()];

  return {
    syllables,
    definition: `${cleanWord} is a vocabulary word in the ${input.topic} topic.`,
    partOfSpeech: "word",
    exampleSentence: `We say the word ${cleanWord} clearly.`,
    reviewSentence: `Say the word ${cleanWord}.`,
    hints: [
      `Try saying ${cleanWord} slowly.`,
      `Break ${cleanWord} into small parts.`,
    ],
    acceptedPronunciations: [cleanWord.toLowerCase()],
  };
}

function buildPrompts(input: VocabGenerationInput): { system: string; user: string } {
  const system = [
    "You create vocabulary practice support for autistic children.",
    "Use calm, literal, concrete language.",
    "No idioms, no metaphors, no sarcasm, no politics, no religion, no medical advice.",
    "Keep outputs short and predictable.",
    "Return valid JSON only.",
  ].join(" ");

  const user = [
    `Word: ${input.word}`,
    `Topic: ${input.topic}`,
    `Language: ${input.language}`,
    `Age band: ${input.ageBand}`,
    "Return this JSON shape exactly:",
    '{"syllables": ["..."], "definition": "...", "partOfSpeech": "...", "exampleSentence": "...", "reviewSentence": "...", "hints": ["..."], "acceptedPronunciations": ["..."]}',
    "Rules:",
    "- syllables: split into spoken chunks, lowercase",
    "- definition: one short literal sentence",
    "- exampleSentence: one short simple sentence",
    "- reviewSentence: one short instruction sentence to prompt speech",
    "- hints: 2-4 short lines",
    "- acceptedPronunciations: include the base word lowercase",
  ].join("\n");

  return { system, user };
}

function normalizeGenerated(raw: z.infer<typeof vocabSchema>, fallback: z.infer<typeof vocabSchema>) {
  const cleanWord = normalizeText(fallback.acceptedPronunciations[0] ?? "");

  const syllables = raw.syllables
    .map((value) => normalizeSyllable(value))
    .filter(Boolean)
    .slice(0, 8);

  const accepted = Array.from(
    new Set(
      [
        ...raw.acceptedPronunciations.map((value) => normalizeText(value).toLowerCase()).filter(Boolean),
        cleanWord.toLowerCase(),
      ].filter(Boolean),
    ),
  );

  return {
    syllables: syllables.length > 0 ? syllables : fallback.syllables,
    definition: normalizeText(raw.definition) || fallback.definition,
    partOfSpeech: raw.partOfSpeech ? normalizeText(raw.partOfSpeech) : fallback.partOfSpeech,
    exampleSentence: normalizeText(raw.exampleSentence) || fallback.exampleSentence,
    reviewSentence: normalizeText(raw.reviewSentence) || fallback.reviewSentence,
    hints:
      raw.hints
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .slice(0, 4) || fallback.hints,
    acceptedPronunciations: accepted.length > 0 ? accepted : fallback.acceptedPronunciations,
  };
}

async function callOpenAiText(input: VocabGenerationInput): Promise<VocabGenerationOutput> {
  if (!serverEnv.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const prompts = buildPrompts(input);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serverEnv.openAiApiKey}`,
    },
    signal: AbortSignal.timeout(serverEnv.openAiTimeoutMs),
    body: JSON.stringify({
      model: serverEnv.openAiModelVocabText,
      max_output_tokens: serverEnv.vocabMaxOutputTokens,
      text: {
        format: {
          type: "json_object",
        },
      },
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: prompts.system }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: prompts.user }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI vocab request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  const text =
    payload.output_text ??
    payload.output?.flatMap((entry) => entry.content ?? []).find((part) => typeof part.text === "string")?.text;

  if (!text) {
    throw new Error("OpenAI vocab response did not include text output.");
  }

  const fallback = toFallback(input);
  let parsed: z.infer<typeof vocabSchema>;
  try {
    parsed = vocabSchema.parse(JSON.parse(extractJsonText(text)));
  } catch {
    parsed = fallback;
  }

  return {
    ...normalizeGenerated(parsed, fallback),
    provider: "openai",
    model: serverEnv.openAiModelVocabText,
    promptVersion: vocabPromptVersion,
    flagged: false,
  };
}

async function callGeminiText(input: VocabGenerationInput): Promise<VocabGenerationOutput> {
  if (!serverEnv.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const prompts = buildPrompts(input);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    serverEnv.geminiModelVocabText,
  )}:generateContent?key=${encodeURIComponent(serverEnv.geminiApiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(serverEnv.geminiTimeoutMs),
    body: JSON.stringify({
      generationConfig: {
        temperature: serverEnv.vocabTemperature,
        maxOutputTokens: serverEnv.vocabMaxOutputTokens,
        responseMimeType: "application/json",
      },
      contents: [
        {
          role: "user",
          parts: [{ text: `${prompts.system}\n\n${prompts.user}` }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini vocab request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (!text) {
    throw new Error("Gemini vocab response did not include text output.");
  }

  const fallback = toFallback(input);
  let parsed: z.infer<typeof vocabSchema>;
  try {
    parsed = vocabSchema.parse(JSON.parse(extractJsonText(text)));
  } catch {
    parsed = fallback;
  }

  return {
    ...normalizeGenerated(parsed, fallback),
    provider: "gemini",
    model: serverEnv.geminiModelVocabText,
    promptVersion: vocabPromptVersion,
    flagged: false,
  };
}

async function moderateWithOpenAi(text: string): Promise<boolean> {
  if (!serverEnv.openAiApiKey || !text.trim()) {
    return false;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverEnv.openAiApiKey}`,
      },
      signal: AbortSignal.timeout(serverEnv.openAiTimeoutMs),
      body: JSON.stringify({
        model: serverEnv.openAiModerationModel,
        input: text,
      }),
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as {
      results?: Array<{
        flagged?: boolean;
      }>;
    };

    return payload.results?.[0]?.flagged === true;
  } catch {
    return false;
  }
}

export async function generateVocabWordContent(input: VocabGenerationInput): Promise<VocabGenerationOutput> {
  const primary = serverEnv.aiPrimaryProvider.toLowerCase() === "gemini" ? "gemini" : "openai";
  const fallback = serverEnv.aiFallbackProvider.toLowerCase() === "openai" ? "openai" : "gemini";

  let generated: VocabGenerationOutput;

  try {
    generated = primary === "gemini" ? await callGeminiText(input) : await callOpenAiText(input);
  } catch (primaryError) {
    if (fallback === primary) {
      throw primaryError;
    }

    generated = fallback === "gemini" ? await callGeminiText(input) : await callOpenAiText(input);
  }

  const moderationInput = `${generated.definition}\n${generated.exampleSentence}\n${generated.reviewSentence}`;
  const flagged = await moderateWithOpenAi(moderationInput);
  if (!flagged) {
    return generated;
  }

  const safeFallback = toFallback(input);
  return {
    ...safeFallback,
    provider: generated.provider,
    model: generated.model,
    promptVersion: generated.promptVersion,
    flagged: true,
  };
}

export async function synthesizeVocabAudio(input: {
  text: string;
}): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (!serverEnv.openAiApiKey || !input.text.trim()) {
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverEnv.openAiApiKey}`,
      },
      signal: AbortSignal.timeout(serverEnv.openAiTimeoutMs),
      body: JSON.stringify({
        model: serverEnv.openAiModelVocabTts,
        voice: serverEnv.openAiVoiceVocab,
        format: "mp3",
        input: input.text,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      return null;
    }

    return {
      bytes,
      mimeType: "audio/mpeg",
    };
  } catch {
    return null;
  }
}

function normalizeAudioMimeType(rawMimeType: string | undefined, fileName?: string): string {
  const base = (rawMimeType ?? "").split(";")[0]?.trim().toLowerCase();
  if (base === "audio/webm" || base === "video/webm") {
    return "audio/webm";
  }
  if (base === "audio/wav" || base === "audio/wave" || base === "audio/x-wav") {
    return "audio/wav";
  }
  if (base === "audio/ogg") {
    return "audio/ogg";
  }
  if (base === "audio/mp4" || base === "audio/m4a" || base === "audio/x-m4a") {
    return "audio/mp4";
  }
  if (base === "audio/mpeg" || base === "audio/mp3" || base === "audio/mpga") {
    return "audio/mpeg";
  }

  const ext = fileName?.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "m4a":
    case "mp4":
      return "audio/mp4";
    case "mp3":
    case "mpeg":
    case "mpga":
      return "audio/mpeg";
    case "webm":
    default:
      return "audio/webm";
  }
}

function extensionFromAudioMimeType(mimeType: string, fileName?: string): string {
  switch (mimeType) {
    case "audio/wav":
      return "wav";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    case "audio/webm":
      return "webm";
    default: {
      const ext = fileName?.split(".").pop()?.toLowerCase();
      return ext && ext.length <= 5 ? ext : "webm";
    }
  }
}

export async function transcribeVocabAudio(input: {
  audioBytes: Uint8Array;
  mimeType: string;
  fileName?: string;
}): Promise<string> {
  if (!serverEnv.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const normalizedMimeType = normalizeAudioMimeType(input.mimeType, input.fileName);
  const extension = extensionFromAudioMimeType(normalizedMimeType, input.fileName);
  const formData = new FormData();
  const normalizedBytes = new Uint8Array(input.audioBytes);
  const arrayBuffer = normalizedBytes.buffer.slice(
    normalizedBytes.byteOffset,
    normalizedBytes.byteOffset + normalizedBytes.byteLength,
  );
  const blob = new Blob([arrayBuffer], { type: normalizedMimeType });
  formData.append("file", blob, `pronunciation.${extension}`);
  formData.append("model", serverEnv.openAiModelVocabStt);
  formData.append("language", "en");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverEnv.openAiApiKey}`,
    },
    signal: AbortSignal.timeout(serverEnv.openAiTimeoutMs),
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vocab transcription failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as { text?: string };
  return normalizeText(payload.text ?? "");
}
