"use client";

import { SessionSetupForm } from "@/components/session-setup-form";
import { db } from "@/db/client-db";
import { fetchPack } from "@/lib/api";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type SetupState = {
  packId: string;
  title: string;
  moduleType: "factcards" | "picturephrases";
  source: "builtin" | "custom";
};

export function SessionSetupClient() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<SetupState | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      const packId = searchParams.get("packId");
      const customPackId = searchParams.get("customPackId");

      if (!packId && !customPackId) {
        setError("Choose a pack from FactCards or PicturePhrases first.");
        return;
      }

      if (customPackId) {
        const record = await db.customPacks.get(customPackId);
        if (!record) {
          setError("Custom pack not found in memory.");
          return;
        }

        if (cancelled) {
          return;
        }

        setState({
          packId: record.id,
          title: record.title,
          moduleType: record.moduleType,
          source: "custom",
        });
        return;
      }

      if (packId) {
        try {
          const payload = await fetchPack(packId);
          if (cancelled) {
            return;
          }

          setState({
            packId,
            title: payload.pack.title,
            moduleType: payload.pack.moduleType,
            source: "builtin",
          });
        } catch {
          setError("Built-in pack could not be loaded.");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <>
      {error ? <div className="card p-4 text-sm text-amber-700">{error}</div> : null}

      {state ? (
        <>
          <div className="mb-4">
            <h1 className="text-2xl font-black text-slate-900">{state.title}</h1>
            <p className="text-sm text-slate-600">
              Configure your {state.moduleType === "factcards" ? "FactCards" : "PicturePhrases"} session.
            </p>
          </div>
          <SessionSetupForm moduleType={state.moduleType} packId={state.packId} source={state.source} />
        </>
      ) : (
        <div className="card p-4 text-sm text-slate-600">Loading setup...</div>
      )}
    </>
  );
}
