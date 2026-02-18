import { validatePack, type BrightStepsPack } from "@brightsteps/content-schema";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ensureDbMigrations } from "@/server/db/migrate";
import { getSqliteDb } from "@/server/db/sqlite";
import { serverEnv } from "@/server/env";

export type PicturePhrasePackSummary = {
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

export type PicturePhrasePackRecord = {
  packId: string;
  title: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

export type PicturePhraseAssetRecord = {
  assetId: string;
  packId: string;
  kind: "image" | "audio";
  relativePath: string;
  mimeType: string;
  altText?: string;
  transcript?: string;
  createdAt: string;
  updatedAt: string;
};

export function toPicturePhraseAssetUrl(assetId: string): string {
  return `/api/picturephrases/assets/${encodeURIComponent(assetId)}`;
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

function guessExtFromMime(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("avif")) return "avif";
  if (mimeType.includes("bmp")) return "bmp";
  if (mimeType.includes("tiff") || mimeType.includes("tif")) return "tiff";
  if (mimeType.includes("heic")) return "heic";
  if (mimeType.includes("heif")) return "heif";
  if (mimeType.includes("svg")) return "svg";
  return "jpg";
}

function mapPackRow(row: Record<string, unknown>): PicturePhrasePackRecord {
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

function mapAssetRow(row: Record<string, unknown>): PicturePhraseAssetRecord {
  return {
    assetId: String(row.asset_id),
    packId: String(row.pack_id),
    kind: String(row.kind) === "audio" ? "audio" : "image",
    relativePath: String(row.relative_path),
    mimeType: String(row.mime_type),
    altText: row.alt_text ? String(row.alt_text) : undefined,
    transcript: row.transcript ? String(row.transcript) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function createEmptyPicturePhrasePack(input: {
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
    moduleType: "picturephrases",
    title: input.title,
    description: input.description?.trim() || "",
    version: "1.0.0",
    language: input.language?.trim() || "en",
    ageBand: input.ageBand?.trim() || "6-10",
    topics: input.topics && input.topics.length > 0 ? input.topics : ["general"],
    settings: {
      defaultSupportLevel: 2,
      audioEnabledByDefault: false,
    },
    assets: [],
    items: [],
  };
}

export function coercePicturePhrasePack(payload: unknown, fallbackPackId: string): Record<string, unknown> {
  const base = payload && typeof payload === "object" ? { ...(payload as Record<string, unknown>) } : {};

  if (base.schemaVersion === undefined) {
    base.schemaVersion = "2.0.0";
  }

  if (base.packId === undefined || String(base.packId).trim() === "") {
    base.packId = fallbackPackId;
  }

  base.moduleType = "picturephrases";

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

  if (!Array.isArray(base.items)) {
    base.items = [];
  }

  if (base.settings === undefined || base.settings === null || typeof base.settings !== "object") {
    base.settings = {
      defaultSupportLevel: 2,
      audioEnabledByDefault: false,
    };
  }

  return base;
}

export function summarizePicturePhrasePack(record: PicturePhrasePackRecord): PicturePhrasePackSummary {
  const payloadObject = coercePicturePhrasePack(record.payload, record.packId);
  const validation = validatePack(payloadObject);

  const title = typeof payloadObject.title === "string" && payloadObject.title.trim().length > 0
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

export function listPicturePhrasePacks(): PicturePhrasePackRecord[] {
  ensureDbMigrations();
  ensureUploadRootExists();

  const db = getSqliteDb();
  const rows = db
    .prepare(`
      SELECT pack_id, title, payload_json, created_at, updated_at
      FROM picturephrase_packs
      ORDER BY updated_at DESC
    `)
    .all() as Record<string, unknown>[];

  return rows.map(mapPackRow);
}

export function getPicturePhrasePack(packId: string): PicturePhrasePackRecord | null {
  ensureDbMigrations();

  const db = getSqliteDb();
  const row = db
    .prepare(`
      SELECT pack_id, title, payload_json, created_at, updated_at
      FROM picturephrase_packs
      WHERE pack_id = ?
      LIMIT 1
    `)
    .get(packId) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  return mapPackRow(row);
}

export function upsertPicturePhrasePack(packId: string, payload: unknown): PicturePhrasePackRecord {
  ensureDbMigrations();

  const db = getSqliteDb();
  const now = new Date().toISOString();
  const normalized = coercePicturePhrasePack(payload, packId);
  const title = typeof normalized.title === "string" && normalized.title.trim() ? normalized.title.trim() : packId;

  db.prepare(`
    INSERT INTO picturephrase_packs (pack_id, title, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(pack_id) DO UPDATE SET
      title = excluded.title,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).run(packId, title, JSON.stringify(normalized), now, now);

  const next = getPicturePhrasePack(packId);
  if (!next) {
    throw new Error("Failed to save picture phrase pack.");
  }

  return next;
}

export async function deletePicturePhrasePack(packId: string): Promise<void> {
  ensureDbMigrations();

  const assets = listPicturePhraseAssets(packId);
  const db = getSqliteDb();

  db.prepare(`DELETE FROM picturephrase_packs WHERE pack_id = ?`).run(packId);

  const uploadRoot = resolveUploadRoot();

  for (const asset of assets) {
    const fullPath = path.resolve(uploadRoot, asset.relativePath);
    if (fullPath.startsWith(uploadRoot)) {
      try {
        await fsp.unlink(fullPath);
      } catch {
        // Ignore file delete errors for stale records.
      }
    }
  }

  const packDir = path.join(uploadRoot, "picturephrases", packId);
  await fsp.rm(packDir, { recursive: true, force: true });
}

export async function createPicturePhraseImageAsset(params: {
  packId: string;
  fileBuffer: Buffer;
  mimeType: string;
  altText?: string;
}): Promise<PicturePhraseAssetRecord> {
  ensureDbMigrations();
  ensureUploadRootExists();

  const db = getSqliteDb();
  const now = new Date().toISOString();
  const assetId = `pp_asset_${randomUUID().replaceAll("-", "")}`;

  const ext = guessExtFromMime(params.mimeType);
  const relativePath = path.join("picturephrases", params.packId, `${assetId}.${ext}`);
  const uploadRoot = resolveUploadRoot();
  const fullPath = path.resolve(uploadRoot, relativePath);

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, params.fileBuffer);

  db.prepare(`
    INSERT INTO picturephrase_assets (
      asset_id,
      pack_id,
      kind,
      relative_path,
      mime_type,
      alt_text,
      transcript,
      created_at,
      updated_at
    ) VALUES (?, ?, 'image', ?, ?, ?, NULL, ?, ?)
  `).run(assetId, params.packId, relativePath, params.mimeType, params.altText ?? null, now, now);

  const row = db
    .prepare(`
      SELECT asset_id, pack_id, kind, relative_path, mime_type, alt_text, transcript, created_at, updated_at
      FROM picturephrase_assets
      WHERE asset_id = ?
      LIMIT 1
    `)
    .get(assetId) as Record<string, unknown> | undefined;

  if (!row) {
    throw new Error("Failed to store image asset.");
  }

  return mapAssetRow(row);
}

export function listPicturePhraseAssets(packId: string): PicturePhraseAssetRecord[] {
  ensureDbMigrations();

  const db = getSqliteDb();
  const rows = db
    .prepare(`
      SELECT asset_id, pack_id, kind, relative_path, mime_type, alt_text, transcript, created_at, updated_at
      FROM picturephrase_assets
      WHERE pack_id = ?
      ORDER BY created_at ASC
    `)
    .all(packId) as Record<string, unknown>[];

  return rows.map(mapAssetRow);
}

export function getPicturePhraseAsset(assetId: string): PicturePhraseAssetRecord | null {
  ensureDbMigrations();

  const db = getSqliteDb();
  const row = db
    .prepare(`
      SELECT asset_id, pack_id, kind, relative_path, mime_type, alt_text, transcript, created_at, updated_at
      FROM picturephrase_assets
      WHERE asset_id = ?
      LIMIT 1
    `)
    .get(assetId) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  return mapAssetRow(row);
}

export async function deletePicturePhraseAsset(assetId: string): Promise<void> {
  ensureDbMigrations();

  const asset = getPicturePhraseAsset(assetId);
  if (!asset) {
    return;
  }

  const db = getSqliteDb();
  db.prepare(`DELETE FROM picturephrase_assets WHERE asset_id = ?`).run(assetId);

  const uploadRoot = resolveUploadRoot();
  const fullPath = path.resolve(uploadRoot, asset.relativePath);
  if (fullPath.startsWith(uploadRoot)) {
    try {
      await fsp.unlink(fullPath);
    } catch {
      // Ignore missing file cases.
    }
  }
}

export async function readPicturePhraseAssetBuffer(assetId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
}> {
  const asset = getPicturePhraseAsset(assetId);
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

export function logPicturePhraseGeneration(params: {
  packId: string;
  itemId: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: "success" | "failure";
  outputJson?: unknown;
  errorMessage?: string;
}): void {
  ensureDbMigrations();

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO picturephrase_generation_history (
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
    params.packId,
    params.itemId,
    params.provider,
    params.model,
    params.promptVersion,
    params.outputJson ? JSON.stringify(params.outputJson) : null,
    params.status,
    params.errorMessage ?? null,
    new Date().toISOString(),
  );
}

export function toValidatedPicturePhrasePack(payload: unknown): BrightStepsPack | null {
  const normalized = coercePicturePhrasePack(payload, "picturephrases");
  const validation = validatePack(normalized);

  if (!validation.success) {
    return null;
  }

  return validation.data;
}
