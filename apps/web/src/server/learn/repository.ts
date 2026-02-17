import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { ensureDbMigrations } from "@/server/db/migrate";
import { getSqliteDb } from "@/server/db/sqlite";
import { serverEnv } from "@/server/env";

export type LearnContentPayload = {
  headline: string;
  teachText: string;
  speakText: string;
  keyPoints: string[];
  practicePrompt?: string;
};

export type LearnContentCacheRecord = {
  cacheKey: string;
  moduleType: "factcards" | "picturephrases";
  packId: string;
  itemId: string;
  promptVersion: string;
  provider: "openai" | "gemini";
  model: string;
  content: LearnContentPayload;
  audioRelativePath?: string;
  audioMimeType?: string;
  flagged: boolean;
  createdAt: string;
  updatedAt: string;
};

function resolveUploadRoot(): string {
  if (path.isAbsolute(serverEnv.uploadDir)) {
    return serverEnv.uploadDir;
  }

  return path.resolve(process.cwd(), serverEnv.uploadDir);
}

function ensureUploadRootExists() {
  fs.mkdirSync(resolveUploadRoot(), { recursive: true });
}

function toAudioExt(mimeType: string): string {
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "mp3";
  }
  if (mimeType.includes("wav")) {
    return "wav";
  }
  if (mimeType.includes("ogg")) {
    return "ogg";
  }
  return "bin";
}

function parseContentJson(raw: unknown): LearnContentPayload {
  const fallback: LearnContentPayload = {
    headline: "Learn",
    teachText: "",
    speakText: "",
    keyPoints: [],
  };

  if (typeof raw !== "string") {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LearnContentPayload>;
    return {
      headline: parsed.headline?.trim() || fallback.headline,
      teachText: parsed.teachText?.trim() || fallback.teachText,
      speakText: parsed.speakText?.trim() || fallback.speakText,
      keyPoints: Array.isArray(parsed.keyPoints)
        ? parsed.keyPoints.map((value) => String(value).trim()).filter(Boolean)
        : [],
      practicePrompt:
        typeof parsed.practicePrompt === "string" && parsed.practicePrompt.trim().length > 0
          ? parsed.practicePrompt.trim()
          : undefined,
    };
  } catch {
    return fallback;
  }
}

function mapCacheRow(row: Record<string, unknown>): LearnContentCacheRecord {
  return {
    cacheKey: String(row.cache_key),
    moduleType: String(row.module_type) === "picturephrases" ? "picturephrases" : "factcards",
    packId: String(row.pack_id),
    itemId: String(row.item_id),
    promptVersion: String(row.prompt_version),
    provider: String(row.provider) === "gemini" ? "gemini" : "openai",
    model: String(row.model),
    content: parseContentJson(row.content_json),
    audioRelativePath: row.audio_relative_path ? String(row.audio_relative_path) : undefined,
    audioMimeType: row.audio_mime_type ? String(row.audio_mime_type) : undefined,
    flagged: Number(row.flagged) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function getLearnContentCache(cacheKey: string): LearnContentCacheRecord | null {
  ensureDbMigrations();

  const db = getSqliteDb();
  const row = db
    .prepare(`
      SELECT
        cache_key,
        module_type,
        pack_id,
        item_id,
        prompt_version,
        provider,
        model,
        content_json,
        audio_relative_path,
        audio_mime_type,
        flagged,
        created_at,
        updated_at
      FROM learn_content_cache
      WHERE cache_key = ?
      LIMIT 1
    `)
    .get(cacheKey) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  return mapCacheRow(row);
}

export function upsertLearnContentCache(input: {
  cacheKey: string;
  moduleType: "factcards" | "picturephrases";
  packId: string;
  itemId: string;
  promptVersion: string;
  provider: "openai" | "gemini";
  model: string;
  content: LearnContentPayload;
  audioRelativePath?: string;
  audioMimeType?: string;
  flagged: boolean;
}): LearnContentCacheRecord {
  ensureDbMigrations();

  const db = getSqliteDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO learn_content_cache (
      cache_key,
      module_type,
      pack_id,
      item_id,
      prompt_version,
      provider,
      model,
      content_json,
      audio_relative_path,
      audio_mime_type,
      flagged,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      provider = excluded.provider,
      model = excluded.model,
      content_json = excluded.content_json,
      audio_relative_path = excluded.audio_relative_path,
      audio_mime_type = excluded.audio_mime_type,
      flagged = excluded.flagged,
      updated_at = excluded.updated_at
  `).run(
    input.cacheKey,
    input.moduleType,
    input.packId,
    input.itemId,
    input.promptVersion,
    input.provider,
    input.model,
    JSON.stringify(input.content),
    input.audioRelativePath ?? null,
    input.audioMimeType ?? null,
    input.flagged ? 1 : 0,
    now,
    now,
  );

  const next = getLearnContentCache(input.cacheKey);
  if (!next) {
    throw new Error("Failed to save learn content cache.");
  }

  return next;
}

export async function writeLearnAudio(cacheKey: string, mimeType: string, bytes: Uint8Array): Promise<string> {
  ensureDbMigrations();
  ensureUploadRootExists();

  const uploadRoot = resolveUploadRoot();
  const relativePath = path.join("learn", `${cacheKey}.${toAudioExt(mimeType)}`);
  const fullPath = path.resolve(uploadRoot, relativePath);

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, bytes);

  return relativePath;
}

export async function readLearnAudio(cacheKey: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const cache = getLearnContentCache(cacheKey);
  if (!cache?.audioRelativePath || !cache.audioMimeType) {
    throw new Error("Learn audio not found.");
  }

  const uploadRoot = resolveUploadRoot();
  const fullPath = path.resolve(uploadRoot, cache.audioRelativePath);
  if (!fullPath.startsWith(uploadRoot)) {
    throw new Error("Invalid audio path.");
  }

  const buffer = await fsp.readFile(fullPath);
  return {
    buffer,
    mimeType: cache.audioMimeType,
  };
}
