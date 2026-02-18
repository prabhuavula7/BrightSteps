"use client";

import { db, type CustomPackRecord } from "@/db/client-db";
import { FactCardsPackThumb } from "@/components/factcards-pack-thumb";
import { fetchPackSummaries, type PackSummary } from "@/lib/api";
import { resolvePackThumbnail } from "@/lib/pack-thumbnail";
import { ArrowLeft, Pencil, Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function FactCardsPackManager() {
  const [builtInPacks, setBuiltInPacks] = useState<PackSummary[]>([]);
  const [customPacks, setCustomPacks] = useState<CustomPackRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [summaries, custom] = await Promise.all([
        fetchPackSummaries(),
        db.customPacks.where("moduleType").equals("factcards").toArray(),
      ]);

      if (cancelled) {
        return;
      }

      setBuiltInPacks(summaries.filter((pack) => pack.moduleType === "factcards"));
      setCustomPacks(custom.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="card p-5 text-sm text-slate-600">Loading FactCards packs...</div>;
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
          <h2 className="text-xl font-bold text-slate-900">Available FactCards Packs</h2>
        </div>
        <Link
          className="inline-flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
          href="/settings/factcards/create"
        >
          <Plus className="h-4 w-4" />
          Create New Pack
        </Link>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">Built-in Packs</h3>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {builtInPacks.map((pack) => (
            <article className="card p-5" key={pack.packId}>
              <FactCardsPackThumb
                thumbnailAlt={pack.thumbnailAlt}
                thumbnailSrc={pack.thumbnailUrl}
                title={pack.title}
                topics={pack.topics}
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-lg font-bold text-slate-900">{pack.title}</h4>
                  <p className="text-sm text-slate-600">{pack.description ?? "No description"}</p>
                  <p className="mt-1 text-xs text-slate-500">Topics: {pack.topics.join(", ") || "None"}</p>
                  <p className="mt-1 text-xs text-slate-500">Items: {pack.itemCount}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                  Built-in
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                  href={`/settings/factcards/${encodeURIComponent(pack.packId)}/edit?source=builtin`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Link>
                <Link
                  className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1 text-xs font-bold text-white"
                  href={`/session/setup?packId=${encodeURIComponent(pack.packId)}`}
                >
                  <Play className="h-3.5 w-3.5" />
                  Run Pack
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">Custom Memory Packs</h3>
        {customPacks.length === 0 ? (
          <div className="card p-5 text-sm text-slate-600">
            No custom FactCards packs yet. Create one to start editing in full-page mode.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {customPacks.map((pack) => {
              const thumbnail = resolvePackThumbnail(pack.payload);
              return (
                <article className="card p-5" key={pack.id}>
                  <FactCardsPackThumb thumbnailAlt={thumbnail.alt} thumbnailSrc={thumbnail.src} title={pack.title} topics={pack.payload.topics} />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-bold text-slate-900">{pack.title}</h4>
                      <p className="mt-1 text-xs text-slate-500">Topics: {pack.payload.topics.join(", ") || "None"}</p>
                      <p className="text-xs text-slate-500">Updated: {new Date(pack.updatedAt).toLocaleString()}</p>
                      <p className="mt-1 text-xs text-slate-500">Items: {pack.payload.items.length}</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                      Custom
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                      href={`/settings/factcards/${encodeURIComponent(pack.id)}/edit?source=custom`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Link>
                    <button
                      className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700"
                      onClick={() =>
                        void (async () => {
                          await db.customPacks.delete(pack.id);
                          const fresh = await db.customPacks.where("moduleType").equals("factcards").toArray();
                          setCustomPacks(fresh.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
                        })()
                      }
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                    <Link
                      className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1 text-xs font-bold text-white"
                      href={`/session/setup?customPackId=${encodeURIComponent(pack.id)}`}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Run Pack
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
