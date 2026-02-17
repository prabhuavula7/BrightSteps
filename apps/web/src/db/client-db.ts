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
  themeAccent: "blue" | "red" | "green" | "maroon" | "purple" | "orange" | "black" | "gold";
  dailySessionGoal: number;
  weeklySessionGoal: number;
  weeklyAccuracyGoal: number;
  rewardRules: RewardRule[];
  claimedRewardRuleIds: string[];
};

export type RewardRule = {
  id: string;
  title: string;
  targetCompletedPacks: number;
  description?: string;
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

function normalizeRewardRuleId(value: string, index: number): string {
  const trimmed = value.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return `reward_${index + 1}`;
}

export function normalizeRewardRules(input: unknown): RewardRule[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: RewardRule[] = [];

  for (const [index, entry] of input.entries()) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const id = normalizeRewardRuleId(String((entry as RewardRule).id ?? ""), index);
    if (seen.has(id)) {
      continue;
    }

    const title = String((entry as RewardRule).title ?? "").trim();
    if (title.length === 0) {
      continue;
    }

    const targetRaw = Number((entry as RewardRule).targetCompletedPacks);
    const targetCompletedPacks = Number.isFinite(targetRaw) ? Math.round(targetRaw) : 0;
    if (targetCompletedPacks < 1) {
      continue;
    }

    const descriptionText = String((entry as RewardRule).description ?? "").trim();

    normalized.push({
      id,
      title,
      targetCompletedPacks: Math.min(1000, targetCompletedPacks),
      description: descriptionText.length > 0 ? descriptionText : undefined,
    });

    seen.add(id);
  }

  return normalized;
}

function normalizeClaimedRewardRuleIds(input: unknown, rewardRules: RewardRule[]): string[] {
  if (!Array.isArray(input) || rewardRules.length === 0) {
    return [];
  }

  const validIds = new Set(rewardRules.map((rule) => rule.id));
  const unique: string[] = [];

  for (const value of input) {
    const id = String(value ?? "").trim();
    if (!validIds.has(id) || unique.includes(id)) {
      continue;
    }
    unique.push(id);
  }

  return unique;
}

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
    this.version(3)
      .stores({
        settings: "id",
        itemStates: "id, packId, itemId, moduleType, dueAt",
        sessionHistory: "++id, moduleType, packId, completedAt",
        customPacks: "id, moduleType, updatedAt",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("settings")
          .toCollection()
          .modify((entry: SettingsRecord) => {
            entry.themeAccent = entry.themeAccent ?? "blue";
            entry.dailySessionGoal = Number.isFinite(entry.dailySessionGoal) ? entry.dailySessionGoal : 2;
            entry.weeklySessionGoal = Number.isFinite(entry.weeklySessionGoal) ? entry.weeklySessionGoal : 10;
            entry.weeklyAccuracyGoal = Number.isFinite(entry.weeklyAccuracyGoal) ? entry.weeklyAccuracyGoal : 80;
          });
      });
    this.version(4)
      .stores({
        settings: "id",
        itemStates: "id, packId, itemId, moduleType, dueAt",
        sessionHistory: "++id, moduleType, packId, completedAt",
        customPacks: "id, moduleType, updatedAt",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("settings")
          .toCollection()
          .modify((entry: SettingsRecord) => {
            entry.rewardRules = normalizeRewardRules(entry.rewardRules);
            entry.claimedRewardRuleIds = normalizeClaimedRewardRuleIds(entry.claimedRewardRuleIds, entry.rewardRules);
          });
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
  themeAccent: "blue",
  dailySessionGoal: 2,
  weeklySessionGoal: 10,
  weeklyAccuracyGoal: 80,
  rewardRules: [],
  claimedRewardRuleIds: [],
};

export function normalizeSettings(input: Partial<SettingsRecord>): SettingsRecord {
  const rewardRules = normalizeRewardRules(input.rewardRules);

  return {
    id: "default",
    reducedMotion: Boolean(input.reducedMotion ?? DEFAULT_SETTINGS.reducedMotion),
    audioEnabled: Boolean(input.audioEnabled ?? DEFAULT_SETTINGS.audioEnabled),
    textSize:
      input.textSize === "small" || input.textSize === "large" || input.textSize === "medium"
        ? input.textSize
        : DEFAULT_SETTINGS.textSize,
    contrast: input.contrast === "high" ? "high" : "normal",
    inputPreference:
      input.inputPreference === "drag" || input.inputPreference === "type" || input.inputPreference === "tap"
        ? input.inputPreference
        : DEFAULT_SETTINGS.inputPreference,
    themeAccent:
      input.themeAccent === "red" ||
      input.themeAccent === "green" ||
      input.themeAccent === "maroon" ||
      input.themeAccent === "purple" ||
      input.themeAccent === "orange" ||
      input.themeAccent === "black" ||
      input.themeAccent === "gold" ||
      input.themeAccent === "blue"
        ? input.themeAccent
        : DEFAULT_SETTINGS.themeAccent,
    dailySessionGoal: Math.max(1, Math.min(20, Math.round(input.dailySessionGoal ?? DEFAULT_SETTINGS.dailySessionGoal))),
    weeklySessionGoal: Math.max(1, Math.min(100, Math.round(input.weeklySessionGoal ?? DEFAULT_SETTINGS.weeklySessionGoal))),
    weeklyAccuracyGoal: Math.max(
      40,
      Math.min(100, Math.round(input.weeklyAccuracyGoal ?? DEFAULT_SETTINGS.weeklyAccuracyGoal)),
    ),
    rewardRules,
    claimedRewardRuleIds: normalizeClaimedRewardRuleIds(input.claimedRewardRuleIds, rewardRules),
  };
}

export async function getSettings(): Promise<SettingsRecord> {
  const current = await db.settings.get("default");
  if (current) {
    const normalized = normalizeSettings(current);
    if (JSON.stringify(current) !== JSON.stringify(normalized)) {
      await db.settings.put(normalized);
    }
    return normalized;
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
