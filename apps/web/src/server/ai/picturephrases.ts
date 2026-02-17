import { z } from "zod";
import { serverEnv } from "@/server/env";

const promptVersion = "pp-v1";

const generationSchema = z.object({
  topic: z.string().min(1),
  canonical: z.string().min(1),
  variants: z.array(z.string().min(1)).min(1),
  wordBank: z.array(z.string().min(1)).min(1),
  distractors: z.array(z.string().min(1)).default([]),
  hints: z
    .object({
      level3: z.string().optional(),
      level2: z.string().optional(),
      level1: z.string().optional(),
      level0: z.string().optional(),
    })
    .optional(),
});

export type PicturePhraseGeneratedContent = z.infer<typeof generationSchema> & {
  provider: "openai" | "gemini";
  model: string;
  promptVersion: string;
};

export type PicturePhraseGenerationInput = {
  imageBuffer: Buffer;
  mimeType: string;
  suggestedTopic?: string;
};

function toBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/gi, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
}

function uniqueWords(words: string[]): string[] {
  return Array.from(new Set(words));
}

function cleanSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
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

function buildPrompt(input: { suggestedTopic?: string }): { system: string; user: string } {
  const sentenceCount = Math.max(3, Math.min(5, serverEnv.picturePhrasesSentenceCount));

  const system = [
    "You create language-learning prompts for autistic children.",
    "Keep sentences literal, concrete, calm, and age-appropriate.",
    "Avoid figurative language, sarcasm, politics, religion, and medical guidance.",
    "Return valid JSON only.",
  ].join(" ");

  const user = [
    "Analyze the image and produce one core sentence plus variant alternatives for PicturePhrases.",
    `Generate exactly ${sentenceCount} variants describing the same visible scene.`,
    "Use short, clear statements in simple present tense.",
    "Return this JSON shape:",
    '{ "topic": "...", "canonical": "...", "variants": ["..."], "wordBank": ["..."], "distractors": ["..."], "hints": { "level3": "...", "level2": "...", "level1": "..." } }',
    "Rules:",
    "- canonical must appear in variants",
    "- wordBank must be single words, lowercase",
    "- distractors should be plausible but incorrect single words",
    "- keep vocabulary concrete and child-friendly",
    input.suggestedTopic ? `Use this topic label if consistent with the image: ${input.suggestedTopic}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

function normalizeOutput(raw: z.infer<typeof generationSchema>): z.infer<typeof generationSchema> {
  const sentenceCount = Math.max(3, Math.min(5, serverEnv.picturePhrasesSentenceCount));
  const canonical = cleanSentence(raw.canonical);

  const variants = Array.from(
    new Set([canonical, ...raw.variants.map((variant) => cleanSentence(variant)).filter(Boolean)]),
  ).slice(0, sentenceCount);

  const combinedWords = uniqueWords([
    ...raw.wordBank.flatMap((word) => tokenizeWords(word)),
    ...variants.flatMap((sentence) => tokenizeWords(sentence)),
  ]).slice(0, 24);

  const distractors = uniqueWords(raw.distractors.flatMap((word) => tokenizeWords(word)))
    .filter((word) => !combinedWords.includes(word))
    .slice(0, 8);

  const hints = raw.hints ?? {
    level3: `Start with: ${variants[0]?.split(" ").slice(0, 2).join(" ") ?? "the"}`,
    level2: "Use the main object and what it is doing.",
    level1: "Keep the sentence short and clear.",
  };

  return {
    topic: raw.topic.trim() || "general",
    canonical: canonical || variants[0] || "The picture shows a scene.",
    variants: variants.length > 0 ? variants : ["The picture shows a scene."],
    wordBank: combinedWords.length > 0 ? combinedWords : ["the", "picture", "shows", "scene"],
    distractors,
    hints,
  };
}

async function callOpenAi(input: PicturePhraseGenerationInput): Promise<PicturePhraseGeneratedContent> {
  if (!serverEnv.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const prompt = buildPrompt({ suggestedTopic: input.suggestedTopic });
  const dataUrl = `data:${input.mimeType};base64,${toBase64(input.imageBuffer)}`;

  async function request(maxOutputTokens: number): Promise<{
    payload: {
      output_text?: string;
      incomplete_details?: { reason?: string };
      output?: Array<{
        content?: Array<{ type?: string; text?: string; refusal?: string }>;
      }>;
    };
    outputText: string;
  }> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverEnv.openAiApiKey}`,
      },
      signal: AbortSignal.timeout(serverEnv.openAiTimeoutMs),
      body: JSON.stringify({
        model: serverEnv.openAiModelPicturePhrases,
        max_output_tokens: maxOutputTokens,
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
                text: prompt.system,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt.user,
              },
              {
                type: "input_image",
                image_url: dataUrl,
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
      incomplete_details?: { reason?: string };
      output?: Array<{
        content?: Array<{ type?: string; text?: string; refusal?: string }>;
      }>;
    };

    const contentParts = payload.output?.flatMap((entry) => entry.content ?? []) ?? [];
    const textCandidates = [
      typeof payload.output_text === "string" ? payload.output_text : "",
      ...contentParts.map((part) => (typeof part.text === "string" ? part.text : "")),
    ].filter((entry) => entry.trim().length > 0);
    const outputText = textCandidates[0] ?? "";

    if (!outputText) {
      const refusal = contentParts.find((part) => typeof part.refusal === "string")?.refusal;
      if (refusal) {
        throw new Error(`OpenAI refused output: ${refusal}`);
      }
      throw new Error("OpenAI response did not include text output.");
    }

    return { payload, outputText };
  }

  const initialMaxTokens = Math.max(serverEnv.picturePhrasesMaxOutputTokens, 2000);
  let requestResult = await request(initialMaxTokens);
  let parsedJsonText = extractJsonText(requestResult.outputText);

  try {
    const parsed = generationSchema.parse(JSON.parse(parsedJsonText));

    return {
      ...normalizeOutput(parsed),
      provider: "openai",
      model: serverEnv.openAiModelPicturePhrases,
      promptVersion,
    };
  } catch (error) {
    const needsRetry =
      requestResult.payload.incomplete_details?.reason === "max_output_tokens" && initialMaxTokens < 4000;

    if (!needsRetry) {
      throw error;
    }

    requestResult = await request(4000);
    parsedJsonText = extractJsonText(requestResult.outputText);
  }

  const parsed = generationSchema.parse(JSON.parse(parsedJsonText));

  return {
    ...normalizeOutput(parsed),
    provider: "openai",
    model: serverEnv.openAiModelPicturePhrases,
    promptVersion,
  };
}

