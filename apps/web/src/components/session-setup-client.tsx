"use client";

import { SessionSetupForm } from "@/components/session-setup-form";
import { db } from "@/db/client-db";
import { fetchPack, fetchPicturePhrasePack, fetchVocabPack } from "@/lib/api";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type SetupState = {
  packId: string;
  title: string;
  itemCount: number;
  moduleType: "factcards" | "picturephrases" | "vocabvoice";
  source: "builtin" | "custom" | "picturephrases" | "vocabvoice";
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
      const ppPackId = searchParams.get("ppPackId");
      const vocabPackId = searchParams.get("vocabPackId");

      if (!packId && !customPackId && !ppPackId && !vocabPackId) {
        setError("Choose a pack from FactCards, PicturePhrases, or VocabVoice first.");
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
          itemCount: record.payload.items.length,
          moduleType: record.moduleType,
          source: "custom",
        });
        return;
      }

      if (ppPackId) {
        try {
          const payload = await fetchPicturePhrasePack(ppPackId);
          if (cancelled) {
            return;
          }

          setState({
            packId: ppPackId,
            title: payload.summary.title,
            itemCount: payload.summary.itemCount,
            moduleType: "picturephrases",
            source: "picturephrases",
          });
        } catch {
          setError("PicturePhrases pack could not be loaded.");
        }
        return;
      }

      if (vocabPackId) {
        try {
          const payload = await fetchVocabPack(vocabPackId);
          if (cancelled) {
            return;
          }

          setState({
            packId: vocabPackId,
            title: payload.summary.title,
            itemCount: payload.summary.itemCount,
            moduleType: "vocabvoice",
            source: "vocabvoice",
          });
        } catch {
          setError("VocabVoice pack could not be loaded.");
        }
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
            itemCount: payload.pack.items.length,
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
          <div className="mb-4 sm:mb-5">
            <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">{state.title}</h1>
            <p className="text-sm text-slate-600">
              Configure your{" "}
              {state.moduleType === "factcards"
                ? "FactCards"
                : state.moduleType === "picturephrases"
                  ? "PicturePhrases"
                  : "VocabVoice"}{" "}
              session.
            </p>
          </div>
          <SessionSetupForm
            itemCount={state.itemCount}
            moduleType={state.moduleType}
            packId={state.packId}
            source={state.source}
          />
        </>
      ) : (
        <div className="card p-4 text-sm text-slate-600">Loading setup...</div>
      )}
    </>
  );
}
