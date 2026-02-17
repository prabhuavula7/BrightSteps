"use client";

import { validatePack, type BrightStepsPack } from "@brightsteps/content-schema";
import { db, saveCustomPack } from "@/db/client-db";
import { fetchPack } from "@/lib/api";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Mode = "create" | "edit";

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

type PackDraft = {
  packId: string;
  title: string;
  description: string;
  language: string;
  ageBand: string;
  topicsCsv: string;
  thumbnailLink: string;
  thumbnailDataUrl?: string;
};

type FactCardsPack = Extract<BrightStepsPack, { moduleType: "factcards" }>;

const EXAMPLE_JSON = `{
  "schemaVersion": "2.0.0",
  "packId": "factcards-custom-001",
  "moduleType": "factcards",
  "title": "Capitals Review",
  "description": "Simple capital city practice",
  "version": "1.0.0",
  "language": "en",
  "ageBand": "6-10",
  "topics": ["geography"],
  "settings": {
    "defaultSupportLevel": 2,
    "audioEnabledByDefault": false,
    "packThumbnailImageRef": "pack_thumbnail_image"
  },
  "assets": [
    {
      "id": "pack_thumbnail_image",
      "kind": "image",
      "path": "https://example.com/globe.png",
      "alt": "Blue globe icon"
    },
    {
      "id": "img_france",
      "kind": "image",
      "path": "https://example.com/france.png",
      "alt": "Map of France"
    }
  ],
  "items": [
    {
      "id": "fc_001",
      "type": "factcard",
      "topic": "geography",
      "prompt": "What is the capital of France?",
      "answer": "Paris",
      "distractors": ["Berlin", "Madrid", "Rome"],
      "hints": ["It is called the City of Light."],
      "media": {
        "imageRef": "img_france"
      }
    }
  ]
}`;

const defaultPackDraft = (): PackDraft => ({
  packId: `factcards-${Math.random().toString(36).slice(2, 7)}`,
  title: "New FactCards Pack",
  description: "",
  language: "en",
  ageBand: "6-10",
  topicsCsv: "general",
  thumbnailLink: "",
});

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

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function UploadImageIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 text-[#2badee]" fill="none" viewBox="0 0 24 24">
      <rect height="14" rx="2" stroke="currentColor" strokeWidth="1.8" width="18" x="3" y="5" />
      <circle cx="9" cy="10" fill="currentColor" r="1.5" />
      <path d="M6.5 17l4.2-4.2a1 1 0 011.4 0L17.5 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M14 15l1.7-1.7a1 1 0 011.4 0L19.5 16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function UploadAudioIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24">
      <path d="M6 10v4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M10 7v10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M14 5v14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M18 9v6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M4 20h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function DeleteCardIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M5 7h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M10 11v6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M14 11v6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M8 7l1-2h6l1 2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M7 7l1 12h8l1-12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function isCardTouched(item: FactDraftItem): boolean {
  return Boolean(
    item.prompt.trim() ||
      item.answer.trim() ||
      item.optionA.trim() ||
      item.optionB.trim() ||
      item.optionC.trim() ||
      item.hint.trim() ||
      item.imageLink.trim() ||
      item.imageDataUrl ||
      item.audioDataUrl,
  );
}

function isCardComplete(item: FactDraftItem): boolean {
  return Boolean(item.prompt.trim() && item.answer.trim());
}