async function callGemini(input: PicturePhraseGenerationInput): Promise<PicturePhraseGeneratedContent> {
  if (!serverEnv.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const prompt = buildPrompt({ suggestedTopic: input.suggestedTopic });

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    serverEnv.geminiModelPicturePhrases,
  )}:generateContent?key=${encodeURIComponent(serverEnv.geminiApiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(serverEnv.geminiTimeoutMs),
    body: JSON.stringify({
      generationConfig: {
        temperature: serverEnv.picturePhrasesTemperature,
        maxOutputTokens: serverEnv.picturePhrasesMaxOutputTokens,
        responseMimeType: "application/json",
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: `${prompt.system}\n\n${prompt.user}` },
            {
              inlineData: {
                mimeType: input.mimeType,
                data: toBase64(input.imageBuffer),
              },
            },
          ],
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
    throw new Error("Gemini response did not include text output.");
  }

  const parsed = generationSchema.parse(JSON.parse(extractJsonText(text)));

  return {
    ...normalizeOutput(parsed),
    provider: "gemini",
    model: serverEnv.geminiModelPicturePhrases,
    promptVersion,
  };
}

export async function generatePicturePhraseContent(
  input: PicturePhraseGenerationInput,
): Promise<PicturePhraseGeneratedContent> {
  const primary = serverEnv.aiPrimaryProvider.toLowerCase() === "gemini" ? "gemini" : "openai";
  const fallback = serverEnv.aiFallbackProvider.toLowerCase() === "openai" ? "openai" : "gemini";

  try {
    if (primary === "gemini") {
      return await callGemini(input);
    }
    return await callOpenAi(input);
  } catch (primaryError) {
    if (fallback === primary) {
      throw primaryError;
    }

    try {
      if (fallback === "gemini") {
        return await callGemini(input);
      }
      return await callOpenAi(input);
    } catch (fallbackError) {
      const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(`Primary provider failed: ${primaryMessage}. Fallback failed: ${fallbackMessage}`);
    }
  }
}
