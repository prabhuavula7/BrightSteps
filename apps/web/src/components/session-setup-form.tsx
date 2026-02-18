"use client";

import type { ModuleType } from "@brightsteps/content-schema";
import { useSettings } from "@/components/settings-provider";
import { getDefaultReviewDuration, getReviewDurationOptions } from "@/lib/session";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Props = {
  packId: string;
  itemCount: number;
  moduleType: ModuleType;
  source: "builtin" | "custom" | "picturephrases" | "vocabvoice";
};

export function SessionSetupForm({ packId, itemCount, moduleType, source }: Props) {
  const router = useRouter();
  const { settings } = useSettings();
  const [mode, setMode] = useState<"learn" | "review">("learn");
  const reviewDurationOptions = useMemo(() => getReviewDurationOptions(itemCount), [itemCount]);
  const [durationMinutes, setDurationMinutes] = useState<number>(() => getDefaultReviewDuration(itemCount));
  const [supportLevel, setSupportLevel] = useState<"auto" | 0 | 1 | 2 | 3>("auto");
  const [inputTypeOverride, setInputTypeOverride] = useState<"tap" | "drag" | "type" | null>(null);

  const safeDurationMinutes = reviewDurationOptions.includes(durationMinutes)
    ? durationMinutes
    : getDefaultReviewDuration(itemCount);
  const inputType =
    inputTypeOverride ??
    (moduleType === "picturephrases" ? settings.inputPreference : moduleType === "vocabvoice" ? "type" : "tap");

  return (
    <form
      className="card mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6 xl:max-w-4xl xl:p-8"
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams({
          duration: String(mode === "review" ? safeDurationMinutes : 0),
          mode,
          support: String(supportLevel),
          input: inputType,
          source,
        });
        router.push(`/session/${moduleType}/${packId}?${params.toString()}`);
      }}
    >
      <h2 className="text-2xl font-bold text-slate-900">Session Setup</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-slate-600">Mode</span>
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={mode}
            onChange={(event) => {
              const nextMode = event.target.value as "learn" | "review";
              setMode(nextMode);
              if (nextMode === "review" && !reviewDurationOptions.includes(safeDurationMinutes)) {
                setDurationMinutes(getDefaultReviewDuration(itemCount));
              }
            }}
          >
            <option value="learn">Learn</option>
            <option value="review">Review</option>
          </select>
        </label>

        {mode === "review" ? (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-600">Review Time Limit</span>
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2"
              value={safeDurationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
            >
              {reviewDurationOptions.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">Deck size: {itemCount} cards</span>
          </label>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            Learn mode is untimed. The session moves at the child&apos;s pace.
          </div>
        )}

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-slate-600">Support Level</span>
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={supportLevel}
            onChange={(event) => {
              const value = event.target.value;
              setSupportLevel(value === "auto" ? "auto" : (Number(value) as 0 | 1 | 2 | 3));
            }}
          >
            <option value="auto">Auto</option>
            <option value={3}>Level 3 (Max support)</option>
            <option value={2}>Level 2</option>
            <option value={1}>Level 1</option>
            <option value={0}>Level 0 (No hints)</option>
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-slate-600">Input Type</span>
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={inputType}
            onChange={(event) => setInputTypeOverride(event.target.value as "tap" | "drag" | "type")}
            disabled={moduleType === "vocabvoice"}
          >
            {moduleType !== "vocabvoice" ? <option value="tap">Tap</option> : null}
            {moduleType === "picturephrases" ? <option value="drag">Drag</option> : null}
            <option value="type">Type</option>
          </select>
        </label>
      </div>

      <button
        className="rounded-lg bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-strong"
        type="submit"
      >
        Start Session
      </button>
    </form>
  );
}