function mapPackToDraft(
  pack: FactCardsPack,
  options?: { packIdOverride?: string; assetUrlById?: Record<string, string> },
): { draft: PackDraft; items: FactDraftItem[] } {
  const assetById = new Map(pack.assets.map((asset) => [asset.id, asset]));
  const resolvedUrlByAssetId = options?.assetUrlById ?? {};
  const thumbnailRef = pack.settings?.packThumbnailImageRef;
  const resolvedThumbnailPath = thumbnailRef
    ? (resolvedUrlByAssetId[thumbnailRef] ?? assetById.get(thumbnailRef)?.path ?? "")
    : "";
  const isThumbnailDataUrl = resolvedThumbnailPath.startsWith("data:image/");
  const mappedItems: FactDraftItem[] = pack.items.map((item) => {
    const distractors = item.distractors ?? [];
    const resolvedImagePath = item.media?.imageRef
      ? (resolvedUrlByAssetId[item.media.imageRef] ?? assetById.get(item.media.imageRef)?.path ?? "")
      : "";
    const resolvedAudioPath = item.media?.promptAudioRef
      ? (resolvedUrlByAssetId[item.media.promptAudioRef] ?? assetById.get(item.media.promptAudioRef)?.path ?? "")
      : "";
    const isImageDataUrl = resolvedImagePath.startsWith("data:image/");
    return {
      id: item.id,
      topic: item.topic,
      prompt: item.prompt,
      answer: item.answer,
      optionA: distractors[0] ?? "",
      optionB: distractors[1] ?? "",
      optionC: distractors[2] ?? "",
      hint: item.hints?.[0] ?? "",
      imageLink: isImageDataUrl ? "" : resolvedImagePath,
      imageDataUrl: isImageDataUrl ? resolvedImagePath : undefined,
      audioDataUrl: resolvedAudioPath || undefined,
    };
  });

  return {
    draft: {
      packId: options?.packIdOverride ?? pack.packId,
      title: pack.title,
      description: pack.description ?? "",
      language: pack.language,
      ageBand: pack.ageBand,
      topicsCsv: pack.topics.join(", "),
      thumbnailLink: isThumbnailDataUrl ? "" : resolvedThumbnailPath,
      thumbnailDataUrl: isThumbnailDataUrl ? resolvedThumbnailPath : undefined,
    },
    items: mappedItems.length > 0 ? mappedItems : [defaultFactItem()],
  };
}

