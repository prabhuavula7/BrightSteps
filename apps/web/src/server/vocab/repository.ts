import { validatePack, type VocabWordItem } from "@brightsteps/content-schema";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ensureDbMigrations } from "@/server/db/migrate";
import { getSqliteDb } from "@/server/db/sqlite";
import { serverEnv } from "@/server/env";

export type VocabPackSummary = {
  packId: string;
  title: string;
  description?: string;
  topics: string[];
  itemCount: number;
  thumbnailUrl?: string;
  thumbnailAlt?: string;
  valid: boolean;
  issues?: string[];
  updatedAt: string;
};

export type VocabPackRecord = {
  packId: string;
  title: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

export type VocabAssetRecord = {
  assetId: string;
  packId: string;
  kind: "audio";
  relativePath: string;
  mimeType: string;
  transcript?: string;
  createdAt: string;
  updatedAt: string;
};

export function toVocabAssetUrl(assetId: string): string {
  return `/api/vocab/assets/${encodeURIComponent(assetId)}`;
}

function resolveUploadRoot(): string {
  if (path.isAbsolute(serverEnv.uploadDir)) {
    return serverEnv.uploadDir;
  }

  return path.resolve(process.cwd(), serverEnv.uploadDir);
}

function ensureUploadRootExists() {
  fs.mkdirSync(resolveUploadRoot(), { recursive: true });
}

function guessAudioExtFromMime(mimeType: string): string {
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("m4a") || mimeType.includes("mp4")) return "m4a";
  return "mp3";
}

