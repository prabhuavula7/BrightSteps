"use client";

import { DEFAULT_SETTINGS, db, getSettings, type SettingsRecord } from "@/db/client-db";
import { useEffect, useMemo, useState } from "react";

type Summary = {
  totalSessions: number;
  totalItems: number;
  totalCorrect: number;
  totalHints: number;
};

export function ProgressSettingsPanel() {
  const [settings, setSettings] = useState<SettingsRecord>(DEFAULT_SETTINGS);
  const [summary, setSummary] = useState<Summary>({
    totalSessions: 0,
    totalItems: 0,
    totalCorrect: 0,
    totalHints: 0,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [currentSettings, history] = await Promise.all([
        getSettings(),
        db.sessionHistory.orderBy("completedAt").reverse().toArray(),
      ]);

      if (cancelled) {
        return;
      }

      setSettings(currentSettings);
      setSummary({
        totalSessions: history.length,
        totalItems: history.reduce((sum, item) => sum + item.totalItems, 0),
        totalCorrect: history.reduce((sum, item) => sum + item.correctItems, 0),
        totalHints: history.reduce((sum, item) => sum + item.hintCount, 0),
      });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const accuracy = useMemo(() => {
    if (summary.totalItems === 0) {
      return 0;
    }
    return Math.round((summary.totalCorrect / summary.totalItems) * 100);
  }, [summary.totalCorrect, summary.totalItems]);

  async function updateSettings(patch: Partial<SettingsRecord>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    await db.settings.put(next);
  }

  async function resetAll() {
    await db.delete();
    await db.open();
    setSettings(DEFAULT_SETTINGS);
    setSummary({ totalSessions: 0, totalItems: 0, totalCorrect: 0, totalHints: 0 });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="card p-6">
        <h2 className="text-xl font-bold text-slate-900">Progress Pulse</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">Sessions</dt>
            <dd className="text-xl font-bold text-slate-900">{summary.totalSessions}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">Accuracy</dt>
            <dd className="text-xl font-bold text-slate-900">{accuracy}%</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">Items Practiced</dt>
            <dd className="text-xl font-bold text-slate-900">{summary.totalItems}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">Hints Used</dt>
            <dd className="text-xl font-bold text-slate-900">{summary.totalHints}</dd>
          </div>
        </dl>
      </section>

      <section className="card p-6">
        <h2 className="text-xl font-bold text-slate-900">CalmControls</h2>

        <div className="mt-4 space-y-4 text-sm">
          <label className="flex items-center justify-between">
            <span>Reduced motion</span>
            <input
              checked={settings.reducedMotion}
              onChange={(event) => void updateSettings({ reducedMotion: event.target.checked })}
              type="checkbox"
            />
          </label>
          <label className="flex items-center justify-between">
            <span>Audio enabled</span>
            <input
              checked={settings.audioEnabled}
              onChange={(event) => void updateSettings({ audioEnabled: event.target.checked })}
              type="checkbox"
            />
          </label>
          <label className="flex items-center justify-between">
            <span>Text size</span>
            <select
              className="rounded border border-slate-300 px-2 py-1"
              onChange={(event) =>
                void updateSettings({ textSize: event.target.value as SettingsRecord["textSize"] })
              }
              value={settings.textSize}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </label>
          <label className="flex items-center justify-between">
            <span>Contrast</span>
            <select
              className="rounded border border-slate-300 px-2 py-1"
              onChange={(event) =>
                void updateSettings({ contrast: event.target.value as SettingsRecord["contrast"] })
              }
              value={settings.contrast}
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        <button
          className="mt-6 rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700"
          onClick={() => void resetAll()}
          type="button"
        >
          Reset all data
        </button>
      </section>
    </div>
  );
}
