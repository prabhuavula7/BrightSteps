import { getSqliteDb } from "@/server/db/sqlite";

let migrated = false;

export function ensureDbMigrations(): void {
  if (migrated) {
    return;
  }

  const db = getSqliteDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS picturephrase_packs (
      pack_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      module_type TEXT NOT NULL DEFAULT 'picturephrases',
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS picturephrase_assets (
      asset_id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      alt_text TEXT,
      transcript TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (pack_id) REFERENCES picturephrase_packs(pack_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_picturephrase_assets_pack_id
      ON picturephrase_assets (pack_id);

    CREATE TABLE IF NOT EXISTS picturephrase_generation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pack_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      output_json TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_picturephrase_generation_pack_item
      ON picturephrase_generation_history (pack_id, item_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS learn_content_cache (
      cache_key TEXT PRIMARY KEY,
      module_type TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      content_json TEXT NOT NULL,
      audio_relative_path TEXT,
      audio_mime_type TEXT,
      flagged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_learn_content_pack_item
      ON learn_content_cache (module_type, pack_id, item_id, updated_at DESC);
  `);

  migrated = true;
}
