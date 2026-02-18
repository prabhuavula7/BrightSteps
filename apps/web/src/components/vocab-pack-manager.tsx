"use client";

import { deleteVocabPack, fetchVocabSummaries, type VocabSummary } from "@/lib/api";
import { FactCardsPackThumb } from "@/components/factcards-pack-thumb";
import { ArrowLeft, Mic, Pencil, Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function VocabPackManager() {
  const [packs, setPacks] = useState<VocabSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const payload = await fetchVocabSummaries();
        if (!cancelled) {
          setPacks(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load packs");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function removePack(packId: string) {
    const confirmed = window.confirm("Delete this VocabVoice pack and generated audio assets?");
    if (!confirmed) {
      return;
    }

    try {
      await deleteVocabPack(packId);
      const fresh = await fetchVocabSummaries();
      setPacks(fresh);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete pack");
    }
  }

  if (loading) {
    return <div className="card p-5 text-sm text-slate-600">Loading VocabVoice packs...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            href="/settings?section=modules#settings-modules"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Module Settings
          </Link>
          <h2 className="text-xl font-bold text-slate-900">VocabVoice Packs</h2>
        </div>
        <Link
          className="inline-flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
          href="/settings/vocabulary/create"
        >
          <Plus className="h-4 w-4" />
          Create New Pack
        </Link>
      </div>

      {error ? <div className="card border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

      {packs.length === 0 ? (
        <div className="card p-5 text-sm text-slate-600">
          No VocabVoice packs yet. Create one with words and run the AI pipeline once to generate syllables,
          definitions, and audio pronunciation.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {packs.map((pack) => (
            <article className="card flex flex-col gap-3 p-5" key={pack.packId}>
              <FactCardsPackThumb
                thumbnailAlt={pack.thumbnailAlt}
                thumbnailSrc={pack.thumbnailUrl}
                title={pack.title}
                topics={pack.topics}
              />
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-900">{pack.title}</h3>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    pack.valid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {pack.valid ? "Ready" : "Needs Work"}
                </span>
              </div>

              <p className="text-sm text-slate-600">{pack.description || "No description"}</p>
              <p className="text-xs text-slate-500">Topics: {pack.topics.join(", ") || "None"}</p>
              <p className="text-xs text-slate-500">Words: {pack.itemCount}</p>
              <p className="text-xs text-slate-500">Updated: {new Date(pack.updatedAt).toLocaleString()}</p>

              {!pack.valid && pack.issues && pack.issues.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                  {pack.issues.slice(0, 2).join(" | ")}
                </div>
              ) : null}

              <div className="mt-1 flex flex-wrap gap-2">
                <Link
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                  href={`/settings/vocabulary/${encodeURIComponent(pack.packId)}/edit`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Link>
                <button
                  className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700"
                  onClick={() => void removePack(pack.packId)}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
                <Link
                  aria-disabled={!pack.valid}
                  className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-bold text-white ${
                    pack.valid ? "bg-brand" : "cursor-not-allowed bg-slate-400"
                  }`}
                  href={
                    pack.valid
                      ? `/session/setup?vocabPackId=${encodeURIComponent(pack.packId)}`
                      : `/settings/vocabulary/${encodeURIComponent(pack.packId)}/edit`
                  }
                >
                  {pack.valid ? <Play className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  {pack.valid ? "Run Pack" : "Fix Pack"}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
