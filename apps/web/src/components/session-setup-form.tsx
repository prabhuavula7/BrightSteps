"use client";

import type { ModuleType } from "@brightsteps/content-schema";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  packId: string;
  moduleType: ModuleType;
  source: "builtin" | "custom";
};

export function SessionSetupForm({ packId, moduleType, source }: Props) {
  const router = useRouter();
  const [durationMinutes, setDurationMinutes] = useState<5 | 10 | 15>(10);
  const [mode, setMode] = useState<"learn" | "review">("learn");
  const [supportLevel, setSupportLevel] = useState<"auto" | 0 | 1 | 2 | 3>("auto");
  const [inputType, setInputType] = useState<"tap" | "drag" | "type">(
    moduleType === "picturephrases" ? "drag" : "tap",
  );

  return (
    <form
      className="card mx-auto flex max-w-2xl flex-col gap-6 p-6"
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams({
          duration: String(durationMinutes),
          mode,
          support: String(supportLevel),
          input: inputType,
          source,
        });
        router.push(`/session/${moduleType}/${packId}?${params.toString()}`);
      }}
    >
      <h2 className="text-2xl font-bold text-slate-900">Session Setup</h2>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-slate-600">Duration</span>
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2"
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(Number(event.target.value) as 5 | 10 | 15)}
        >
          <option value={5}>5 minutes</option>
          <option value={10}>10 minutes</option>
          <option value={15}>15 minutes</option>
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-slate-600">Mode</span>
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2"
          value={mode}
          onChange={(event) => setMode(event.target.value as "learn" | "review")}
        >
          <option value="learn">Learn</option>
          <option value="review">Review</option>
        </select>
      </label>

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
          onChange={(event) => setInputType(event.target.value as "tap" | "drag" | "type")}
        >
          <option value="tap">Tap</option>
          <option value="drag">Drag</option>
          <option value="type">Type</option>
        </select>
      </label>

      <button
        className="rounded-lg bg-[#2badee] px-4 py-3 text-sm font-bold text-white hover:bg-[#2094ce]"
        type="submit"
      >
        Start Session
      </button>
    </form>
  );
}
