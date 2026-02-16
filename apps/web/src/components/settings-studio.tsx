"use client";

import { validatePack, type BrightStepsPack, type ModuleType } from "@brightsteps/content-schema";
import { db, DEFAULT_SETTINGS, getSettings, saveCustomPack, type SettingsRecord } from "@/db/client-db";
import { useEffect, useState } from "react";

type FactDraftItem = {
  id: string;
  topic: string;
  prompt: string;
  answer: string;
  optionA: string;
  optionB: string;
  optionC: string;
  hint: string;
  imageLink: string;
  imageDataUrl?: string;
  audioDataUrl?: string;
};

type PhraseDraftItem = {
  id: string;
  topic: string;
  canonical: string;
  acceptableLines: string;
  wordBankCsv: string;
  hint: string;
  imageLink: string;
  imageDataUrl?: string;
  audioDataUrl?: string;
};

type PackDraftBase = {
  packId: string;
  title: string;
  description: string;
  language: string;
  ageBand: string;
  topicsCsv: string;
};

const defaultFactItem = (): FactDraftItem => ({
  id: `fc_${Math.random().toString(36).slice(2, 8)}`,
  topic: "general",
  prompt: "",
  answer: "",
  optionA: "",
  optionB: "",
  optionC: "",
  hint: "",
  imageLink: "",
});

const defaultPhraseItem = (): PhraseDraftItem => ({
  id: `pp_${Math.random().toString(36).slice(2, 8)}`,
  topic: "general",
  canonical: "",
  acceptableLines: "",
  wordBankCsv: "",
  hint: "",
  imageLink: "",
});

