"use client";

import { db, type RewardRule } from "@/db/client-db";
import { useSettings } from "@/components/settings-provider";
import {
  BookText,
  Gift,
  Image as ImageIcon,
  Palette,
  PlusCircle,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Target,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ThemeAccent = "blue" | "red" | "green" | "maroon" | "purple" | "orange" | "black" | "gold";

type SessionSummary = {
  sessionsThisWeek: number;
  accuracyThisWeek: number;
  completedPacks: number;
};

const THEME_OPTIONS: Array<{ id: ThemeAccent; label: string; bubble: string }> = [
  { id: "blue", label: "Blue", bubble: "#2badee" },
  { id: "red", label: "Red", bubble: "#ef4444" },
  { id: "green", label: "Green", bubble: "#10b981" },
  { id: "maroon", label: "Maroon", bubble: "#7f1d1d" },
  { id: "purple", label: "Purple", bubble: "#7c3aed" },
  { id: "orange", label: "Orange", bubble: "#f97316" },
  { id: "black", label: "Black", bubble: "#111827" },
  { id: "gold", label: "Gold", bubble: "#b7791f" },
];

function getCurrentWeekStart(): Date {
  const now = new Date();
  const weekday = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - weekday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function createRewardRule(): RewardRule {
  const suffix = Math.random().toString(36).slice(2, 7);
  return {
    id: `reward_${Date.now()}_${suffix}`,
    title: "New reward",
    targetCompletedPacks: 5,
    description: "",
  };
}

function sanitizeRewardTitle(value: string): string {
  return value.trimStart().slice(0, 80);
}

function sectionButtonClass(active: boolean): string {
  return active
    ? "bg-brand-soft text-brand"
    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900";
}

export function SettingsHome() {
  const { settings, loaded, updateSettings, resetSettings } = useSettings();
  const [activeSection, setActiveSection] = useState<"goals" | "calm" | "theme" | "rewards" | "modules" | "data">(
    "goals",
  );
  const [summary, setSummary] = useState<SessionSummary>({
    sessionsThisWeek: 0,
    accuracyThisWeek: 0,
    completedPacks: 0,
  });

  const loadSummary = useCallback(async () => {
    const weekStart = getCurrentWeekStart().getTime();
    const history = await db.sessionHistory.toArray();

    const weekEntries = history.filter((item) => {
      const completedAt = new Date(item.completedAt).getTime();
      return Number.isFinite(completedAt) && completedAt >= weekStart;
    });

    const totalItems = weekEntries.reduce((sum, item) => sum + item.totalItems, 0);
    const totalCorrect = weekEntries.reduce((sum, item) => sum + item.correctItems, 0);

    setSummary({
      sessionsThisWeek: weekEntries.length,
      accuracyThisWeek: totalItems > 0 ? Math.round((totalCorrect / totalItems) * 100) : 0,
      completedPacks: history.length,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadIfActive() {
      await loadSummary();
      if (cancelled) {
        return;
      }
    }

    void loadIfActive();

    const onSessionCompleted = () => {
      void loadSummary();
    };
    const onFocus = () => {
      void loadSummary();
    };
    window.addEventListener("brightsteps:session-completed", onSessionCompleted);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("brightsteps:session-completed", onSessionCompleted);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadSummary]);

  const weeklyGoalProgress = useMemo(() => {
    return Math.min(100, Math.round((summary.sessionsThisWeek / Math.max(settings.weeklySessionGoal, 1)) * 100));
  }, [settings.weeklySessionGoal, summary.sessionsThisWeek]);

  const sortedRewards = useMemo(
    () => [...settings.rewardRules].sort((left, right) => left.targetCompletedPacks - right.targetCompletedPacks),
    [settings.rewardRules],
  );

  async function updateRewardRule(ruleId: string, patch: Partial<RewardRule>) {
    const nextRules = settings.rewardRules.map((rule) => {
      if (rule.id !== ruleId) {
        return rule;
      }

      return {
        ...rule,
        ...patch,
        title: sanitizeRewardTitle((patch.title ?? rule.title) as string),
        targetCompletedPacks: Math.max(1, Number(patch.targetCompletedPacks ?? rule.targetCompletedPacks) || 1),
        description: String(patch.description ?? rule.description ?? "").slice(0, 220),
      };
    });

    await updateSettings({ rewardRules: nextRules });
  }

  async function addRewardRule() {
    await updateSettings({ rewardRules: [...settings.rewardRules, createRewardRule()] });
  }

  async function removeRewardRule(ruleId: string) {
    const nextRules = settings.rewardRules.filter((rule) => rule.id !== ruleId);
    const nextClaimed = settings.claimedRewardRuleIds.filter((claimedId) => claimedId !== ruleId);
    await updateSettings({ rewardRules: nextRules, claimedRewardRuleIds: nextClaimed });
  }

  async function resetThemeToDefault() {
    await updateSettings({ themeAccent: "blue" });
  }

  async function clearClaimedRewards() {
    await updateSettings({ claimedRewardRuleIds: [] });
  }

  async function resetAllLocalData() {
    const confirmed = window.confirm("Reset local app data? This deletes session history and local custom packs.");
    if (!confirmed) {
      return;
    }

    await db.delete();
    await db.open();
    await resetSettings();
    window.location.reload();
  }

  function jumpTo(section: typeof activeSection) {
    setActiveSection(section);
    const element = document.getElementById(`settings-${section}`);
    if (!element) {
      return;
    }
    element.scrollIntoView({ behavior: settings.reducedMotion ? "auto" : "smooth", block: "start" });
  }

  if (!loaded) {
    return <div className="card p-5 text-sm text-slate-600">Loading settings...</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="card h-fit p-4 xl:sticky xl:top-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Settings Sections</p>
        <nav className="space-y-1.5">
          <button className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${sectionButtonClass(activeSection === "goals")}`} onClick={() => jumpTo("goals")} type="button">Goals</button>
          <button className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${sectionButtonClass(activeSection === "calm")}`} onClick={() => jumpTo("calm")} type="button">CalmControls</button>
          <button className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${sectionButtonClass(activeSection === "theme")}`} onClick={() => jumpTo("theme")} type="button">Theme</button>
          <button className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${sectionButtonClass(activeSection === "rewards")}`} onClick={() => jumpTo("rewards")} type="button">Rewards</button>
          <button className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${sectionButtonClass(activeSection === "modules")}`} onClick={() => jumpTo("modules")} type="button">Modules</button>
          <button className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${sectionButtonClass(activeSection === "data")}`} onClick={() => jumpTo("data")} type="button">Data & Safety</button>
        </nav>
      </aside>

      <div className="space-y-6">
        <section className="card p-5" id="settings-goals">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-900">
            <Target className="h-5 w-5 text-brand" />
            Session Goals
          </h2>
          <p className="mt-1 text-sm text-slate-600">Set clear daily and weekly targets for consistent routines.</p>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold text-slate-700">Daily sessions goal</span>
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                min={1}
                onChange={(event) => void updateSettings({ dailySessionGoal: Number(event.target.value) || 1 })}
                type="number"
                value={settings.dailySessionGoal}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold text-slate-700">Weekly sessions goal</span>
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                min={1}
                onChange={(event) => void updateSettings({ weeklySessionGoal: Number(event.target.value) || 1 })}
                type="number"
                value={settings.weeklySessionGoal}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold text-slate-700">Weekly accuracy goal (%)</span>
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                max={100}
                min={40}
                onChange={(event) => void updateSettings({ weeklyAccuracyGoal: Number(event.target.value) || 40 })}
                type="number"
                value={settings.weeklyAccuracyGoal}
              />
            </label>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold">This week sessions</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{summary.sessionsThisWeek}</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-brand" style={{ width: `${weeklyGoalProgress}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">{weeklyGoalProgress}% of weekly sessions goal</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold">This week accuracy</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{summary.accuracyThisWeek}%</p>
              <p className="mt-1 text-xs text-slate-500">Goal: {settings.weeklyAccuracyGoal}%</p>
            </div>
          </div>
        </section>

        <section className="card p-5" id="settings-calm">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-900">
            <SlidersHorizontal className="h-5 w-5 text-brand" />
            CalmControls
          </h2>
          <p className="mt-1 text-sm text-slate-600">These controls now apply across the app immediately.</p>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">
              <span>Reduced motion</span>
              <input checked={settings.reducedMotion} onChange={(event) => void updateSettings({ reducedMotion: event.target.checked })} type="checkbox" />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">
              <span>Audio enabled</span>
              <input checked={settings.audioEnabled} onChange={(event) => void updateSettings({ audioEnabled: event.target.checked })} type="checkbox" />
            </label>

            <label className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="font-semibold">Text size</span>
              <select className="rounded border border-slate-300 px-2 py-1" onChange={(event) => void updateSettings({ textSize: event.target.value as "small" | "medium" | "large" })} value={settings.textSize}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="font-semibold">Contrast</span>
              <select className="rounded border border-slate-300 px-2 py-1" onChange={(event) => void updateSettings({ contrast: event.target.value as "normal" | "high" })} value={settings.contrast}>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm lg:col-span-2">
              <span className="font-semibold">PicturePhrases preferred input mode</span>
              <select className="rounded border border-slate-300 px-2 py-1" onChange={(event) => void updateSettings({ inputPreference: event.target.value as "tap" | "drag" | "type" })} value={settings.inputPreference}>
                <option value="tap">Tap</option>
                <option value="drag">Drag</option>
                <option value="type">Type</option>
              </select>
            </label>
          </div>
        </section>

        <section className="card p-5" id="settings-theme">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-900">
            <Palette className="h-5 w-5 text-brand" />
            Theme Accent
          </h2>
          <p className="mt-1 text-sm text-slate-600">Keep a white interface and choose your accent color.</p>

          <div className="mt-4 flex flex-wrap gap-3">
            {THEME_OPTIONS.map((theme) => {
              const active = settings.themeAccent === theme.id;
              return (
                <button
                  aria-label={`Switch theme to ${theme.label}`}
                  className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-sm font-semibold transition ${
                    active ? "border-brand bg-brand-soft text-brand shadow-sm" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                  key={theme.id}
                  onClick={() => void updateSettings({ themeAccent: theme.id })}
                  type="button"
                >
                  <span aria-hidden className="h-4 w-4 rounded-full border border-black/15" style={{ backgroundColor: theme.bubble }} />
                  {theme.label}
                </button>
              );
            })}
          </div>
          <button
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => void resetThemeToDefault()}
            type="button"
          >
            <RotateCcw className="h-4 w-4" />
            Reset theme to default (Blue)
          </button>
        </section>

        <section className="card p-5" id="settings-rewards">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-900">
            <Gift className="h-5 w-5 text-brand" />
            Rewards
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Add custom incentives and decide how many completed packs unlock each one.
          </p>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Completed packs so far: {summary.completedPacks}</p>
            <p className="mt-1 text-xs">
              When a threshold is reached, a gold reward modal appears and stays open until it is closed.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-bold text-on-brand hover:bg-brand-strong"
              onClick={() => void addRewardRule()}
              type="button"
            >
              <PlusCircle className="h-4 w-4" />
              Add reward
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => void clearClaimedRewards()}
              type="button"
            >
              Reset unlocked state
            </button>
          </div>

          {sortedRewards.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              No rewards added yet.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {sortedRewards.map((rule) => {
                const unlocked = summary.completedPacks >= rule.targetCompletedPacks;
                const claimed = settings.claimedRewardRuleIds.includes(rule.id);

                return (
                  <article className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={rule.id}>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_190px_auto]">
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="font-semibold text-slate-700">Reward title</span>
                        <input
                          className="rounded-lg border border-slate-300 px-3 py-2"
                          onChange={(event) => void updateRewardRule(rule.id, { title: event.target.value })}
                          placeholder="Example: Extra play time"
                          value={rule.title}
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm">
                        <span className="font-semibold text-slate-700">Packs needed</span>
                        <input
                          className="rounded-lg border border-slate-300 px-3 py-2"
                          min={1}
                          onChange={(event) =>
                            void updateRewardRule(rule.id, {
                              targetCompletedPacks: Number(event.target.value) || 1,
                            })
                          }
                          type="number"
                          value={rule.targetCompletedPacks}
                        />
                      </label>

                      <div className="flex items-end justify-end">
                        <button
                          aria-label={`Delete reward ${rule.title || "rule"}`}
                          className="inline-flex items-center justify-center rounded-lg border border-rose-300 px-3 py-2 text-rose-700 hover:bg-rose-50"
                          onClick={() => void removeRewardRule(rule.id)}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <label className="mt-3 flex flex-col gap-1 text-sm">
                      <span className="font-semibold text-slate-700">Reward details (optional)</span>
                      <input
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        onChange={(event) => void updateRewardRule(rule.id, { description: event.target.value })}
                        placeholder="Example: Choose 20 minutes of favorite activity."
                        value={rule.description ?? ""}
                      />
                    </label>
                    <p className="mt-2 text-xs text-slate-500">
                      Status: {claimed ? "Unlocked and closed" : unlocked ? "Unlocked and waiting to be claimed" : "Locked"}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="card p-5" id="settings-modules">
          <h2 className="text-lg font-bold text-slate-900">Module Managers</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="inline-flex items-center gap-2 text-base font-bold text-slate-900">
                <BookText className="h-4 w-4 text-brand" />
                FactCards Packs
              </h3>
              <p className="mt-2 text-sm text-slate-600">Create and edit packs with UI or JSON workflows.</p>
              <Link className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-bold text-on-brand hover:bg-brand-strong" href="/settings/factcards">
                Open FactCards Manager
              </Link>
            </article>

            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="inline-flex items-center gap-2 text-base font-bold text-slate-900">
                <ImageIcon className="h-4 w-4 text-brand" />
                PicturePhrases Packs
              </h3>
              <p className="mt-2 text-sm text-slate-600">Upload images, run AI once, and manage generated cards.</p>
              <Link className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-bold text-on-brand hover:bg-brand-strong" href="/settings/picturephrases">
                Open PicturePhrases Manager
              </Link>
            </article>
          </div>
        </section>

        <section className="card p-5" id="settings-data">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-900">
            <ShieldAlert className="h-5 w-5 text-brand" />
            Data and Safety
          </h2>
          <p className="mt-1 text-sm text-slate-600">Everything is local-first. Use reset only when you want a full local wipe.</p>
          <button className="mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700" onClick={() => void resetAllLocalData()} type="button">
            <Trash2 className="h-4 w-4" />
            Reset all local data
          </button>
        </section>
      </div>
    </div>
  );
}
