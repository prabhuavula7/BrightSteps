"use client";

import type { BrightStepsPack } from "@brightsteps/content-schema";
import { SessionPlayer } from "@/components/session-player";
import { TopNav } from "@/components/top-nav";
import { db } from "@/db/client-db";
import { fetchPack, fetchPicturePhrasePack, fetchVocabPack, type PackPayload } from "@/lib/api";
import type { SessionConfig } from "@/types/session";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function parseSessionConfig(searchParams: URLSearchParams): SessionConfig {
  const mode = searchParams.get("mode") === "review" ? "review" : "learn";
  const durationRaw = Number.parseInt(searchParams.get("duration") ?? "0", 10);
  const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 10;
  const supportRaw = searchParams.get("support");
  const supportParsed = Number.parseInt(supportRaw ?? "", 10);
  const supportLevel =
    supportRaw === "auto" || supportRaw === null
      ? "auto"
      : supportParsed === 0 || supportParsed === 1 || supportParsed === 2 || supportParsed === 3
        ? supportParsed
        : "auto";
  const inputRaw = searchParams.get("input");
  const inputType = inputRaw === "drag" || inputRaw === "type" ? inputRaw : "tap";

  return {
    durationMinutes: mode === "review" ? duration : 0,
    mode,
    supportLevel,
    inputType,
  };
}

export default function SessionPage() {
  const params = useParams<{ module: "factcards" | "picturephrases" | "vocabvoice"; packId: string }>();
  const searchParams = useSearchParams();
  const [pack, setPack] = useState<BrightStepsPack | null>(null);
  const [assetUrlById, setAssetUrlById] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>("");

  const config = useMemo(() => parseSessionConfig(searchParams), [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      setPack(null);
      const sourceRaw = searchParams.get("source");
      const source =
        sourceRaw === "custom"
          ? "custom"
          : sourceRaw === "picturephrases"
            ? "picturephrases"
            : sourceRaw === "vocabvoice"
              ? "vocabvoice"
              : "builtin";

      if (source === "custom") {
        const record = await db.customPacks.get(params.packId);
        if (!record) {
          setError("Custom pack not found in local memory.");
          return;
        }

        if (record.moduleType !== params.module) {
          setError("Custom pack module mismatch.");
          return;
        }

        if (cancelled) {
          return;
        }

        setPack(record.payload);
        setAssetUrlById(Object.fromEntries(record.payload.assets.map((asset) => [asset.id, asset.path])));
        return;
      }

      if (source === "picturephrases") {
        try {
          const payload = await fetchPicturePhrasePack(params.packId);
          if (payload.summary.valid !== true) {
            setError("PicturePhrases pack is not ready. Finish generation or fix JSON first.");
            return;
          }

          if (cancelled) {
            return;
          }

          setPack(payload.pack as BrightStepsPack);
          setAssetUrlById(payload.assetUrlById);
        } catch {
          setError("PicturePhrases pack could not be loaded.");
        }
        return;
      }

      if (source === "vocabvoice") {
        try {
          const payload = await fetchVocabPack(params.packId);
          if (payload.summary.valid !== true) {
            setError("VocabVoice pack is not ready. Run AI processing or fix JSON first.");
            return;
          }

          if (cancelled) {
            return;
          }

          setPack(payload.pack as BrightStepsPack);
          setAssetUrlById(payload.assetUrlById);
        } catch {
          setError("VocabVoice pack could not be loaded.");
        }
        return;
      }

      try {
        const payload: PackPayload = await fetchPack(params.packId);
        if (payload.pack.moduleType !== params.module) {
          setError("Pack module mismatch.");
          return;
        }

        if (cancelled) {
          return;
        }

        setPack(payload.pack);
        setAssetUrlById(payload.assetUrlById);
      } catch {
        setError("Pack could not be loaded.");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [params.module, params.packId, searchParams]);

  return (
    <>
      <TopNav />
      <main className="container-page">
        {error ? <div className="card p-5 text-sm text-amber-700">{error}</div> : null}
        {pack ? <SessionPlayer assetUrlById={assetUrlById} config={config} pack={pack} /> : <div className="card p-5 text-sm text-slate-600">Loading session...</div>}
      </main>
    </>
  );
}
