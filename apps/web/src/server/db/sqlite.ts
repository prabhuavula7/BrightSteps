import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { serverEnv } from "@/server/env";

const DATABASE_INSTANCE_KEY = "__brightsteps_sqlite__";

type GlobalWithDb = typeof globalThis & {
  [DATABASE_INSTANCE_KEY]?: DatabaseSync;
};

function resolveDbPath(): string {
  if (path.isAbsolute(serverEnv.sqlitePath)) {
    return serverEnv.sqlitePath;
  }

  return path.resolve(process.cwd(), serverEnv.sqlitePath);
}

function createDb(): DatabaseSync {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA synchronous = NORMAL;");

  return db;
}

export function getSqliteDb(): DatabaseSync {
  const globalWithDb = globalThis as GlobalWithDb;

  if (!globalWithDb[DATABASE_INSTANCE_KEY]) {
    globalWithDb[DATABASE_INSTANCE_KEY] = createDb();
  }

  return globalWithDb[DATABASE_INSTANCE_KEY] as DatabaseSync;
}
