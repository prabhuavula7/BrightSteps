const DEFAULT_SQLITE_PATH = "./data/db/brightsteps.sqlite";
const DEFAULT_UPLOAD_DIR = "./data/uploads";

function parseIntWithDefault(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatWithDefault(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAllowedMimeTypes(raw: string | undefined): string[] {
  if (!raw) {
    return ["image/*"];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseBooleanWithDefault(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return fallback;
}

export const serverEnv = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  logLevel: process.env.LOG_LEVEL ?? "info",
  sqlitePath: process.env.BRIGHTSTEPS_DB_PATH ?? DEFAULT_SQLITE_PATH,
  uploadDir: process.env.BRIGHTSTEPS_UPLOAD_DIR ?? DEFAULT_UPLOAD_DIR,
  aiPrimaryProvider: process.env.AI_PRIMARY_PROVIDER ?? "openai",
  aiFallbackProvider: process.env.AI_FALLBACK_PROVIDER ?? "gemini",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModelPicturePhrases: process.env.OPENAI_MODEL_PICTUREPHRASES ?? "gpt-5-mini",
  openAiModelLearnText: process.env.OPENAI_MODEL_LEARN_TEXT ?? "gpt-5-mini",
  openAiModelLearnTts: process.env.OPENAI_MODEL_LEARN_TTS ?? "gpt-4o-mini-tts",
  openAiVoiceLearn: process.env.OPENAI_VOICE_LEARN ?? "alloy",
  openAiModelVocabText: process.env.OPENAI_MODEL_VOCAB_TEXT ?? "gpt-5-mini",
  openAiModelVocabTts: process.env.OPENAI_MODEL_VOCAB_TTS ?? "gpt-4o-mini-tts",
  openAiVoiceVocab: process.env.OPENAI_VOICE_VOCAB ?? "alloy",
  openAiModelVocabStt: process.env.OPENAI_MODEL_VOCAB_STT ?? "gpt-4o-mini-transcribe",
  openAiModerationModel: process.env.OPENAI_MODERATION_MODEL ?? "omni-moderation-latest",
  openAiTimeoutMs: parseIntWithDefault(process.env.OPENAI_TIMEOUT_MS, 30000),
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModelPicturePhrases: process.env.GEMINI_MODEL_PICTUREPHRASES ?? "gemini-2.5-flash",
  geminiModelLearnText: process.env.GEMINI_MODEL_LEARN_TEXT ?? "gemini-2.5-flash",
  geminiModelVocabText: process.env.GEMINI_MODEL_VOCAB_TEXT ?? "gemini-2.5-flash",
  geminiTimeoutMs: parseIntWithDefault(process.env.GEMINI_TIMEOUT_MS, 30000),
  picturePhrasesSentenceCount: parseIntWithDefault(process.env.PICTUREPHRASES_SENTENCE_COUNT, 5),
  picturePhrasesMaxOutputTokens: parseIntWithDefault(process.env.PICTUREPHRASES_MAX_OUTPUT_TOKENS, 1200),
  picturePhrasesTemperature: parseFloatWithDefault(process.env.PICTUREPHRASES_TEMPERATURE, 0.4),
  learnMaxOutputTokens: parseIntWithDefault(process.env.LEARN_MAX_OUTPUT_TOKENS, 700),
  learnTemperature: parseFloatWithDefault(process.env.LEARN_TEMPERATURE, 0.3),
  learnAudioEnabled: parseBooleanWithDefault(process.env.LEARN_AUDIO_ENABLED, true),
  vocabMaxOutputTokens: parseIntWithDefault(process.env.VOCAB_MAX_OUTPUT_TOKENS, 320),
  vocabTemperature: parseFloatWithDefault(process.env.VOCAB_TEMPERATURE, 0.2),
  uploadMaxImageMb: parseIntWithDefault(process.env.UPLOAD_MAX_IMAGE_MB, 8),
  uploadAllowedImageMime: parseAllowedMimeTypes(process.env.UPLOAD_ALLOWED_IMAGE_MIME),
};

export function requireOpenAiApiKey() {
  if (!serverEnv.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
}