function buildPackFromDraft(draft: PackDraft, sourceItems: FactDraftItem[]): BrightStepsPack {
  const topics = draft.topicsCsv
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);

  const assets: BrightStepsPack["assets"] = [];
  const settings: NonNullable<BrightStepsPack["settings"]> = {
    defaultSupportLevel: 2,
    audioEnabledByDefault: false,
  };

  const packThumbnailSource = draft.thumbnailDataUrl || draft.thumbnailLink.trim();
  if (packThumbnailSource) {
    const thumbnailId = "pack_thumbnail_image";
    assets.push({
      id: thumbnailId,
      kind: "image",
      path: packThumbnailSource,
      alt: `Thumbnail for ${draft.title.trim() || "FactCards pack"}`,
    });
    settings.packThumbnailImageRef = thumbnailId;
  }

  const factItems = sourceItems.map((item) => {
    const media: { imageRef?: string; promptAudioRef?: string } = {};
    const imageSource = item.imageDataUrl || item.imageLink.trim();
    if (imageSource) {
      const imageId = `${item.id}_image`;
      assets.push({
        id: imageId,
        kind: "image",
        path: imageSource,
        alt: item.prompt.trim() || "Fact card image",
      });
      media.imageRef = imageId;
    }

    const audioSource = item.audioDataUrl;
    if (audioSource) {
      const audioId = `${item.id}_audio`;
      assets.push({
        id: audioId,
        kind: "audio",
        path: audioSource,
        transcript: item.prompt.trim() || undefined,
      });
      media.promptAudioRef = audioId;
    }

    const distractors = [item.optionA, item.optionB, item.optionC]
      .map((option) => option.trim())
      .filter((option) => option.length > 0 && option.toLowerCase() !== item.answer.trim().toLowerCase());

    return {
      id: item.id.trim(),
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
    packId: draft.packId.trim(),
    moduleType: "factcards",
    title: draft.title.trim(),
    description: draft.description.trim() || undefined,
    version: "1.0.0",
    language: draft.language.trim() || "en",
    ageBand: draft.ageBand.trim() || "6-10",
    topics: topics.length > 0 ? topics : ["general"],
    settings,
    assets,
    items: factItems,
  };
}

function buildEditorSnapshot(params: {
  draft: PackDraft;
  items: FactDraftItem[];
  createMethod: "ui" | "json";
  uploadText: string;
}): string {
  return JSON.stringify(params);
}

function withResolvedAssetPaths(pack: FactCardsPack, assetUrlById: Record<string, string>): FactCardsPack {
  return {
    ...pack,
    assets: pack.assets.map((asset) => ({
      ...asset,
      path: assetUrlById[asset.id] ?? asset.path,
    })),
  };
}

type Props = {
  mode: Mode;
  packRef?: string;
  source?: "builtin" | "custom";
};

export function FactCardsPackEditor({ mode, packRef, source = "builtin" }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<PackDraft>(defaultPackDraft());
  const [items, setItems] = useState<FactDraftItem[]>([defaultFactItem()]);
  const [createMethod, setCreateMethod] = useState<"ui" | "json">("ui");
  const [uploadText, setUploadText] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [status, setStatus] = useState<string>("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [loading, setLoading] = useState(mode === "edit");

  const title = useMemo(() => (mode === "create" ? "Create FactCards Pack" : "Edit FactCards Pack"), [mode]);
  const editorSnapshot = useMemo(
    () => buildEditorSnapshot({ draft, items, createMethod, uploadText }),
    [draft, items, createMethod, uploadText],
  );
  const generatedPackFromUi = useMemo(() => buildPackFromDraft(draft, items.filter(isCardTouched)), [draft, items]);
  const generatedJsonFromUi = useMemo(() => JSON.stringify(generatedPackFromUi, null, 2), [generatedPackFromUi]);
  const hasUnsavedChanges = Boolean(savedSnapshot && editorSnapshot !== savedSnapshot);

  useEffect(() => {
    let cancelled = false;

    async function loadForEdit() {
      if (mode !== "edit" || !packRef) {
        return;
      }

      setLoading(true);
      setStatus("");
      setDraft(defaultPackDraft());
      setItems([defaultFactItem()]);
      setUploadText("");

      let pack: FactCardsPack | null = null;
      if (source === "custom") {
        const record = await db.customPacks.get(packRef);
        if (record?.payload.moduleType === "factcards") {
          pack = record.payload;
        }
      } else {
        try {
          const payload = await fetchPack(packRef);
          if (payload.pack.moduleType === "factcards") {
            pack = payload.pack;
            const mapped = mapPackToDraft(payload.pack, {
              packIdOverride: `${payload.pack.packId}-custom`,
              assetUrlById: payload.assetUrlById,
            });
            const resolvedPackWithOverride: FactCardsPack = {
              ...withResolvedAssetPaths(payload.pack, payload.assetUrlById),
              packId: `${payload.pack.packId}-custom`,
            };
            const resolvedPackJson = JSON.stringify(resolvedPackWithOverride, null, 2);
            const nextSnapshot = buildEditorSnapshot({
              draft: mapped.draft,
              items: mapped.items,
              createMethod: "ui",
              uploadText: resolvedPackJson,
            });

            if (!cancelled) {
              setDraft(mapped.draft);
              setItems(mapped.items);
              setCreateMethod("ui");
              setUploadText(resolvedPackJson);
              setSavedSnapshot(nextSnapshot);
              setLoading(false);
            }
            return;
          }
        } catch {
          pack = null;
        }
      }

      if (!pack) {
        if (!cancelled) {
          setStatus("Pack could not be loaded for editing.");
          setLoading(false);
        }
        return;
      }

      const mapped = mapPackToDraft(pack, {
        packIdOverride: source === "builtin" ? `${pack.packId}-custom` : pack.packId,
      });
      const initialJson = JSON.stringify(pack, null, 2);
      const nextSnapshot = buildEditorSnapshot({
        draft: mapped.draft,
        items: mapped.items,
        createMethod: "ui",
        uploadText: initialJson,
      });

      if (!cancelled) {
        setDraft(mapped.draft);
        setItems(mapped.items);
        setCreateMethod("ui");
        setUploadText(initialJson);
        setSavedSnapshot(nextSnapshot);
        setLoading(false);
      }
    }

    void loadForEdit();

    return () => {
      cancelled = true;
    };
  }, [mode, packRef, source]);

  useEffect(() => {
    if (loading || savedSnapshot) {
      return;
    }
    setSavedSnapshot(editorSnapshot);
  }, [loading, savedSnapshot, editorSnapshot]);

  function buildPackFromUi(sourceItems: FactDraftItem[]): BrightStepsPack {
    return buildPackFromDraft(draft, sourceItems);
  }

  async function validateAndSave(candidate: unknown): Promise<BrightStepsPack | null> {
    const result = validatePack(candidate);
    if (!result.success) {
      setStatus(`Validation failed: ${result.issues.map((issue) => `${issue.path} ${issue.message}`).join(" | ")}`);
      return null;
    }

    setSaveBusy(true);
    try {
      await saveCustomPack(result.data);
      setStatus(`Saved pack \"${result.data.title}\" to local memory.`);
      return result.data;
    } catch (error) {
      setStatus(`Save failed: ${error instanceof Error ? error.message : "Unknown error."}`);
      return null;
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleSaveFromUi(options?: { navigateOnSuccess?: boolean }): Promise<boolean> {
    const navigateOnSuccess = options?.navigateOnSuccess ?? true;
    const touchedCards = items.filter(isCardTouched);
    if (touchedCards.length === 0) {
      setStatus("Add at least one card with a question and answer before saving.");
      return false;
    }

    const invalidCardNumbers = items
      .map((item, index) => ({ item, number: index + 1 }))
      .filter(({ item }) => isCardTouched(item) && !isCardComplete(item))
      .map(({ number }) => number);

    if (invalidCardNumbers.length > 0) {
      setStatus(`Complete question and answer for card(s): ${invalidCardNumbers.join(", ")}.`);
      return false;
    }

    const saved = await validateAndSave(buildPackFromUi(touchedCards));
    if (!saved) {
      return false;
    }

    setSavedSnapshot(editorSnapshot);
    if (navigateOnSuccess) {
      router.push("/settings/factcards");
    }
    return true;
  }

  async function handleJsonUpload(file: File) {
    const text = await file.text();
    setUploadText(text);
    setCreateMethod("json");
    setStatus("JSON file loaded. Review or apply it to the UI editor.");
  }

  function parseJsonFromText(text: string): FactCardsPack | null {
    try {
      const parsed = JSON.parse(text);
      const result = validatePack(parsed);
      if (!result.success) {
        setStatus(`Validation failed: ${result.issues.map((issue) => `${issue.path} ${issue.message}`).join(" | ")}`);
        return null;
      }
      if (result.data.moduleType !== "factcards") {
        setStatus("This JSON pack is not a FactCards module.");
        return null;
      }
      return result.data;
    } catch {
      setStatus("JSON parsing failed. Check syntax and try again.");
      return null;
    }
  }

  function applyPackToUi(pack: FactCardsPack) {
    const mapped = mapPackToDraft(pack);
    setDraft(mapped.draft);
    setItems(mapped.items);
    setCreateMethod("ui");
    setUploadText(JSON.stringify(pack, null, 2));
  }

  function handleApplyJsonToUi() {
    const pack = parseJsonFromText(uploadText);
    if (!pack) {
      return;
    }
    applyPackToUi(pack);
    setStatus("JSON loaded into the UI editor. You can now edit fields visually.");
  }

  async function handleSaveFromJson(options?: { navigateOnSuccess?: boolean }): Promise<boolean> {
    const navigateOnSuccess = options?.navigateOnSuccess ?? true;
    const pack = parseJsonFromText(uploadText);
    if (!pack) {
      return false;
    }

    const saved = await validateAndSave(pack);
    if (!saved) {
      return false;
    }

    setSavedSnapshot(editorSnapshot);
    if (navigateOnSuccess) {
      router.push("/settings/factcards");
    }
    return true;
  }

  function handleBackClick() {
    if (hasUnsavedChanges) {
      setShowLeaveModal(true);
      return;
    }
    router.push("/settings/factcards");
  }

  function handleLeaveWithoutSaving() {
    setShowLeaveModal(false);
    router.push("/settings/factcards");
  }

  async function handleSaveAndLeave() {
    const ok =
      createMethod === "json"
        ? await handleSaveFromJson({ navigateOnSuccess: false })
        : await handleSaveFromUi({ navigateOnSuccess: false });
    if (ok) {
      setShowLeaveModal(false);
      router.push("/settings/factcards");
    }
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <button
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={handleBackClick}
              type="button"
            >
              Back to FactCards
            </button>
            <h2 className="mt-3 text-xl font-black text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {mode === "create"
                ? "Choose UI mode for form-based creation or JSON mode for direct upload."
                : `Editing source: ${source}. Saving writes to local memory packs.`}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              hasUnsavedChanges ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {hasUnsavedChanges ? "Unsaved changes" : "All changes saved"}
          </span>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            className={`rounded px-3 py-1 text-xs font-semibold ${
              createMethod === "ui" ? "bg-[#2badee]/10 text-[#2badee]" : "bg-slate-100 text-slate-600"
            }`}
            onClick={() => {
              setCreateMethod("ui");
              setStatus("");
            }}
            type="button"
          >
            {mode === "create" ? "Create via UI" : "Edit via UI"}
          </button>
          <button
            className={`rounded px-3 py-1 text-xs font-semibold ${
              createMethod === "json" ? "bg-[#2badee]/10 text-[#2badee]" : "bg-slate-100 text-slate-600"
            }`}
            onClick={() => {
              setCreateMethod("json");
              setStatus("");
            }}
            type="button"
          >
            {mode === "create" ? "Create via JSON" : "Edit via JSON"}
          </button>
        </div>
      </div>

      {createMethod === "ui" && (
        <section className="card p-5">
          {loading ? (
            <p className="text-sm text-slate-600">Loading editor...</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm text-slate-700" htmlFor="pack-id">
                  <span className="font-semibold">Pack ID</span>
                  <input
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    id="pack-id"
                    onChange={(event) => setDraft((prev) => ({ ...prev, packId: event.target.value }))}
                    placeholder="factcards-my-pack-001"
                    value={draft.packId}
                  />
                </label>
                <label className="space-y-1 text-sm text-slate-700" htmlFor="pack-title">
                  <span className="font-semibold">Pack title</span>
                  <input
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    id="pack-title"
                    onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Pack title"
                    value={draft.title}
                  />
                </label>
              </div>

              <label className="space-y-1 text-sm text-slate-700" htmlFor="pack-description">
                <span className="font-semibold">Description</span>
                <textarea
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  id="pack-description"
                  onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Description"
                  rows={2}
                  value={draft.description}
                />
              </label>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Pack thumbnail</p>
                <p className="mt-1 text-xs text-slate-600">
                  This image appears on the FactCards pack menu card. Use a web link or upload from your computer.
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <label className="space-y-1 text-sm text-slate-700" htmlFor="pack-thumbnail-link">
                    <span className="font-semibold">Thumbnail link (internet URL)</span>
                    <input
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      id="pack-thumbnail-link"
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          thumbnailLink: event.target.value,
                          thumbnailDataUrl: undefined,
                        }))
                      }
                      placeholder="https://example.com/globe.png"
                      value={draft.thumbnailLink}
                    />
                  </label>

                  <div className="flex flex-wrap items-end gap-2">
                    <input
                      accept="image/*"
                      className="sr-only"
                      id="pack-thumbnail-upload"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }
                        void (async () => {
                          const data = await fileToDataUrl(file);
                          setDraft((prev) => ({ ...prev, thumbnailDataUrl: data }));
                        })();
                      }}
                      type="file"
                    />
                    <label
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#2badee] hover:bg-[#2badee]/5"
                      htmlFor="pack-thumbnail-upload"
                    >
                      <UploadImageIcon />
                      Upload thumbnail
                    </label>
                    <button
                      className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      onClick={() => setDraft((prev) => ({ ...prev, thumbnailLink: "", thumbnailDataUrl: undefined }))}
                      type="button"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {draft.thumbnailDataUrl || draft.thumbnailLink.trim() ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
                    <p className="text-xs font-semibold text-slate-700">Thumbnail preview</p>
                    <div className="relative mt-2 h-44 w-full overflow-hidden rounded-md border border-slate-200 md:h-52">
                      <Image
                        alt="FactCards pack thumbnail preview"
                        className="object-cover"
                        fill
                        loader={({ src }) => src}
                        sizes="(max-width: 768px) 100vw, 50vw"
                        src={draft.thumbnailDataUrl || draft.thumbnailLink.trim()}
                        unoptimized
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="space-y-1 text-sm text-slate-700" htmlFor="pack-language">
                  <span className="font-semibold">Language</span>
                  <input
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    id="pack-language"
                    onChange={(event) => setDraft((prev) => ({ ...prev, language: event.target.value }))}
                    placeholder="en"
                    value={draft.language}
                  />
                </label>
                <label className="space-y-1 text-sm text-slate-700" htmlFor="pack-age-band">
                  <span className="font-semibold">Age band</span>
                  <input
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    id="pack-age-band"
                    onChange={(event) => setDraft((prev) => ({ ...prev, ageBand: event.target.value }))}
                    placeholder="6-10"
                    value={draft.ageBand}
                  />
                </label>
                <label className="space-y-1 text-sm text-slate-700" htmlFor="pack-topics">
                  <span className="font-semibold">Topics (comma separated)</span>
                  <input
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    id="pack-topics"
                    onChange={(event) => setDraft((prev) => ({ ...prev, topicsCsv: event.target.value }))}
                    placeholder="general, animals"
                    value={draft.topicsCsv}
                  />
                </label>
              </div>

              <div className="space-y-3">
                {items.map((item, index) => (
                  <article className="rounded-lg border border-slate-200 p-3" key={item.id}>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-bold uppercase text-slate-500">Card {index + 1}</p>
                      <button
                        aria-label={`Delete card ${index + 1}`}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                        onClick={() => {
                          setItems((prev) => prev.filter((entry) => entry.id !== item.id));
                          setStatus("");
                        }}
                        type="button"
                      >
                        <DeleteCardIcon />
                        Delete
                      </button>
                    </div>
                    <label className="mb-2 block space-y-1 text-sm text-slate-700" htmlFor={`topic-${item.id}`}>
                      <span className="font-semibold">Topic</span>
                      <input
                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                        id={`topic-${item.id}`}
                        onChange={(event) =>
                          setItems((prev) =>
                            prev.map((entry, i) => (i === index ? { ...entry, topic: event.target.value } : entry)),
                          )
                        }
                        placeholder="general"
                        value={item.topic}
                      />
                    </label>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <label className="space-y-1 text-sm text-slate-700" htmlFor={`prompt-${item.id}`}>
                        <span className="font-semibold">Question prompt</span>
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          id={`prompt-${item.id}`}
                          onChange={(event) =>
                            setItems((prev) =>
                              prev.map((entry, i) => (i === index ? { ...entry, prompt: event.target.value } : entry)),
                            )
                          }
                          placeholder="Question prompt"
                          value={item.prompt}
                        />
                      </label>
                      <label className="space-y-1 text-sm text-slate-700" htmlFor={`answer-${item.id}`}>
                        <span className="font-semibold">Correct answer</span>
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          id={`answer-${item.id}`}
                          onChange={(event) =>
                            setItems((prev) =>
                              prev.map((entry, i) => (i === index ? { ...entry, answer: event.target.value } : entry)),
                            )
                          }
                          placeholder="Correct answer"
                          value={item.answer}
                        />
                      </label>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <label className="space-y-1 text-sm text-slate-700" htmlFor={`option-a-${item.id}`}>
                        <span className="font-semibold">Option A</span>
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          id={`option-a-${item.id}`}
                          onChange={(event) =>
                            setItems((prev) =>
                              prev.map((entry, i) => (i === index ? { ...entry, optionA: event.target.value } : entry)),
                            )
                          }
                          placeholder="Option A"
                          value={item.optionA}
                        />
                      </label>
                      <label className="space-y-1 text-sm text-slate-700" htmlFor={`option-b-${item.id}`}>
                        <span className="font-semibold">Option B</span>
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          id={`option-b-${item.id}`}
                          onChange={(event) =>
                            setItems((prev) =>
                              prev.map((entry, i) => (i === index ? { ...entry, optionB: event.target.value } : entry)),
                            )
                          }
                          placeholder="Option B"
                          value={item.optionB}
                        />
                      </label>
                      <label className="space-y-1 text-sm text-slate-700" htmlFor={`option-c-${item.id}`}>
                        <span className="font-semibold">Option C</span>
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          id={`option-c-${item.id}`}
                          onChange={(event) =>
                            setItems((prev) =>
                              prev.map((entry, i) => (i === index ? { ...entry, optionC: event.target.value } : entry)),
                            )
                          }
                          placeholder="Option C"
                          value={item.optionC}
                        />
                      </label>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <label className="space-y-1 text-sm text-slate-700" htmlFor={`hint-${item.id}`}>
                        <span className="font-semibold">Hint</span>
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          id={`hint-${item.id}`}
                          onChange={(event) =>
                            setItems((prev) =>
                              prev.map((entry, i) => (i === index ? { ...entry, hint: event.target.value } : entry)),
                            )
                          }
                          placeholder="Hint"
                          value={item.hint}
                        />
                      </label>
                      <label className="space-y-1 text-sm text-slate-700" htmlFor={`image-link-${item.id}`}>
                        <span className="font-semibold">Image link (internet URL)</span>
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          id={`image-link-${item.id}`}
                          onChange={(event) =>
                            setItems((prev) =>
                              prev.map((entry, i) => (i === index ? { ...entry, imageLink: event.target.value } : entry)),
                            )
                          }
                          placeholder="https://example.com/photo.jpg"
                          value={item.imageLink}
                        />
                      </label>
                    </div>

                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Media source</p>
                      <p className="mt-1 text-xs text-slate-600">
                        For images, use either an internet link above or upload from your computer below.
                      </p>

                      {item.imageDataUrl || item.imageLink.trim() ? (
                        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
                          <p className="text-xs font-semibold text-slate-700">Image preview</p>
                          <div className="relative mt-2 h-44 w-full overflow-hidden rounded-md border border-slate-200 md:h-52">
                            <Image
                              alt={`Preview for card ${index + 1}`}
                              className="object-cover"
                              fill
                              loader={({ src }) => src}
                              sizes="(max-width: 768px) 100vw, 50vw"
                              src={item.imageDataUrl || item.imageLink.trim()}
                              unoptimized
                            />
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                        <input
                          accept="image/*"
                          className="sr-only"
                          id={`image-upload-${item.id}`}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) {
                              return;
                            }
                            void (async () => {
                              const data = await fileToDataUrl(file);
                              setItems((prev) =>
                                prev.map((entry, i) => (i === index ? { ...entry, imageDataUrl: data } : entry)),
                              );
                            })();
                          }}
                          type="file"
                        />
                        <label
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#2badee] hover:bg-[#2badee]/5"
                          htmlFor={`image-upload-${item.id}`}
                        >
                          <UploadImageIcon />
                          Upload image from computer
                        </label>

                        <input
                          accept="audio/*"
                          className="sr-only"
                          id={`audio-upload-${item.id}`}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) {
                              return;
                            }
                            void (async () => {
                              const data = await fileToDataUrl(file);
                              setItems((prev) =>
                                prev.map((entry, i) => (i === index ? { ...entry, audioDataUrl: data } : entry)),
                              );
                            })();
                          }}
                          type="file"
                        />
                        <label
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-500 hover:bg-emerald-50"
                          htmlFor={`audio-upload-${item.id}`}
                        >
                          <UploadAudioIcon />
                          Upload audio from computer
                        </label>
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-600 md:grid-cols-2">
                        <p>{item.imageDataUrl ? "Image upload selected." : "No image upload selected yet."}</p>
                        <p>{item.audioDataUrl ? "Audio upload selected." : "No audio upload selected yet."}</p>
                      </div>
                    </div>
                  </article>
                ))}
                {items.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                    No cards yet. Click Add Card to create one.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                  onClick={() => setItems((prev) => [...prev, defaultFactItem()])}
                  type="button"
                >
                  Add Card
                </button>
                <button
                  className={`rounded px-3 py-1 text-xs font-bold text-white ${saveBusy ? "bg-slate-400" : "bg-[#2badee]"}`}
                  disabled={saveBusy}
                  onClick={() => void handleSaveFromUi()}
                  type="button"
                >
                  {saveBusy ? "Saving..." : "Save Pack"}
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">Live JSON from UI</h4>
                <p className="mt-1 text-xs text-slate-600">
                  This JSON updates automatically as you edit cards, including add/remove actions.
                </p>
                <textarea
                  className="mt-2 h-52 w-full rounded-lg border border-slate-300 p-2 font-mono text-[11px]"
                  readOnly
                  value={generatedJsonFromUi}
                />
              </div>
            </div>
          )}
        </section>
      )}

      <section className="card p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">JSON Workspace</h3>
        <p className="mt-1 text-sm text-slate-600">
          {mode === "create"
            ? "Upload JSON packs, save directly, or apply JSON into the UI editor for visual editing."
            : "Edit this existing deck directly in JSON, then apply to UI or save back to local memory."}
        </p>

        <label className="mt-3 block text-sm text-slate-700">
          Upload JSON file
          <input
            accept="application/json,.json"
            className="mt-1 block w-full"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleJsonUpload(file);
              }
            }}
            type="file"
          />
        </label>

        <textarea
          className="mt-3 h-56 w-full rounded-lg border border-slate-300 p-2 text-xs"
          onChange={(event) => {
            setCreateMethod("json");
            setUploadText(event.target.value);
          }}
          placeholder="Paste FactCards JSON here"
          value={uploadText}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
            onClick={() => {
              setCreateMethod("json");
              setUploadText(generatedJsonFromUi);
              setStatus("Loaded current UI JSON into the editable JSON workspace.");
            }}
            type="button"
          >
            Load current UI JSON
          </button>
          <button
            className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
            onClick={handleApplyJsonToUi}
            type="button"
          >
            Apply JSON to UI
          </button>
          <button
            className={`rounded px-3 py-2 text-xs font-bold text-white ${saveBusy ? "bg-slate-400" : "bg-[#2badee]"}`}
            disabled={saveBusy}
            onClick={() => void handleSaveFromJson()}
            type="button"
          >
            {saveBusy ? "Saving..." : "Save JSON Pack"}
          </button>
          {mode === "create" && createMethod === "ui" ? (
            <p className="self-center text-xs text-slate-500">
              Tip: switch to <strong>JSON mode</strong> above when you want to author directly in JSON.
            </p>
          ) : null}
        </div>

        <h4 className="mt-5 text-xs font-bold uppercase text-slate-600">Example JSON Format</h4>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">
          <code>{EXAMPLE_JSON}</code>
        </pre>
      </section>

      {status ? <p className="text-sm text-slate-700">{status}</p> : null}

      {showLeaveModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Unsaved changes</h3>
            <p className="mt-1 text-sm text-slate-600">
              You have unsaved changes. Save this pack before leaving, or leave without saving.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                onClick={() => setShowLeaveModal(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700"
                onClick={handleLeaveWithoutSaving}
                type="button"
              >
                Leave without saving
              </button>
              <button
                className={`rounded px-3 py-2 text-xs font-bold text-white ${saveBusy ? "bg-slate-400" : "bg-[#2badee]"}`}
                disabled={saveBusy}
                onClick={() => void handleSaveAndLeave()}
                type="button"
              >
                {saveBusy ? "Saving..." : "Save and leave"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
