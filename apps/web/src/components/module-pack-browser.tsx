"use client";

import type { ModuleType } from "@brightsteps/content-schema";
import { db, type CustomPackRecord } from "@/db/client-db";
import { FactCardsPackThumb } from "@/components/factcards-pack-thumb";
import {
  fetchPackSummaries,
  fetchPicturePhraseSummaries,
  fetchVocabSummaries,
  type PackSummary,
  type PicturePhraseSummary,
  type VocabSummary,
} from "@/lib/api";
import { resolvePackThumbnail } from "@/lib/pack-thumbnail";
import { Package, Play, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Props = {
  moduleType: ModuleType;
};

export function ModulePackBrowser({ moduleType }: Props) {
  const [builtInPacks, setBuiltInPacks] = useState<PackSummary[]>([]);
  const [customPacks, setCustomPacks] = useState<CustomPackRecord[]>([]);
  const [picturePhrasePacks, setPicturePhrasePacks] = useState<PicturePhraseSummary[]>([]);
  const [vocabPacks, setVocabPacks] = useState<VocabSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [summaries, custom, picturePhraseCustom, vocabCustom] = await Promise.all([
        fetchPackSummaries(),
        db.customPacks.where("moduleType").equals(moduleType).toArray(),
        moduleType === "picturephrases" ? fetchPicturePhraseSummaries() : Promise.resolve([]),
        moduleType === "vocabvoice" ? fetchVocabSummaries() : Promise.resolve([]),
      ]);

      if (cancelled) {
        return;
      }

      setBuiltInPacks(summaries.filter((pack) => pack.moduleType === moduleType));
      setCustomPacks(custom.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setPicturePhrasePacks(picturePhraseCustom.filter((pack) => pack.valid));
      setVocabPacks(vocabCustom.filter((pack) => pack.valid));
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [moduleType]);

  const title = useMemo(() => {
    if (moduleType === "factcards") {
      return "FactCards";
    }
    if (moduleType === "picturephrases") {
      return "PicturePhrases";
    }
    return "VocabVoice";
  }, [moduleType]);

  if (loading) {
    return <div className="card p-5 text-sm text-slate-600">Loading packs...</div>;
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 inline-flex items-center gap-2 text-lg font-bold text-slate-800">
          <Package className="h-5 w-5 text-brand" />
          Built-in {title} Packs
        </h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {builtInPacks.map((pack) => (
            <article className="card p-5" key={pack.packId}>
              <FactCardsPackThumb
                thumbnailAlt={pack.thumbnailAlt}
                thumbnailSrc={pack.thumbnailUrl}
                title={pack.title}
                topics={pack.topics}
              />
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-900">{pack.title}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                  Built-in
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{pack.description ?? "No description."}</p>
              <p className="mt-1 text-xs text-slate-500">Topics: {pack.topics.join(", ") || "None"}</p>
              <p className="mt-1 text-xs text-slate-500">Items: {pack.itemCount}</p>

              {pack.valid ? (
                <Link
                  className="mt-4 inline-flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
                  href={`/session/setup?packId=${encodeURIComponent(pack.packId)}`}
                >
                  <Play className="h-4 w-4" />
                  Start Session
                </Link>
              ) : (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                  {(pack.issues ?? ["Invalid pack"]).join(" | ")}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 inline-flex items-center gap-2 text-lg font-bold text-slate-800">
          <UserRound className="h-5 w-5 text-brand" />
          Custom {title} Packs
        </h2>
        {moduleType === "picturephrases" ? (
          picturePhrasePacks.length === 0 ? (
            <div className="card p-5 text-sm text-slate-600">
              No custom PicturePhrases packs yet. Create one in{" "}
              <Link className="text-brand" href="/settings/picturephrases">
                PicturePhrases manager
              </Link>
              .
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {picturePhrasePacks.map((pack) => (
                <article className="card p-5" key={pack.packId}>
                  <FactCardsPackThumb
                    thumbnailAlt={pack.thumbnailAlt}
                    thumbnailSrc={pack.thumbnailUrl}
                    title={pack.title}
                    topics={pack.topics}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-slate-900">{pack.title}</h3>
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                      Custom
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Topics: {pack.topics.join(", ") || "None"}</p>
                  <p className="mt-2 text-xs text-slate-500">Updated: {new Date(pack.updatedAt).toLocaleString()}</p>
                  <p className="mt-1 text-xs text-slate-500">Items: {pack.itemCount}</p>
                  <Link
                    className="mt-4 inline-flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
                    href={`/session/setup?ppPackId=${encodeURIComponent(pack.packId)}`}
                  >
                    <Play className="h-4 w-4" />
                    Start Session
                  </Link>
                </article>
              ))}
            </div>
          )
        ) : moduleType === "vocabvoice" ? (
          vocabPacks.length === 0 ? (
            <div className="card p-5 text-sm text-slate-600">
              No VocabVoice packs yet. Create one in{" "}
              <Link className="text-brand" href="/settings/vocabulary">
                VocabVoice manager
              </Link>
              .
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {vocabPacks.map((pack) => (
                <article className="card p-5" key={pack.packId}>
                  <FactCardsPackThumb
                    thumbnailAlt={pack.thumbnailAlt}
                    thumbnailSrc={pack.thumbnailUrl}
                    title={pack.title}
                    topics={pack.topics}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-slate-900">{pack.title}</h3>
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                      Custom
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Topics: {pack.topics.join(", ") || "None"}</p>
                  <p className="mt-2 text-xs text-slate-500">Updated: {new Date(pack.updatedAt).toLocaleString()}</p>
                  <p className="mt-1 text-xs text-slate-500">Words: {pack.itemCount}</p>
                  <Link
                    className="mt-4 inline-flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
                    href={`/session/setup?vocabPackId=${encodeURIComponent(pack.packId)}`}
                  >
                    <Play className="h-4 w-4" />
                    Start Session
                  </Link>
                </article>
              ))}
            </div>
          )
        ) : customPacks.length === 0 ? (
          <div className="card p-5 text-sm text-slate-600">
            No custom packs yet. Create one in{" "}
            <Link className="text-brand" href="/settings/factcards">
              FactCards manager
            </Link>
            .
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {customPacks.map((pack) => {
              const thumbnail = resolvePackThumbnail(pack.payload);
              return (
                <article className="card p-5" key={pack.id}>
                  {moduleType === "factcards" ? (
                    <FactCardsPackThumb
                      thumbnailAlt={thumbnail.alt}
                      thumbnailSrc={thumbnail.src}
                      title={pack.title}
                      topics={pack.payload.topics}
                    />
                  ) : null}
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-slate-900">{pack.title}</h3>
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                      Custom
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Topics: {pack.payload.topics.join(", ") || "None"}</p>
                  <p className="mt-2 text-xs text-slate-500">Updated: {new Date(pack.updatedAt).toLocaleString()}</p>
                  <p className="mt-1 text-xs text-slate-500">Items: {pack.payload.items.length}</p>
                  <Link
                    className="mt-4 inline-flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
                    href={`/session/setup?customPackId=${encodeURIComponent(pack.id)}`}
                  >
                    <Play className="h-4 w-4" />
                    Start Session
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
