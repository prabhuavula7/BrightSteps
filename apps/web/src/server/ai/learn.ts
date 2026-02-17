import { z } from "zod";
import { serverEnv } from "@/server/env";

export const learnPromptVersion = "learn-v1";

const learnSchema = z.object({
  headline: z.string().min(1),
  teachText: z.string().min(1),
  speakText: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).max(4).default([]),
  practicePrompt: z.string().optional(),
});

export type LearnGenerationInput = {
  moduleType: "factcards" | "picturephrases";
  language: string;
  ageBand: string;
  topic: string;
  factCard?: {
    prompt: string;
    answer: string;
    hints: string[];
  };
  picturePhrase?: {
    canonical: string;
    variants: string[];
    wordBank: string[];
  };
};

export type LearnGenerationOutput = z.infer<typeof learnSchema> & {
  provider: "openai" | "gemini";
  model: string;
  promptVersion: string;
  flagged: boolean;
};

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

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toFallback(input: LearnGenerationInput): z.infer<typeof learnSchema> {
  if (input.moduleType === "factcards") {
    const prompt = normalizeText(input.factCard?.prompt ?? "");
    const answer = normalizeText(input.factCard?.answer ?? "");

    return {
      headline: "Learn this fact",
      teachText: `${prompt} The answer is ${answer}.`.trim(),
      speakText: `${answer}. ${prompt ? `Question: ${prompt}.` : ""}`.trim(),
      keyPoints: answer ? [answer] : [],
      practicePrompt: prompt || undefined,
    };
  }

  const canonical = normalizeText(input.picturePhrase?.canonical ?? "The picture shows a scene.");
  const keyWords = input.picturePhrase?.wordBank?.slice(0, 3) ?? [];

  return {
    headline: "Learn this sentence",
    teachText: canonical,
    speakText: canonical,
    keyPoints: keyWords,
    practicePrompt: "Say the sentence clearly using simple words.",
  };
}

function buildPrompts(input: LearnGenerationInput): { system: string; user: string } {
  const system = [
    "You are creating educational support content for autistic children.",
    "Use calm, concrete, literal language with short sentences.",
    "No sarcasm, idioms, abstract metaphors, politics, religion, or medical advice.",
    "Keep tone supportive and predictable.",
    "Return valid JSON only.",
  ].join(" ");

  const moduleSpecific =
    input.moduleType === "factcards"
      ? [
          `Module: FactCards`,
          `Topic: ${input.topic}`,
          `Question: ${input.factCard?.prompt ?? ""}`,
          `Answer: ${input.factCard?.answer ?? ""}`,
          input.factCard?.hints?.length ? `Hints: ${input.factCard.hints.join(" | ")}` : "",
        ]
      : [
          `Module: PicturePhrases`,
          `Topic: ${input.topic}`,
          `Canonical sentence: ${input.picturePhrase?.canonical ?? ""}`,
          input.picturePhrase?.variants?.length
            ? `Variants: ${input.picturePhrase.variants.slice(0, 5).join(" | ")}`
            : "",
          input.picturePhrase?.wordBank?.length
            ? `Word bank: ${input.picturePhrase.wordBank.slice(0, 16).join(", ")}`
            : "",
        ];

  const user = [
    `Language: ${input.language}`,
    `Age band: ${input.ageBand}`,
    ...moduleSpecific,
    "Return this JSON shape exactly:",
    '{ "headline": "...", "teachText": "...", "speakText": "...", "keyPoints": ["..."], "practicePrompt": "..." }',
    "Rules:",
    "- headline: 2-6 words",
    "- teachText: 1-3 short sentences",
    "- speakText: natural read-aloud line(s), 1-2 short sentences",
    "- keyPoints: 1-4 concrete words/phrases",
    "- practicePrompt: one short instruction sentence",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

function normalizeGenerated(raw: z.infer<typeof learnSchema>, fallback: z.infer<typeof learnSchema>): z.infer<typeof learnSchema> {
  return {
    headline: normalizeText(raw.headline) || fallback.headline,
    teachText: normalizeText(raw.teachText) || fallback.teachText,
    speakText: normalizeText(raw.speakText) || fallback.speakText,
    keyPoints:
      raw.keyPoints
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .slice(0, 4) || fallback.keyPoints,
    practicePrompt: raw.practicePrompt ? normalizeText(raw.practicePrompt) : fallback.practicePrompt,
  };
}

async function callOpenAiText(input: LearnGenerationInput): Promise<LearnGenerationOutput> {
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
      model: serverEnv.openAiModelLearnText,
      max_output_tokens: serverEnv.learnMaxOutputTokens,
      reasoning: {
        effort: "low",
      },
      text: {
        format: {
          type: "json_object",
        },
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: prompts.system,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompts.user,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ text?: string }>;
    }>;
  };

  const text =
    payload.output_text ??
    payload.output?.flatMap((entry) => entry.content ?? []).find((part) => typeof part.text === "string")?.text;

  if (!text) {
    throw new Error("OpenAI learn response did not include text output.");
  }

  const parsed = learnSchema.parse(JSON.parse(extractJsonText(text)));
  const fallback = toFallback(input);

  return {
    ...normalizeGenerated(parsed, fallback),
    provider: "openai",
    model: serverEnv.openAiModelLearnText,
    promptVersion: learnPromptVersion,
    flagged: false,
  };
}

async function callGeminiText(input: LearnGenerationInput): Promise<LearnGenerationOutput> {
  if (!serverEnv.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const prompts = buildPrompts(input);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    serverEnv.geminiModelLearnText,
  )}:generateContent?key=${encodeURIComponent(serverEnv.geminiApiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(serverEnv.geminiTimeoutMs),
    body: JSON.stringify({
      generationConfig: {
        temperature: serverEnv.learnTemperature,
        maxOutputTokens: serverEnv.learnMaxOutputTokens,
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
    throw new Error(`Gemini request failed (${response.status}): ${text}`);
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
    throw new Error("Gemini learn response did not include text output.");
  }

  const parsed = learnSchema.parse(JSON.parse(extractJsonText(text)));
  const fallback = toFallback(input);

  return {
    ...normalizeGenerated(parsed, fallback),
    provider: "gemini",
    model: serverEnv.geminiModelLearnText,
    promptVersion: learnPromptVersion,
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

export async function generateLearnText(input: LearnGenerationInput): Promise<LearnGenerationOutput> {
  const primary = serverEnv.aiPrimaryProvider.toLowerCase() === "gemini" ? "gemini" : "openai";
  const fallback = serverEnv.aiFallbackProvider.toLowerCase() === "openai" ? "openai" : "gemini";

  let generated: LearnGenerationOutput;

  try {
    generated = primary === "gemini" ? await callGeminiText(input) : await callOpenAiText(input);
  } catch (primaryError) {
    if (fallback === primary) {
      throw primaryError;
    }

    generated = fallback === "gemini" ? await callGeminiText(input) : await callOpenAiText(input);
  }

  const flagged = await moderateWithOpenAi(`${generated.headline}\n${generated.teachText}\n${generated.speakText}`);
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

export async function synthesizeLearnAudio(input: {
  text: string;
}): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (!serverEnv.learnAudioEnabled || !serverEnv.openAiApiKey || !input.text.trim()) {
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
        model: serverEnv.openAiModelLearnTts,
        voice: serverEnv.openAiVoiceLearn,
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
