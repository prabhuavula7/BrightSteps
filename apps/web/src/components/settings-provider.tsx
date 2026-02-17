"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Gift, Trophy } from "lucide-react";
import { db, DEFAULT_SETTINGS, getSettings, normalizeSettings, type RewardRule, type SettingsRecord } from "@/db/client-db";

type SettingsContextValue = {
  settings: SettingsRecord;
  loaded: boolean;
  updateSettings: (patch: Partial<SettingsRecord>) => Promise<void>;
  resetSettings: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

const ACCENT_THEME = {
  blue: {
    primary: "#2badee",
    primaryStrong: "#188fc9",
    primarySoft: "#e3f4fc",
    primarySoftStrong: "#cbeafa",
    onPrimary: "#ffffff",
  },
  red: {
    primary: "#ef4444",
    primaryStrong: "#dc2626",
    primarySoft: "#fee2e2",
    primarySoftStrong: "#fecaca",
    onPrimary: "#ffffff",
  },
  green: {
    primary: "#10b981",
    primaryStrong: "#059669",
    primarySoft: "#d1fae5",
    primarySoftStrong: "#a7f3d0",
    onPrimary: "#ffffff",
  },
  maroon: {
    primary: "#7f1d1d",
    primaryStrong: "#6b1515",
    primarySoft: "#fee2e2",
    primarySoftStrong: "#fecaca",
    onPrimary: "#ffffff",
  },
  purple: {
    primary: "#7c3aed",
    primaryStrong: "#6d28d9",
    primarySoft: "#ede9fe",
    primarySoftStrong: "#ddd6fe",
    onPrimary: "#ffffff",
  },
  orange: {
    primary: "#f97316",
    primaryStrong: "#ea580c",
    primarySoft: "#ffedd5",
    primarySoftStrong: "#fed7aa",
    onPrimary: "#ffffff",
  },
  black: {
    primary: "#111827",
    primaryStrong: "#020617",
    primarySoft: "#e5e7eb",
    primarySoftStrong: "#d1d5db",
    onPrimary: "#ffffff",
  },
  gold: {
    primary: "#b7791f",
    primaryStrong: "#975a16",
    primarySoft: "#fef3c7",
    primarySoftStrong: "#fde68a",
    onPrimary: "#ffffff",
  },
} as const;

function applySettingsToDocument(settings: SettingsRecord) {
  const html = document.documentElement;
  const accentTheme = ACCENT_THEME[settings.themeAccent] ?? ACCENT_THEME.blue;
  html.dataset.themeAccent = settings.themeAccent;
  html.dataset.textSize = settings.textSize;
  html.dataset.contrast = settings.contrast;
  html.dataset.reducedMotion = settings.reducedMotion ? "true" : "false";
  html.style.setProperty("--primary", accentTheme.primary);
  html.style.setProperty("--primary-strong", accentTheme.primaryStrong);
  html.style.setProperty("--primary-soft", accentTheme.primarySoft);
  html.style.setProperty("--primary-soft-strong", accentTheme.primarySoftStrong);
  html.style.setProperty("--on-primary", accentTheme.onPrimary);
}

function getCrossedReward(settings: SettingsRecord, previousCount: number, nextCount: number): RewardRule | null {
  if (nextCount <= previousCount) {
    return null;
  }

  const claimedSet = new Set(settings.claimedRewardRuleIds);
  const sortedRules = [...settings.rewardRules].sort((left, right) => left.targetCompletedPacks - right.targetCompletedPacks);

  for (const rule of sortedRules) {
    if (claimedSet.has(rule.id)) {
      continue;
    }
    if (previousCount < rule.targetCompletedPacks && nextCount >= rule.targetCompletedPacks) {
      return rule;
    }
  }

  return null;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsRecord>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [completedPackCount, setCompletedPackCount] = useState(0);
  const [activeReward, setActiveReward] = useState<RewardRule | null>(null);
  const lastCompletedPackCountRef = useRef(0);

  useEffect(() => {
    applySettingsToDocument(settings);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [current, completedCount] = await Promise.all([getSettings(), db.sessionHistory.count()]);
      if (cancelled) {
        return;
      }

      setSettings(current);
      setCompletedPackCount(completedCount);
      lastCompletedPackCountRef.current = completedCount;
      setLoaded(true);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback(async (patch: Partial<SettingsRecord>) => {
    const current = await getSettings();
    const next = normalizeSettings({ ...current, ...patch });
    setSettings(next);
    await db.settings.put(next);

    setActiveReward((previous) => {
      if (!previous) {
        return null;
      }

      const stillExists = next.rewardRules.some((rule) => rule.id === previous.id);
      const nowClaimed = next.claimedRewardRuleIds.includes(previous.id);
      if (!stillExists || nowClaimed) {
        return null;
      }
      return previous;
    });
  }, []);

  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    await db.settings.put(DEFAULT_SETTINGS);
    setActiveReward(null);
  }, []);

  const dismissActiveReward = useCallback(async () => {
    if (!activeReward) {
      return;
    }

    const current = await getSettings();
    const nextClaimedIds = Array.from(new Set([...current.claimedRewardRuleIds, activeReward.id]));
    const next = normalizeSettings({ ...current, claimedRewardRuleIds: nextClaimedIds });
    setSettings(next);
    await db.settings.put(next);
    setActiveReward(null);
  }, [activeReward]);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    const onSessionCompleted = () => {
      void (async () => {
        const [currentSettings, nextCount] = await Promise.all([getSettings(), db.sessionHistory.count()]);
        const previousCount = lastCompletedPackCountRef.current;
        lastCompletedPackCountRef.current = nextCount;
        setCompletedPackCount(nextCount);
        setSettings(currentSettings);

        if (activeReward) {
          return;
        }

        const crossedReward = getCrossedReward(currentSettings, previousCount, nextCount);
        if (crossedReward) {
          setActiveReward(crossedReward);
        }
      })();
    };

    window.addEventListener("brightsteps:session-completed", onSessionCompleted);

    return () => {
      window.removeEventListener("brightsteps:session-completed", onSessionCompleted);
    };
  }, [activeReward, loaded]);

  const value = useMemo(
    () => ({
      settings,
      loaded,
      updateSettings,
      resetSettings,
    }),
    [loaded, resetSettings, settings, updateSettings],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
      {activeReward ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <section
            aria-labelledby="reward-title"
            className="w-full max-w-xl rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100 p-6 shadow-2xl"
            role="dialog"
          >
            <p className="inline-flex items-center gap-2 rounded-full bg-amber-200/75 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">
              <Gift className="h-3.5 w-3.5" />
              Reward Unlocked
            </p>
            <h2 className="mt-3 inline-flex items-center gap-2 text-2xl font-black text-amber-900" id="reward-title">
              <Trophy className="h-7 w-7 text-amber-700" />
              {activeReward.title}
            </h2>
            <p className="mt-2 text-sm text-amber-900/85">
              Great work. You completed {completedPackCount} packs and reached your goal of{" "}
              {activeReward.targetCompletedPacks}.
            </p>
            {activeReward.description ? (
              <p className="mt-3 rounded-lg border border-amber-300 bg-white/70 px-3 py-2 text-sm text-amber-900">
                {activeReward.description}
              </p>
            ) : null}
            <button
              className="mt-5 inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700"
              onClick={() => void dismissActiveReward()}
              type="button"
            >
              Close
            </button>
          </section>
        </div>
      ) : null}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }

  return context;
}
