"use client";

import { db } from "@/db/client-db";
import { useSettings } from "@/components/settings-provider";
import {
  fetchPackSummaries,
  fetchPicturePhraseSummaries,
  fetchVocabSummaries,
} from "@/lib/api";
import {
  BookOpenCheck,
  Brain,
  Gift,
  Goal,
  Info,
  NotebookPen,
  Package,
  ShieldAlert,
  Star,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Stats = {
  builtInPackCount: number;
  customPackCount: number;
  availablePackCount: number;
  factCardsCustomPackCount: number;
  picturePhrasesCustomPackCount: number;
  vocabVoiceCustomPackCount: number;
  sessionsTotal: number;
  sessionsToday: number;
  accuracy: number;
};

function localDayKey(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DashboardOverview() {
  const { settings } = useSettings();
  const [stats, setStats] = useState<Stats>({
    builtInPackCount: 0,
    customPackCount: 0,
    availablePackCount: 0,
    factCardsCustomPackCount: 0,
    picturePhrasesCustomPackCount: 0,
    vocabVoiceCustomPackCount: 0,
    sessionsTotal: 0,
    sessionsToday: 0,
    accuracy: 0,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [builtInPacksResult, factCardsCustomPacksResult, picturePhrasePacksResult, vocabPacksResult, sessionsResult] =
        await Promise.allSettled([
          fetchPackSummaries(),
          db.customPacks.toArray(),
          fetchPicturePhraseSummaries(),
          fetchVocabSummaries(),
          db.sessionHistory.toArray(),
        ]);

      const builtInPacks = builtInPacksResult.status === "fulfilled" ? builtInPacksResult.value : [];
      const factCardsCustomPacks = factCardsCustomPacksResult.status === "fulfilled" ? factCardsCustomPacksResult.value : [];
      const picturePhrasePacks = picturePhrasePacksResult.status === "fulfilled" ? picturePhrasePacksResult.value : [];
      const vocabPacks = vocabPacksResult.status === "fulfilled" ? vocabPacksResult.value : [];
      const sessions = sessionsResult.status === "fulfilled" ? sessionsResult.value : [];

      const todayKey = localDayKey(new Date().toISOString());
      const sessionsToday = sessions.filter((entry) => localDayKey(entry.completedAt) === todayKey).length;
      const totalItems = sessions.reduce((sum, entry) => sum + entry.totalItems, 0);
      const totalCorrect = sessions.reduce((sum, entry) => sum + entry.correctItems, 0);
      const builtInPackCount = builtInPacks.filter((pack) => pack.valid).length;
      const factCardsCustomPackCount = factCardsCustomPacks.length;
      const picturePhrasesCustomPackCount = picturePhrasePacks.length;
      const vocabVoiceCustomPackCount = vocabPacks.length;
      const customPackCount = factCardsCustomPackCount + picturePhrasesCustomPackCount + vocabVoiceCustomPackCount;

      if (cancelled) {
        return;
      }

      setStats({
        builtInPackCount,
        customPackCount,
        availablePackCount: builtInPackCount + customPackCount,
        factCardsCustomPackCount,
        picturePhrasesCustomPackCount,
        vocabVoiceCustomPackCount,
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

  const dailyGoalProgress = useMemo(
    () => Math.min(100, Math.round((stats.sessionsToday / Math.max(settings.dailySessionGoal, 1)) * 100)),
    [settings.dailySessionGoal, stats.sessionsToday],
  );
  const sortedRewards = useMemo(
    () => [...settings.rewardRules].sort((left, right) => left.targetCompletedPacks - right.targetCompletedPacks),
    [settings.rewardRules],
  );
  const claimedRewardIds = useMemo(() => new Set(settings.claimedRewardRuleIds), [settings.claimedRewardRuleIds]);
  const nextReward = useMemo(
    () =>
      sortedRewards.find(
        (rule) => !claimedRewardIds.has(rule.id) && stats.sessionsTotal < rule.targetCompletedPacks,
      ) ??
      sortedRewards.find((rule) => !claimedRewardIds.has(rule.id)),
    [claimedRewardIds, sortedRewards, stats.sessionsTotal],
  );

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-800">
          <Gift className="h-5 w-5 text-brand" />
          Rewards Progress
        </h2>
        <p className="mt-1 text-sm text-slate-600">Completed packs: {stats.sessionsTotal}</p>

        {sortedRewards.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            No rewards configured yet. Add rewards in{" "}
            <Link className="font-semibold text-brand" href="/settings#settings-rewards">
              Settings
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {sortedRewards.map((rule) => {
                const claimed = claimedRewardIds.has(rule.id);
                const progress = Math.min(100, Math.round((stats.sessionsTotal / Math.max(rule.targetCompletedPacks, 1)) * 100));
                const unlocked = stats.sessionsTotal >= rule.targetCompletedPacks;

                return (
                  <article className="rounded-lg border border-slate-200 bg-slate-50 p-3" key={rule.id}>
                    <p className="inline-flex items-center gap-1 text-sm font-bold text-slate-800">
                      {claimed ? <Trophy className="h-4 w-4 text-amber-600" /> : <Gift className="h-4 w-4 text-brand" />}
                      {rule.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Goal: {rule.targetCompletedPacks} packs</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className={`h-full rounded-full ${claimed || unlocked ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${progress}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {claimed ? "Reward earned" : unlocked ? "Goal reached" : `${rule.targetCompletedPacks - stats.sessionsTotal} to go`}
                    </p>
                  </article>
                );
              })}
            </div>
            {nextReward ? (
              <p className="mt-3 text-sm text-slate-700">
                Next reward: <span className="font-bold">{nextReward.title}</span> after{" "}
                {Math.max(nextReward.targetCompletedPacks - stats.sessionsTotal, 0)} more pack(s).
              </p>
            ) : (
              <p className="mt-3 text-sm font-semibold text-amber-700">All configured rewards are unlocked.</p>
            )}
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-800">
            <Info className="h-5 w-5 text-brand" />
            Purpose and Getting Started
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            BrightSteps is a calm, visual-first, local-first learning companion for autistic kids and their families. It is designed for predictable routines, low-friction interactions, and caregiver-guided learning.
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
            <li>Open Settings and choose FactCards, PicturePhrases, or VocabVoice manager.</li>
            <li>Create a pack in UI mode or JSON mode and save it.</li>
            <li>Start with Learn mode (untimed), then move to Review mode (timed quiz).</li>
            <li>Open Insights from the sidebar to track progress and accuracy trends.</li>
          </ol>
        </section>

        <section className="card p-5">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-800">
            <ShieldAlert className="h-5 w-5 text-brand" />
            Disclaimer
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Educational tool only. BrightSteps does not provide therapy, diagnosis, or medical advice. For clinical guidance, consult qualified professionals.
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Keep child data private. Avoid uploading sensitive personal information.
          </p>
        </section>
      </div>

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
          <p className="mt-2 text-xs text-slate-500">
            FactCards {stats.factCardsCustomPackCount} • PicturePhrases {stats.picturePhrasesCustomPackCount} •
            {" "}VocabVoice {stats.vocabVoiceCustomPackCount}
          </p>
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
          <p className="mt-2 text-xs text-slate-500">Available pool: {stats.availablePackCount} packs</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-800">
            <Goal className="h-5 w-5 text-brand" />
            Daily Goal
          </h2>
          <p className="mt-1 text-sm text-slate-600">Target: {settings.dailySessionGoal} calm sessions per day.</p>
          <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-brand" style={{ width: `${dailyGoalProgress}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-700">
            {stats.sessionsToday} session(s) today ({dailyGoalProgress}% of daily goal)
          </p>
          <p className="mt-1 text-xs text-slate-500">Weekly goal configured: {settings.weeklySessionGoal} sessions</p>
        </section>

        <section className="card p-5">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-800">
            <Brain className="h-5 w-5 text-brand" />
            Progress Notes
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
            <li>FactCards, PicturePhrases, and VocabVoice are isolated by module type.</li>
            <li>Runtime remains local-first with no cloud dependency.</li>
            <li>Use Settings to open module managers and create/edit packs.</li>
          </ul>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="text-lg font-bold text-slate-800">Modules and Features</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-bold text-slate-800">FactCards</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
              <li>Structured question-and-answer cards with optional visuals and audio.</li>
              <li>Learn mode for guided explanation and reinforcement.</li>
              <li>Review mode for timed quiz practice with feedback and progression.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-bold text-slate-800">PicturePhrases</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
              <li>Image-driven sentence building using drag, tap, or type interactions.</li>
              <li>AI-assisted content generation from uploaded images.</li>
              <li>Learn mode narration and Review mode sentence-check flow.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-bold text-slate-800">VocabVoice</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
              <li>Voice-first vocabulary practice with syllable guidance and pronunciation audio.</li>
              <li>AI-generated definitions, examples, and review prompts at pack creation time.</li>
              <li>Review mode requires correct pronunciation before moving forward.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
