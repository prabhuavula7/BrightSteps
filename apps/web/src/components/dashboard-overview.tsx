"use client";

import { db } from "@/db/client-db";
import { fetchPackSummaries } from "@/lib/api";
import { BookOpenCheck, Brain, Goal, NotebookPen, Package, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Stats = {
  builtInPackCount: number;
  customPackCount: number;
  sessionsTotal: number;
  sessionsToday: number;
  accuracy: number;
};

export function DashboardOverview() {
  const [stats, setStats] = useState<Stats>({
    builtInPackCount: 0,
    customPackCount: 0,
    sessionsTotal: 0,
    sessionsToday: 0,
    accuracy: 0,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [builtInPacks, customPacks, sessions] = await Promise.all([
        fetchPackSummaries(),
        db.customPacks.toArray(),
        db.sessionHistory.toArray(),
      ]);

      const todayPrefix = new Date().toISOString().slice(0, 10);
      const sessionsToday = sessions.filter((entry) => entry.completedAt.startsWith(todayPrefix)).length;
      const totalItems = sessions.reduce((sum, entry) => sum + entry.totalItems, 0);
      const totalCorrect = sessions.reduce((sum, entry) => sum + entry.correctItems, 0);

      if (cancelled) {
        return;
      }

      setStats({
        builtInPackCount: builtInPacks.filter((pack) => pack.valid).length,
        customPackCount: customPacks.length,
        sessionsTotal: sessions.length,
        sessionsToday,
        accuracy: totalItems === 0 ? 0 : Math.round((totalCorrect / totalItems) * 100),
      });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const goalProgress = useMemo(() => Math.min(100, Math.round((stats.sessionsToday / 2) * 100)), [stats.sessionsToday]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="card p-5">
          <p className="inline-flex items-center gap-1 text-sm text-slate-500">
            <Package className="h-4 w-4" />
            Built-in packs
          </p>
          <p className="mt-1 text-3xl font-black text-slate-900">{stats.builtInPackCount}</p>
        </div>
        <div className="card p-5">
          <p className="inline-flex items-center gap-1 text-sm text-slate-500">
            <NotebookPen className="h-4 w-4" />
            Custom packs
          </p>
          <p className="mt-1 text-3xl font-black text-slate-900">{stats.customPackCount}</p>
        </div>
        <div className="card p-5">
          <p className="inline-flex items-center gap-1 text-sm text-slate-500">
            <BookOpenCheck className="h-4 w-4" />
            Sessions completed
          </p>
          <p className="mt-1 text-3xl font-black text-slate-900">{stats.sessionsTotal}</p>
        </div>
        <div className="card p-5">
          <p className="inline-flex items-center gap-1 text-sm text-slate-500">
            <Star className="h-4 w-4" />
            Average accuracy
          </p>
          <p className="mt-1 text-3xl font-black text-slate-900">{stats.accuracy}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-800">
            <Goal className="h-5 w-5 text-[#2badee]" />
            Daily Goal
          </h2>
          <p className="mt-1 text-sm text-slate-600">Target: 2 calm sessions per day.</p>
          <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#2badee]" style={{ width: `${goalProgress}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-700">
            {stats.sessionsToday} session(s) today ({goalProgress}% of daily goal)
          </p>
        </section>

        <section className="card p-5">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-800">
            <Brain className="h-5 w-5 text-[#2badee]" />
            Progress Notes
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
            <li>FactCards and PicturePhrases are isolated by module type.</li>
            <li>Runtime remains local-first with no cloud dependency.</li>
            <li>Use Settings to open FactCards Manager and create or edit packs in full-page editors.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
