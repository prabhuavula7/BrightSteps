"use client";

import type { BrightStepsPack } from "@brightsteps/content-schema";
import Dexie, { type EntityTable } from "dexie";

export type SettingsRecord = {
  id: string;
  reducedMotion: boolean;
  audioEnabled: boolean;
  textSize: "small" | "medium" | "large";
  contrast: "normal" | "high";
  inputPreference: "tap" | "drag" | "type";
};

export type ItemStateRecord = ReviewState & {
  id: string;
  packId: string;
  moduleType: ModuleType;
};

export type SessionHistoryRecord = {
  id?: number;
  packId: string;
  moduleType: ModuleType;
  startedAt: string;
  completedAt: string;
  durationMinutes: number;
  totalItems: number;
  correctItems: number;
  hintCount: number;
};

export type CustomPackRecord = {
  id: string;
  moduleType: ModuleType;
  title: string;
  payload: BrightStepsPack;
  createdAt: string;
  updatedAt: string;
};

export type ModuleType = "factcards" | "picturephrases";

export type ReviewState = {
  itemId: string;
  dueAt: string;
  intervalDays: number;
  streak: number;
  supportLevel: 0 | 1 | 2 | 3;
  lastResult?: {
    correct: boolean;
    hintsUsed: number;
    reviewedAt: string;
  };
};

export class BrightStepsDB extends Dexie {
  settings!: EntityTable<SettingsRecord, "id">;
  itemStates!: EntityTable<ItemStateRecord, "id">;
  sessionHistory!: EntityTable<SessionHistoryRecord, "id">;
  customPacks!: EntityTable<CustomPackRecord, "id">;

  constructor() {
    super("brightsteps-db");
    this.version(1).stores({
      settings: "id",
      itemStates: "id, packId, itemId, moduleType, dueAt",
      sessionHistory: "++id, moduleType, packId, completedAt",
    });
    this.version(2).stores({
      settings: "id",
      itemStates: "id, packId, itemId, moduleType, dueAt",
      sessionHistory: "++id, moduleType, packId, completedAt",
      customPacks: "id, moduleType, updatedAt",
    });
  }
}

export const db = new BrightStepsDB();

export const DEFAULT_SETTINGS: SettingsRecord = {
  id: "default",
  reducedMotion: true,
  audioEnabled: false,
  textSize: "medium",
  contrast: "normal",
  inputPreference: "tap",
};

export async function getSettings(): Promise<SettingsRecord> {
  const current = await db.settings.get("default");
  if (current) {
    return current;
  }

  await db.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function saveCustomPack(pack: BrightStepsPack): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db.customPacks.get(pack.packId);

  await db.customPacks.put({
    id: pack.packId,
    moduleType: pack.moduleType,
    title: pack.title,
    payload: pack,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}
