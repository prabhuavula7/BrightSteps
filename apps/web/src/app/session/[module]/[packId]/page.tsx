"use client";

import type { BrightStepsPack } from "@brightsteps/content-schema";
import { SessionPlayer } from "@/components/session-player";
import { TopNav } from "@/components/top-nav";
import { db } from "@/db/client-db";
import { fetchPack, type PackPayload } from "@/lib/api";
import type { SessionConfig } from "@/types/session";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function parseSessionConfig(searchParams: URLSearchParams): SessionConfig {
  const duration = Number(searchParams.get("duration") ?? "10");
  const mode = searchParams.get("mode") === "review" ? "review" : "learn";
  const supportRaw = searchParams.get("support");
  const supportLevel = supportRaw === "auto" || supportRaw === null
    ? "auto"
    : (Number(supportRaw) as 0 | 1 | 2 | 3);
  const inputRaw = searchParams.get("input");
  const inputType = inputRaw === "drag" || inputRaw === "type" ? inputRaw : "tap";

  return {
    durationMinutes: duration === 5 || duration === 15 ? duration : 10,
    mode,
    supportLevel,
    inputType,
  };
}

export default function SessionPage() {
  const params = useParams<{ module: "factcards" | "picturephrases"; packId: string }>();
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
      const source = searchParams.get("source") === "custom" ? "custom" : "builtin";

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