function mapPackRow(row: Record<string, unknown>): VocabPackRecord {
  let payload: unknown = null;

  try {
    payload = JSON.parse(String(row.payload_json));
  } catch {
    payload = null;
  }

  return {
    packId: String(row.pack_id),
    title: String(row.title),
    payload,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAssetRow(row: Record<string, unknown>): VocabAssetRecord {
  return {
    assetId: String(row.asset_id),
    packId: String(row.pack_id),
    kind: "audio",
    relativePath: String(row.relative_path),
    mimeType: String(row.mime_type),
    transcript: row.transcript ? String(row.transcript) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toWordId(index: number): string {
  return `vw_${String(index + 1).padStart(3, "0")}`;
}

function normalizeWord(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function coerceVocabItems(rawItems: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const items: Array<Record<string, unknown>> = [];

  rawItems.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return;
    }

    const item = { ...(entry as Record<string, unknown>) };
    item.id = typeof item.id === "string" && item.id.trim().length > 0 ? item.id : toWordId(index);
    item.type = "vocabword";
    item.topic = typeof item.topic === "string" && item.topic.trim().length > 0 ? item.topic.trim() : "general";
    item.word = normalizeWord(String(item.word ?? ""));

    if (!Array.isArray(item.syllables)) {
      item.syllables = [];
    }

    if (!Array.isArray(item.hints)) {
      item.hints = [];
    }

    if (!item.review || typeof item.review !== "object") {
      item.review = {
        sentencePrompt: "",
        acceptedPronunciations: item.word ? [String(item.word).toLowerCase()] : [],
      };
    }

    if (!item.media || typeof item.media !== "object") {
      item.media = {
        pronunciationAudioRef: "",
      };
    }

    items.push(item);
  });

  return items;
}

export function createEmptyVocabPack(input: {
  packId: string;
  title: string;
  description?: string;
  language?: string;
  ageBand?: string;
  topics?: string[];
}): Record<string, unknown> {
  return {
    schemaVersion: "2.0.0",
    packId: input.packId,
    moduleType: "vocabvoice",
    title: input.title,
    description: input.description?.trim() || "",
    version: "1.0.0",
    language: input.language?.trim() || "en",
    ageBand: input.ageBand?.trim() || "6-10",
    topics: input.topics && input.topics.length > 0 ? input.topics : ["general"],
    settings: {
      defaultSupportLevel: 2,
      audioEnabledByDefault: true,
    },
    assets: [],
    items: [],
  };
}

export function coerceVocabPack(payload: unknown, fallbackPackId: string): Record<string, unknown> {
  const base = payload && typeof payload === "object" ? { ...(payload as Record<string, unknown>) } : {};

  if (base.schemaVersion === undefined) {
    base.schemaVersion = "2.0.0";
  }

  if (base.packId === undefined || String(base.packId).trim() === "") {
    base.packId = fallbackPackId;
  }

  base.moduleType = "vocabvoice";

  if (base.title === undefined || String(base.title).trim() === "") {
    base.title = fallbackPackId;
  }

  if (base.version === undefined || String(base.version).trim() === "") {
    base.version = "1.0.0";
  }

  if (base.language === undefined || String(base.language).trim() === "") {
    base.language = "en";
  }

  if (base.ageBand === undefined || String(base.ageBand).trim() === "") {
    base.ageBand = "6-10";
  }

  if (!Array.isArray(base.topics) || base.topics.length === 0) {
    base.topics = ["general"];
  }

  if (!Array.isArray(base.assets)) {
    base.assets = [];
  }

  base.items = coerceVocabItems(base.items);

  if (base.settings === undefined || base.settings === null || typeof base.settings !== "object") {
    base.settings = {
      defaultSupportLevel: 2,
      audioEnabledByDefault: true,
    };
  }

  return base;
}

export function summarizeVocabPack(record: VocabPackRecord): VocabPackSummary {
  const payloadObject = coerceVocabPack(record.payload, record.packId);
  const validation = validatePack(payloadObject);

  const title =
    typeof payloadObject.title === "string" && payloadObject.title.trim().length > 0
      ? payloadObject.title
      : record.title;
  const description = typeof payloadObject.description === "string" ? payloadObject.description : undefined;
  const topics = Array.isArray(payloadObject.topics)
    ? payloadObject.topics.map((topic) => String(topic)).filter(Boolean)
    : [];
  const rawItems = Array.isArray(payloadObject.items) ? payloadObject.items : [];
  const settings =
    payloadObject.settings && typeof payloadObject.settings === "object"
      ? (payloadObject.settings as Record<string, unknown>)
      : null;
  const thumbnailRef =
    settings && typeof settings.packThumbnailImageRef === "string" ? settings.packThumbnailImageRef : "";
  const assets = Array.isArray(payloadObject.assets) ? payloadObject.assets : [];
  const thumbnailAsset = assets.find((asset) => {
    if (!asset || typeof asset !== "object") {
      return false;
    }
    const record = asset as Record<string, unknown>;
    return record.id === thumbnailRef && record.kind === "image";
  }) as Record<string, unknown> | undefined;
  const thumbnailUrl = thumbnailAsset && typeof thumbnailAsset.path === "string" ? thumbnailAsset.path : undefined;
  const thumbnailAlt = thumbnailAsset && typeof thumbnailAsset.alt === "string" ? thumbnailAsset.alt : undefined;

  return {
    packId: record.packId,
    title,
    description,
    topics,
    itemCount: rawItems.length,
    thumbnailUrl,
    thumbnailAlt,
    valid: validation.success,
    issues: validation.success ? undefined : validation.issues.map((issue) => `${issue.path}: ${issue.message}`),
    updatedAt: record.updatedAt,
  };
}

export function listVocabPacks(): VocabPackRecord[] {
  ensureDbMigrations();
  ensureUploadRootExists();

  const db = getSqliteDb();
  const rows = db
    .prepare(`
      SELECT pack_id, title, payload_json, created_at, updated_at
      FROM vocab_packs
      ORDER BY updated_at DESC
    `)
    .all() as Record<string, unknown>[];

  return rows.map(mapPackRow);
}

export function getVocabPack(packId: string): VocabPackRecord | null {
  ensureDbMigrations();

  const db = getSqliteDb();
  const row = db
    .prepare(`
      SELECT pack_id, title, payload_json, created_at, updated_at
      FROM vocab_packs
      WHERE pack_id = ?
      LIMIT 1
    `)
    .get(packId) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  return mapPackRow(row);
}

export function upsertVocabPack(packId: string, payload: unknown): VocabPackRecord {
  ensureDbMigrations();

  const db = getSqliteDb();
  const now = new Date().toISOString();
  const normalized = coerceVocabPack(payload, packId);
  const title = typeof normalized.title === "string" && normalized.title.trim() ? normalized.title.trim() : packId;

  db.prepare(`
    INSERT INTO vocab_packs (pack_id, title, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(pack_id) DO UPDATE SET
      title = excluded.title,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).run(packId, title, JSON.stringify(normalized), now, now);

  const next = getVocabPack(packId);
  if (!next) {
    throw new Error("Failed to save vocab pack.");
  }

  return next;
}

export async function deleteVocabPack(packId: string): Promise<void> {
  ensureDbMigrations();

  const assets = listVocabAssets(packId);
  const db = getSqliteDb();
  db.prepare(`DELETE FROM vocab_packs WHERE pack_id = ?`).run(packId);

  const uploadRoot = resolveUploadRoot();
  for (const asset of assets) {
    const fullPath = path.resolve(uploadRoot, asset.relativePath);
    if (!fullPath.startsWith(uploadRoot)) {
      continue;
    }

    try {
      await fsp.unlink(fullPath);
    } catch {
      // Ignore stale paths.
    }
  }

  const packDir = path.join(uploadRoot, "vocabvoice", packId);
  await fsp.rm(packDir, { recursive: true, force: true });
}

export async function createVocabAudioAsset(params: {
  packId: string;
  mimeType: string;
  transcript?: string;
  bytes: Uint8Array;
}): Promise<VocabAssetRecord> {
  ensureDbMigrations();
  ensureUploadRootExists();

  const db = getSqliteDb();
  const now = new Date().toISOString();
  const assetId = `vv_asset_${randomUUID().replaceAll("-", "")}`;
  const ext = guessAudioExtFromMime(params.mimeType);
  const relativePath = path.join("vocabvoice", params.packId, `${assetId}.${ext}`);

  const uploadRoot = resolveUploadRoot();
  const fullPath = path.resolve(uploadRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, params.bytes);

  db.prepare(`
    INSERT INTO vocab_assets (
      asset_id,
      pack_id,
      kind,
      relative_path,
      mime_type,
      transcript,
      created_at,
      updated_at
    ) VALUES (?, ?, 'audio', ?, ?, ?, ?, ?)
  `).run(assetId, params.packId, relativePath, params.mimeType, params.transcript ?? null, now, now);

  const row = db
    .prepare(`
      SELECT asset_id, pack_id, kind, relative_path, mime_type, transcript, created_at, updated_at
      FROM vocab_assets
      WHERE asset_id = ?
      LIMIT 1
    `)
    .get(assetId) as Record<string, unknown> | undefined;

  if (!row) {
    throw new Error("Failed to save vocab audio asset.");
  }

  return mapAssetRow(row);
}

export function listVocabAssets(packId: string): VocabAssetRecord[] {
  ensureDbMigrations();

  const db = getSqliteDb();
  const rows = db
    .prepare(`
      SELECT asset_id, pack_id, kind, relative_path, mime_type, transcript, created_at, updated_at
      FROM vocab_assets
      WHERE pack_id = ?
      ORDER BY created_at ASC
    `)
    .all(packId) as Record<string, unknown>[];

  return rows.map(mapAssetRow);
}

export function getVocabAsset(assetId: string): VocabAssetRecord | null {
  ensureDbMigrations();

  const db = getSqliteDb();
  const row = db
    .prepare(`
      SELECT asset_id, pack_id, kind, relative_path, mime_type, transcript, created_at, updated_at
      FROM vocab_assets
      WHERE asset_id = ?
      LIMIT 1
    `)
    .get(assetId) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  return mapAssetRow(row);
}

export async function deleteVocabAsset(assetId: string): Promise<void> {
  ensureDbMigrations();

  const asset = getVocabAsset(assetId);
  if (!asset) {
    return;
  }

  const db = getSqliteDb();
  db.prepare(`DELETE FROM vocab_assets WHERE asset_id = ?`).run(assetId);

  const uploadRoot = resolveUploadRoot();
  const fullPath = path.resolve(uploadRoot, asset.relativePath);
  if (!fullPath.startsWith(uploadRoot)) {
    return;
  }

  try {
    await fsp.unlink(fullPath);
  } catch {
    // Ignore stale paths.
  }
}

export async function readVocabAssetBuffer(assetId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const asset = getVocabAsset(assetId);
  if (!asset) {
    throw new Error("Asset not found.");
  }

  const uploadRoot = resolveUploadRoot();
  const fullPath = path.resolve(uploadRoot, asset.relativePath);
  if (!fullPath.startsWith(uploadRoot)) {
    throw new Error("Invalid asset path.");
  }

  const buffer = await fsp.readFile(fullPath);
  return {
    buffer,
    mimeType: asset.mimeType,
  };
}

export function logVocabGeneration(input: {
  packId: string;
  itemId: string;
  provider: "openai" | "gemini";
  model: string;
  promptVersion: string;
  status: "success" | "error";
  output?: unknown;
  errorMessage?: string;
}): void {
  ensureDbMigrations();

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO vocab_generation_history (
      pack_id,
      item_id,
      provider,
      model,
      prompt_version,
      output_json,
      status,
      error_message,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.packId,
    input.itemId,
    input.provider,
    input.model,
    input.promptVersion,
    input.output ? JSON.stringify(input.output) : null,
    input.status,
    input.errorMessage ?? null,
    new Date().toISOString(),
  );
}

export function logVocabPronunciationAttempt(input: {
  packId: string;
  itemId: string;
  expectedWord: string;
  transcript?: string;
  score: number;
  isCorrect: boolean;
  mode: "learn" | "review";
}): void {
  ensureDbMigrations();

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO vocab_pronunciation_attempts (
      pack_id,
      item_id,
      expected_word,
      transcript,
      score,
      is_correct,
      mode,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.packId,
    input.itemId,
    input.expectedWord,
    input.transcript ?? null,
    input.score,
    input.isCorrect ? 1 : 0,
    input.mode,
    new Date().toISOString(),
  );
}

export function parseVocabItemsFromPayload(payload: unknown): VocabWordItem[] {
  const normalized = coerceVocabPack(payload, "vocab-pack");
  const items = Array.isArray(normalized.items) ? normalized.items : [];

  return items
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => entry as VocabWordItem);
}