function defaultPackDraft(moduleType: ModuleType): PackDraftBase {
  const suffix = moduleType === "factcards" ? "factcards" : "picturephrases";
  return {
    packId: `${suffix}-${Math.random().toString(36).slice(2, 7)}`,
    title: moduleType === "factcards" ? "New FactCards Pack" : "New PicturePhrases Pack",
    description: "",
    language: "en",
    ageBand: "6-10",
    topicsCsv: "general",
  };
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function SettingsStudio() {
  const [settings, setSettings] = useState<SettingsRecord>(DEFAULT_SETTINGS);
  const [activeEditor, setActiveEditor] = useState<ModuleType>("factcards");
  const [factDraft, setFactDraft] = useState<PackDraftBase>(defaultPackDraft("factcards"));
  const [phraseDraft, setPhraseDraft] = useState<PackDraftBase>(defaultPackDraft("picturephrases"));
  const [factItems, setFactItems] = useState<FactDraftItem[]>([defaultFactItem()]);
  const [phraseItems, setPhraseItems] = useState<PhraseDraftItem[]>([defaultPhraseItem()]);
  const [customPacks, setCustomPacks] = useState<BrightStepsPack[]>([]);
  const [uploadText, setUploadText] = useState("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [currentSettings, storedPacks] = await Promise.all([
        getSettings(),
        db.customPacks.orderBy("updatedAt").reverse().toArray(),
      ]);

      if (cancelled) {
        return;
      }

      setSettings(currentSettings);
      setCustomPacks(storedPacks.map((record) => record.payload));
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshCustomPacks() {
    const storedPacks = await db.customPacks.orderBy("updatedAt").reverse().toArray();
    setCustomPacks(storedPacks.map((record) => record.payload));
  }

  async function updateSettings(patch: Partial<SettingsRecord>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    await db.settings.put(next);
  }

  async function handleUploadFile(file: File) {
    const text = await file.text();
    setUploadText(text);
    setStatus(`Loaded ${file.name}. Validate and save when ready.`);
  }

  function buildFactPack(): BrightStepsPack {
    const topics = factDraft.topicsCsv
      .split(",")
      .map((topic) => topic.trim())
      .filter(Boolean);

    const assets: BrightStepsPack["assets"] = [];

    const items = factItems.map((item) => {
      const imageSource = item.imageDataUrl || item.imageLink.trim();
      const audioSource = item.audioDataUrl;
      const media: { imageRef?: string; promptAudioRef?: string } = {};

      if (imageSource) {
        const imageId = `${item.id}_image`;
        assets.push({ id: imageId, kind: "image", path: imageSource, alt: `${item.prompt || "Fact card image"}` });
        media.imageRef = imageId;
      }

      if (audioSource) {
        const audioId = `${item.id}_audio`;
        assets.push({ id: audioId, kind: "audio", path: audioSource, transcript: item.prompt || undefined });
        media.promptAudioRef = audioId;
      }

      const distractors = [item.optionA, item.optionB, item.optionC]
        .map((option) => option.trim())
        .filter((option) => option.length > 0 && option.toLowerCase() !== item.answer.trim().toLowerCase());

      return {
        id: item.id,
        type: "factcard" as const,
        topic: item.topic.trim() || "general",
        prompt: item.prompt.trim(),
        answer: item.answer.trim(),
        distractors,
        hints: item.hint.trim() ? [item.hint.trim()] : undefined,
        media: Object.keys(media).length > 0 ? media : undefined,
      };
    });

    return {
      schemaVersion: "2.0.0",
      packId: factDraft.packId.trim(),
      moduleType: "factcards",
      title: factDraft.title.trim(),
      description: factDraft.description.trim() || undefined,
      version: "1.0.0",
      language: factDraft.language.trim() || "en",
      ageBand: factDraft.ageBand.trim() || "6-10",
      topics: topics.length > 0 ? topics : ["general"],
      settings: {
        defaultSupportLevel: 2,
        audioEnabledByDefault: false,
      },
      assets,
      items,
    };
  }

  function buildPhrasePack(): BrightStepsPack {
    const topics = phraseDraft.topicsCsv
      .split(",")
      .map((topic) => topic.trim())
      .filter(Boolean);

    const assets: BrightStepsPack["assets"] = [];

    const items = phraseItems.map((item) => {
      const imageSource = item.imageDataUrl || item.imageLink.trim();
      const audioSource = item.audioDataUrl;
      const imageId = `${item.id}_image`;

      assets.push({ id: imageId, kind: "image", path: imageSource, alt: `${item.topic || "Picture prompt"} image` });

      const media: { imageRef: string; promptAudioRef?: string } = { imageRef: imageId };

      if (audioSource) {
        const audioId = `${item.id}_audio`;
        assets.push({ id: audioId, kind: "audio", path: audioSource, transcript: item.canonical || undefined });
        media.promptAudioRef = audioId;
      }

      const words = item.wordBankCsv
        .split(",")
        .map((word) => word.trim())
        .filter(Boolean);
      const wordBank = words.map((word, index) => ({ id: `w${index + 1}`, text: word }));
      const acceptable = item.acceptableLines
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const canonical = item.canonical.trim();

      return {
        id: item.id,
        type: "picturephrase" as const,
        topic: item.topic.trim() || "general",
        media,
        wordBank,
        sentenceGroups: [
          {
            intent: "default",
            canonical,
            acceptable: acceptable.length > 0 ? acceptable : [canonical],
            requiredWordIds: wordBank.slice(0, Math.min(3, wordBank.length)).map((word) => word.id),
            minWords: Math.max(1, Math.min(4, wordBank.length)),
            maxWords: Math.max(4, wordBank.length + 2),
          },
        ],
        hintLevels: item.hint.trim() ? { level3: item.hint.trim() } : undefined,
      };
    });

    return {
      schemaVersion: "2.0.0",
      packId: phraseDraft.packId.trim(),
      moduleType: "picturephrases",
      title: phraseDraft.title.trim(),
      description: phraseDraft.description.trim() || undefined,
      version: "1.0.0",
      language: phraseDraft.language.trim() || "en",
      ageBand: phraseDraft.ageBand.trim() || "6-10",
      topics: topics.length > 0 ? topics : ["general"],
      settings: {
        defaultSupportLevel: 2,
        audioEnabledByDefault: false,
      },
      assets,
      items,
    };
  }

  async function validateAndSavePack(candidate: unknown) {
    const result = validatePack(candidate);
    if (!result.success) {
      setStatus(`Validation failed: ${result.issues.map((issue) => `${issue.path} ${issue.message}`).join(" | ")}`);
      return;
    }

    await saveCustomPack(result.data);
    await refreshCustomPacks();
    setStatus(`Saved pack \"${result.data.title}\" in local memory.`);
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <section className="card p-5">
        <h2 className="text-lg font-bold text-slate-900">CalmControls</h2>
        <div className="mt-3 space-y-3 text-sm">
          <label className="flex items-center justify-between">
            <span>Reduced motion</span>
            <input
              checked={settings.reducedMotion}
              onChange={(event) => void updateSettings({ reducedMotion: event.target.checked })}
              type="checkbox"
            />
          </label>
          <label className="flex items-center justify-between">
            <span>Audio enabled</span>
            <input
              checked={settings.audioEnabled}
              onChange={(event) => void updateSettings({ audioEnabled: event.target.checked })}
              type="checkbox"
            />
          </label>
        </div>

        <h3 className="mt-6 text-sm font-bold uppercase text-slate-600">Memory Packs</h3>
        <div className="mt-2 space-y-2 text-xs">
          {customPacks.length === 0 ? (
            <p className="text-slate-500">No custom packs saved yet.</p>
          ) : (
            customPacks.map((pack) => (
              <div className="rounded border border-slate-200 p-2" key={pack.packId}>
                <p className="font-semibold text-slate-800">{pack.title}</p>
                <p className="text-slate-500">{pack.moduleType} • {pack.items.length} items</p>
                <button
                  className="mt-1 text-rose-600"
                  onClick={() =>
                    void (async () => {
                      await db.customPacks.delete(pack.packId);
                      await refreshCustomPacks();
                    })()
                  }
                  type="button"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold text-slate-900">Upload JSON Pack</h2>
        <p className="mt-1 text-sm text-slate-600">Upload a complete pack JSON and save it to local memory.</p>
        <input
          accept="application/json,.json"
          className="mt-3 block w-full text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleUploadFile(file);
            }
          }}
          type="file"
        />
        <textarea
          className="mt-3 h-52 w-full rounded-lg border border-slate-300 p-2 text-xs"
          onChange={(event) => setUploadText(event.target.value)}
          placeholder="Paste pack.json content here"
          value={uploadText}
        />
        <button
          className="mt-3 rounded-lg bg-[#2badee] px-3 py-2 text-sm font-bold text-white"
          onClick={() => {
            try {
              const json = JSON.parse(uploadText);
              void validateAndSavePack(json);
            } catch {
              setStatus("Upload JSON is not valid JSON.");
            }
          }}
          type="button"
        >
          Validate & Save Upload
        </button>
      </section>

      <section className="card p-5 xl:col-span-1">
        <h2 className="text-lg font-bold text-slate-900">Create New Pack</h2>
        <div className="mt-3 flex gap-2">
          <button
            className={`rounded px-3 py-1 text-xs font-semibold ${
              activeEditor === "factcards" ? "bg-[#2badee]/10 text-[#2badee]" : "bg-slate-100 text-slate-600"
            }`}
            onClick={() => setActiveEditor("factcards")}
            type="button"
          >
            FactCards
          </button>
          <button
            className={`rounded px-3 py-1 text-xs font-semibold ${
              activeEditor === "picturephrases" ? "bg-[#2badee]/10 text-[#2badee]" : "bg-slate-100 text-slate-600"
            }`}
            onClick={() => setActiveEditor("picturephrases")}
            type="button"
          >
            PicturePhrases
          </button>
        </div>

        {activeEditor === "factcards" ? (
          <div className="mt-4 space-y-3">
            <input
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(event) => setFactDraft((prev) => ({ ...prev, packId: event.target.value }))}
              placeholder="Pack ID"
              value={factDraft.packId}
            />
            <input
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(event) => setFactDraft((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Pack title"
              value={factDraft.title}
            />
            <input
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(event) => setFactDraft((prev) => ({ ...prev, topicsCsv: event.target.value }))}
              placeholder="Topics (comma separated)"
              value={factDraft.topicsCsv}
            />

            {factItems.map((item, index) => (
              <div className="rounded border border-slate-200 p-2" key={item.id}>
                <p className="mb-2 text-xs font-semibold text-slate-600">Card {index + 1}</p>
                <input
                  className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  onChange={(event) =>
                    setFactItems((prev) => prev.map((entry, i) => (i === index ? { ...entry, prompt: event.target.value } : entry)))
                  }
                  placeholder="Question prompt"
                  value={item.prompt}
                />
                <input
                  className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  onChange={(event) =>
                    setFactItems((prev) => prev.map((entry, i) => (i === index ? { ...entry, answer: event.target.value } : entry)))
                  }
                  placeholder="Correct answer"
                  value={item.answer}
                />
                <input
                  className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  onChange={(event) =>
                    setFactItems((prev) => prev.map((entry, i) => (i === index ? { ...entry, optionA: event.target.value } : entry)))
                  }
                  placeholder="Option A"
                  value={item.optionA}
                />
                <input
                  className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  onChange={(event) =>
                    setFactItems((prev) => prev.map((entry, i) => (i === index ? { ...entry, optionB: event.target.value } : entry)))
                  }
                  placeholder="Option B"
                  value={item.optionB}
                />
                <input
                  className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  onChange={(event) =>
                    setFactItems((prev) => prev.map((entry, i) => (i === index ? { ...entry, optionC: event.target.value } : entry)))
                  }
                  placeholder="Option C"
                  value={item.optionC}
                />
                <input
                  className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  onChange={(event) =>
                    setFactItems((prev) => prev.map((entry, i) => (i === index ? { ...entry, imageLink: event.target.value } : entry)))
                  }
                  placeholder="Image URL"
                  value={item.imageLink}
                />
                <label className="mb-2 block text-xs text-slate-600">
                  Upload image
                  <input
                    accept="image/*"
                    className="mt-1 block w-full"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      void (async () => {
                        const data = await fileToDataUrl(file);
                        setFactItems((prev) =>
                          prev.map((entry, i) => (i === index ? { ...entry, imageDataUrl: data } : entry)),
                        );
                      })();
                    }}
                    type="file"
                  />
                </label>
                <label className="mb-2 block text-xs text-slate-600">
                  Upload audio
                  <input
                    accept="audio/*"
                    className="mt-1 block w-full"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      void (async () => {
                        const data = await fileToDataUrl(file);
                        setFactItems((prev) =>
                          prev.map((entry, i) => (i === index ? { ...entry, audioDataUrl: data } : entry)),
                        );
                      })();
                    }}
                    type="file"
                  />
                </label>
              </div>
            ))}

            <div className="flex gap-2">
              <button
                className="rounded border border-slate-300 px-2 py-1 text-xs"
                onClick={() => setFactItems((prev) => [...prev, defaultFactItem()])}
                type="button"
              >
                Add card
              </button>
              <button
                className="rounded bg-[#2badee] px-2 py-1 text-xs font-bold text-white"
                onClick={() => void validateAndSavePack(buildFactPack())}
                type="button"
              >
                Save FactCards Pack
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <input
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(event) => setPhraseDraft((prev) => ({ ...prev, packId: event.target.value }))}
              placeholder="Pack ID"
              value={phraseDraft.packId}
            />
            <input
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(event) => setPhraseDraft((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Pack title"
              value={phraseDraft.title}
            />
            <input
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(event) => setPhraseDraft((prev) => ({ ...prev, topicsCsv: event.target.value }))}
              placeholder="Topics (comma separated)"
              value={phraseDraft.topicsCsv}
            />

            {phraseItems.map((item, index) => (
              <div className="rounded border border-slate-200 p-2" key={item.id}>
                <p className="mb-2 text-xs font-semibold text-slate-600">Phrase Item {index + 1}</p>
                <input
                  className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  onChange={(event) =>
                    setPhraseItems((prev) =>
                      prev.map((entry, i) => (i === index ? { ...entry, canonical: event.target.value } : entry)),
                    )
                  }
                  placeholder="Canonical sentence"
                  value={item.canonical}
                />
                <textarea
                  className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  onChange={(event) =>
                    setPhraseItems((prev) =>
                      prev.map((entry, i) => (i === index ? { ...entry, acceptableLines: event.target.value } : entry)),
                    )
                  }
                  placeholder="Acceptable variants (one per line)"
                  rows={3}
                  value={item.acceptableLines}
                />
                <input
                  className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  onChange={(event) =>
                    setPhraseItems((prev) =>
                      prev.map((entry, i) => (i === index ? { ...entry, wordBankCsv: event.target.value } : entry)),
                    )
                  }
                  placeholder="Word bank (comma separated)"
                  value={item.wordBankCsv}
                />
                <input
                  className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  onChange={(event) =>
                    setPhraseItems((prev) =>
                      prev.map((entry, i) => (i === index ? { ...entry, imageLink: event.target.value } : entry)),
                    )
                  }
                  placeholder="Image URL"
                  value={item.imageLink}
                />
                <label className="mb-2 block text-xs text-slate-600">
                  Upload image
                  <input
                    accept="image/*"
                    className="mt-1 block w-full"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      void (async () => {
                        const data = await fileToDataUrl(file);
                        setPhraseItems((prev) =>
                          prev.map((entry, i) => (i === index ? { ...entry, imageDataUrl: data } : entry)),
                        );
                      })();
                    }}
                    type="file"
                  />
                </label>
                <label className="mb-2 block text-xs text-slate-600">
                  Upload audio
                  <input
                    accept="audio/*"
                    className="mt-1 block w-full"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      void (async () => {
                        const data = await fileToDataUrl(file);
                        setPhraseItems((prev) =>
                          prev.map((entry, i) => (i === index ? { ...entry, audioDataUrl: data } : entry)),
                        );
                      })();
                    }}
                    type="file"
                  />
                </label>
              </div>
            ))}

            <div className="flex gap-2">
              <button
                className="rounded border border-slate-300 px-2 py-1 text-xs"
                onClick={() => setPhraseItems((prev) => [...prev, defaultPhraseItem()])}
                type="button"
              >
                Add phrase item
              </button>
              <button
                className="rounded bg-[#2badee] px-2 py-1 text-xs font-bold text-white"
                onClick={() => void validateAndSavePack(buildPhrasePack())}
                type="button"
              >
                Save PicturePhrases Pack
              </button>
            </div>
          </div>
        )}

        {status ? <p className="mt-4 text-xs text-slate-600">{status}</p> : null}
      </section>
    </div>
  );
}
