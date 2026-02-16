"use client";

import { DEFAULT_SETTINGS, db, getSettings, type SettingsRecord } from "@/db/client-db";
import { BookText, Image as ImageIcon, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function SettingsHome() {
  const [settings, setSettings] = useState<SettingsRecord>(DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const current = await getSettings();
      if (!cancelled) {
        setSettings(current);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateSettings(patch: Partial<SettingsRecord>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    await db.settings.put(next);
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <section className="card p-5 xl:col-span-1">
        <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-900">
          <SlidersHorizontal className="h-5 w-5 text-[#2badee]" />
          CalmControls
        </h2>
        <div className="mt-4 space-y-3 text-sm">
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
      </section>

      <section className="card p-5 xl:col-span-1">
        <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-900">
          <BookText className="h-5 w-5 text-[#2badee]" />
          FactCards Packs
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          View packs, edit existing packs, or create a new pack with UI or JSON upload.
        </p>
        <Link
          className="mt-4 inline-flex rounded-lg bg-[#2badee] px-4 py-2 text-sm font-bold text-white"
          href="/settings/factcards"
        >
          Open FactCards Manager
        </Link>
      </section>

      <section className="card p-5 xl:col-span-1">
        <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-900">
          <ImageIcon className="h-5 w-5 text-[#2badee]" />
          PicturePhrases Packs
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Dedicated management flow is available as a separate page. We can extend editor tooling next.
        </p>
        <Link
          className="mt-4 inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          href="/settings/picturephrases"
        >
          Open PicturePhrases Page
        </Link>
      </section>
    </div>
  );
}
