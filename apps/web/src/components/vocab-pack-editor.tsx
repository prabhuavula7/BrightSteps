"use client";

import {
  createVocabPack,
  fetchVocabPack,
  generateVocabPack,
  saveVocabPack,
  type VocabPackResponse,
} from "@/lib/api";
import {
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  Mic,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Mode = "create" | "edit";

type Props = {
  mode: Mode;
  packRef?: string;
};

type DraftMeta = {
  packId: string;
  title: string;
  description: string;
  language: string;
  ageBand: string;
  topicsCsv: string;
};

type WordView = {
  id: string;
  topic: string;
  word: string;
  syllables: string[];
  definition: string;
  exampleSentence: string;
  audioRef?: string;
  imageRef?: string;
  imageSrc?: string;
};

const JSON_EXAMPLE = `{
  "schemaVersion": "2.0.0",
  "packId": "vocabvoice-custom-001",
  "moduleType": "vocabvoice",
  "title": "Everyday Words",
  "description": "Word pronunciation and definition practice",
  "version": "1.0.0",
  "language": "en",
  "ageBand": "6-10",
  "topics": ["daily life"],
  "settings": {
    "defaultSupportLevel": 2,
    "audioEnabledByDefault": true,
    "packThumbnailImageRef": "pack_thumbnail_image"
  },
  "assets": [
    {
      "id": "pack_thumbnail_image",
      "kind": "image",
      "path": "https://example.com/vocab-pack-thumb.jpg",
      "alt": "Alphabet blocks and a book"
    },
    {
      "id": "vw_img_happy",
      "kind": "image",
      "path": "https://example.com/happy-word.jpg",
      "alt": "Child smiling while playing"
    },
    {
      "id": "vv_asset_example",
      "kind": "audio",
      "path": "https://example.com/happy-pronunciation.mp3",
      "transcript": "happy"
    }
  ],
  "items": [
    {
      "id": "vw_001",
      "type": "vocabword",
      "topic": "daily life",
      "word": "happy",
      "syllables": ["hap", "py"],
      "definition": "Happy means feeling good and glad.",
      "exampleSentence": "I feel happy when I play with my family.",
      "review": {
        "sentencePrompt": "Say the word happy.",
        "acceptedPronunciations": ["happy"]
      },
      "hints": ["Say it slowly", "Break it into parts"],
      "media": {
        "pronunciationAudioRef": "vv_asset_example",
        "imageRef": "vw_img_happy"
      }
    }
  ]
}`;
const PACK_THUMBNAIL_ASSET_ID = "pack_thumbnail_image";

function createLocalPack(packId: string): Record<string, unknown> {
  return {
    schemaVersion: "2.0.0",
    packId,
    moduleType: "vocabvoice",
    title: "New Vocabulary Pack",
    description: "",
    version: "1.0.0",
    language: "en",
    ageBand: "6-10",
    topics: ["general"],
    settings: {
      defaultSupportLevel: 2,
      audioEnabledByDefault: true,
    },
    assets: [],
    items: [],
  };
}

function clonePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return createLocalPack(`vocab-${Date.now().toString(36)}`);
  }

  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function readThumbnailFromPayload(payload: Record<string, unknown>): { link: string; dataUrl?: string } {
  const settings =
    payload.settings && typeof payload.settings === "object" ? (payload.settings as Record<string, unknown>) : null;
  const thumbnailRef =
    settings && typeof settings.packThumbnailImageRef === "string" ? settings.packThumbnailImageRef : "";
  if (!thumbnailRef) {
    return { link: "" };
  }

  const assets = Array.isArray(payload.assets) ? payload.assets : [];
  const thumbnailAsset = assets.find((asset) => {
    if (!asset || typeof asset !== "object") {
      return false;
    }
    const record = asset as Record<string, unknown>;
    return record.id === thumbnailRef && record.kind === "image" && typeof record.path === "string";
  }) as Record<string, unknown> | undefined;

  const path = thumbnailAsset && typeof thumbnailAsset.path === "string" ? thumbnailAsset.path : "";
  if (!path) {
    return { link: "" };
  }

  if (path.startsWith("data:image/")) {
    return { link: "", dataUrl: path };
  }

  return { link: path };
}

function withPackThumbnail(
  payload: Record<string, unknown>,
  source: string | undefined,
  title: string,
): Record<string, unknown> {
  const next = clonePayload(payload);
  const settings =
    next.settings && typeof next.settings === "object" ? { ...(next.settings as Record<string, unknown>) } : {};
  const assets = Array.isArray(next.assets) ? [...next.assets] : [];
  const trimmedSource = source?.trim() ?? "";
  const nextAssets = assets.filter((asset) => {
    if (!asset || typeof asset !== "object") {
      return true;
    }
    return (asset as Record<string, unknown>).id !== PACK_THUMBNAIL_ASSET_ID;
  });

  if (trimmedSource) {
    nextAssets.push({
      id: PACK_THUMBNAIL_ASSET_ID,
      kind: "image",
      path: trimmedSource,
      alt: `Thumbnail for ${title.trim() || "VocabVoice pack"}`,
    });
    settings.packThumbnailImageRef = PACK_THUMBNAIL_ASSET_ID;
  } else {
    delete settings.packThumbnailImageRef;
  }

  next.settings = settings;
  next.assets = nextAssets;
  return next;
}

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function toDraftMeta(payload: Record<string, unknown>): DraftMeta {
  return {
    packId: typeof payload.packId === "string" ? payload.packId : "",
    title: typeof payload.title === "string" ? payload.title : "New Vocabulary Pack",
    description: typeof payload.description === "string" ? payload.description : "",
    language: typeof payload.language === "string" ? payload.language : "en",
    ageBand: typeof payload.ageBand === "string" ? payload.ageBand : "6-10",
    topicsCsv: Array.isArray(payload.topics) ? payload.topics.map((topic) => String(topic)).join(", ") : "general",
  };
}

function toWordViews(payload: Record<string, unknown> | null): WordView[] {
  if (!payload) {
    return [];
  }

  const assets = Array.isArray(payload.assets) ? payload.assets : [];
  const imageById = new Map<string, string>();
  for (const asset of assets) {
    if (!asset || typeof asset !== "object") {
      continue;
    }
    const record = asset as Record<string, unknown>;
    if (record.kind === "image" && typeof record.id === "string" && typeof record.path === "string") {
      imageById.set(record.id, record.path);
    }
  }

  const items = Array.isArray(payload.items) ? payload.items : [];

  return items
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      const media = item.media && typeof item.media === "object" ? (item.media as Record<string, unknown>) : null;
      const imageRef = media && typeof media.imageRef === "string" ? media.imageRef : undefined;

      return {
        id: String(item.id ?? ""),
        topic: String(item.topic ?? "general"),
        word: String(item.word ?? ""),
        syllables: Array.isArray(item.syllables)
          ? item.syllables.map((value) => String(value ?? "").trim()).filter(Boolean)
          : [],
        definition: String(item.definition ?? "").trim(),
        exampleSentence: String(item.exampleSentence ?? "").trim(),
        audioRef: media && typeof media.pronunciationAudioRef === "string" ? media.pronunciationAudioRef : undefined,
        imageRef,
        imageSrc: imageRef ? imageById.get(imageRef) : undefined,
      };
    })
    .filter((item) => item.id.length > 0);
}

function toWordId(index: number): string {
  return `vw_${String(index + 1).padStart(3, "0")}`;
}

function buildWordDraft(id: string, word: string, topic = "general"): Record<string, unknown> {
  const cleanWord = word.trim();
  return {
    id,
    type: "vocabword",
    topic,
    word: cleanWord,
    syllables: [],
    definition: "",
    exampleSentence: "",
    review: {
      sentencePrompt: "",
      acceptedPronunciations: cleanWord ? [cleanWord.toLowerCase()] : [],
    },
    hints: [],
    media: {
      pronunciationAudioRef: "",
    },
  };
}

export function VocabPackEditor({ mode, packRef }: Props) {
  const router = useRouter();
  const [initialPackSeed] = useState(() => packRef ?? `vocab-${Date.now().toString(36)}`);
  const [packId, setPackId] = useState(packRef ?? "");
  const [packPayload, setPackPayload] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<DraftMeta>({
    packId: initialPackSeed,
    title: "New Vocabulary Pack",
    description: "",
    language: "en",
    ageBand: "6-10",
    topicsCsv: "general",
  });
  const [editorMode, setEditorMode] = useState<"ui" | "json">("ui");
  const [jsonText, setJsonText] = useState("");
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [thumbnailLink, setThumbnailLink] = useState("");
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | undefined>();

  const words = useMemo(() => toWordViews(packPayload), [packPayload]);
  const thumbnailPreviewSrc = thumbnailDataUrl || thumbnailLink.trim();

  function setPayload(nextPayload: Record<string, unknown>) {
    setPackPayload(nextPayload);
    setJsonText(toPrettyJson(nextPayload));
    setDraft(toDraftMeta(nextPayload));
    const thumbnail = readThumbnailFromPayload(nextPayload);
    setThumbnailLink(thumbnail.link);
    setThumbnailDataUrl(thumbnail.dataUrl);
  }

  function updatePayload(mutator: (draftPayload: Record<string, unknown>) => void) {
    setPackPayload((previous) => {
      const base = clonePayload(previous ?? createLocalPack(draft.packId));
      mutator(base);
      setJsonText(toPrettyJson(base));
      setDraft(toDraftMeta(base));
      return base;
    });
  }

  function updatePackThumbnail(params: { link?: string; dataUrl?: string }) {
    const nextLink = params.link ?? "";
    const nextDataUrl = params.dataUrl;
    const source = nextDataUrl || nextLink.trim();
    setThumbnailLink(nextDataUrl ? "" : nextLink);
    setThumbnailDataUrl(nextDataUrl);

    updatePayload((next) => {
      const withThumbnail = withPackThumbnail(next, source, draft.title);
      Object.keys(next).forEach((key) => {
        delete next[key];
      });
      Object.assign(next, withThumbnail);
    });
  }

  async function handleThumbnailUpload(file: File | null) {
    if (!file) {
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      updatePackThumbnail({ dataUrl });
      setError("");
      setStatus("Pack thumbnail updated.");
    } catch (thumbnailError) {
      setError(thumbnailError instanceof Error ? thumbnailError.message : "Failed to process thumbnail image");
    }
  }

  useEffect(() => {
    if (mode === "edit" && packRef) {
      const editPackId = packRef;
      let cancelled = false;

      async function load() {
        setIsLoading(true);
        setError("");

        try {
          const payload = await fetchVocabPack(editPackId);
          if (cancelled) {
            return;
          }

          const pack = clonePayload(payload.pack);
          setPackId(editPackId);
          setPayload(pack);
        } catch (loadError) {
          if (!cancelled) {
            setError(loadError instanceof Error ? loadError.message : "Failed to load pack");
          }
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      }

      void load();

      return () => {
        cancelled = true;
      };
    }

    if (mode === "create") {
      const initial = createLocalPack(initialPackSeed);
      setPayload(initial);
      setIsLoading(false);
    }
  }, [initialPackSeed, mode, packRef]);

  function updateMeta<K extends keyof DraftMeta>(key: K, value: DraftMeta[K]) {
    updatePayload((next) => {
      next[key] = value;

      if (key === "topicsCsv") {
        next.topics = String(value)
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      }

      if (key === "packId") {
        next.packId = value;
      }
      if (key === "title") {
        next.title = value;
        const thumbnail = readThumbnailFromPayload(next);
        const source = thumbnail.dataUrl || thumbnail.link.trim();
        if (source) {
          const withThumbnail = withPackThumbnail(next, source, String(value));
          Object.keys(next).forEach((entry) => {
            delete next[entry];
          });
          Object.assign(next, withThumbnail);
        }
      }
      if (key === "description") {
        next.description = value;
      }
      if (key === "language") {
        next.language = value;
      }
      if (key === "ageBand") {
        next.ageBand = value;
      }
    });
  }

  function addWordRow() {
    updatePayload((next) => {
      const items = Array.isArray(next.items) ? [...next.items] : [];
      const nextId = toWordId(items.length);
      items.push(buildWordDraft(nextId, "new word"));
      next.items = items;
    });
  }

  function updateWord(itemId: string, patch: { word?: string; topic?: string }) {
    updatePayload((next) => {
      const items = Array.isArray(next.items) ? [...next.items] : [];
      const idx = items.findIndex((entry) => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        return String((entry as Record<string, unknown>).id ?? "") === itemId;
      });
      if (idx < 0) {
        return;
      }

      const row = { ...(items[idx] as Record<string, unknown>) };
      const oldWord = String(row.word ?? "").trim().toLowerCase();
      const existingMedia =
        row.media && typeof row.media === "object" ? { ...(row.media as Record<string, unknown>) } : {};
      const existingImageRef =
        typeof existingMedia.imageRef === "string" && existingMedia.imageRef.trim().length > 0
          ? existingMedia.imageRef
          : "";

      if (typeof patch.word === "string") {
        const cleanWord = patch.word.trim();
        row.word = cleanWord;

        const changed = oldWord !== cleanWord.toLowerCase();
        if (changed) {
          row.syllables = [];
          row.definition = "";
          row.exampleSentence = "";
          row.hints = [];
          row.review = {
            sentencePrompt: "",
            acceptedPronunciations: cleanWord ? [cleanWord.toLowerCase()] : [],
          };
          row.media = {
            pronunciationAudioRef: "",
            imageRef: existingImageRef || undefined,
          };
          row.aiMeta = undefined;
        }
      }

      if (typeof patch.topic === "string") {
        row.topic = patch.topic;
      }

      items[idx] = row;
      next.items = items;
    });
  }

  function updateWordImage(itemId: string, source: string) {
    updatePayload((next) => {
      const items = Array.isArray(next.items) ? [...next.items] : [];
      const assets = Array.isArray(next.assets) ? [...next.assets] : [];
      const itemIndex = items.findIndex((entry) => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        return String((entry as Record<string, unknown>).id ?? "") === itemId;
      });
      if (itemIndex < 0) {
        return;
      }

      const item = { ...(items[itemIndex] as Record<string, unknown>) };
      const media =
        item.media && typeof item.media === "object" ? { ...(item.media as Record<string, unknown>) } : {};
      const currentImageRef =
        typeof media.imageRef === "string" && media.imageRef.trim().length > 0
          ? media.imageRef
          : `${itemId}_image`;
      const cleanSource = source.trim();

      if (!cleanSource) {
        const nextAssets = assets.filter((asset) => {
          if (!asset || typeof asset !== "object") {
            return true;
          }
          return String((asset as Record<string, unknown>).id ?? "") !== currentImageRef;
        });
        delete media.imageRef;
        item.media = media;
        items[itemIndex] = item;
        next.items = items;
        next.assets = nextAssets;
        return;
      }

      const imageAssetIndex = assets.findIndex((asset) => {
        if (!asset || typeof asset !== "object") {
          return false;
        }
        return String((asset as Record<string, unknown>).id ?? "") === currentImageRef;
      });

      const imageAsset = {
        id: currentImageRef,
        kind: "image",
        path: cleanSource,
        alt: `${String(item.word ?? "Vocabulary word").trim() || "Vocabulary word"} illustration`,
      };

      if (imageAssetIndex >= 0) {
        assets[imageAssetIndex] = imageAsset;
      } else {
        assets.push(imageAsset);
      }

      media.imageRef = currentImageRef;
      item.media = media;
      items[itemIndex] = item;
      next.items = items;
      next.assets = assets;
    });
  }

  async function handleWordImageUpload(itemId: string, file: File | null) {
    if (!file) {
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    updateWordImage(itemId, dataUrl);
  }

  function removeWord(itemId: string) {
    updatePayload((next) => {
      const items = Array.isArray(next.items) ? next.items : [];
      next.items = items.filter((entry) => {
        if (!entry || typeof entry !== "object") {
          return true;
        }
        return String((entry as Record<string, unknown>).id ?? "") !== itemId;
      });
    });
  }

  function applyJsonToEditor(): boolean {
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("JSON must be an object");
      }

      setPayload(parsed);
      setError("");
      setStatus("JSON applied to editor.");
      return true;
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Invalid JSON");
      return false;
    }
  }

  function switchEditorMode(nextMode: "ui" | "json") {
    if (nextMode === "json") {
      if (packPayload) {
        setJsonText(toPrettyJson(packPayload));
      }
      setEditorMode("json");
      return;
    }

    if (editorMode === "json") {
      const ok = applyJsonToEditor();
      if (!ok) {
        return;
      }
    }
    setEditorMode("ui");
  }

  async function ensurePackExists(): Promise<string> {
    if (packId) {
      return packId;
    }

    const topics = draft.topicsCsv
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    const created = await createVocabPack({
      packId: draft.packId,
      title: draft.title,
      description: draft.description,
      language: draft.language,
      ageBand: draft.ageBand,
      topics,
    });

    const createdPackId = created.summary.packId;
    setPackId(createdPackId);

    const createdPayload = clonePayload(created.pack);
    setPayload(createdPayload);

    return createdPackId;
  }

  async function handleSave() {
    if (!packPayload) {
      return;
    }

    setIsSaving(true);
    setError("");
    setStatus("");

    try {
      const activePackId = await ensurePackExists();
      const payloadToSave = clonePayload(packPayload);
      payloadToSave.packId = activePackId;
      payloadToSave.moduleType = "vocabvoice";

      const response = await saveVocabPack(activePackId, payloadToSave);
      setPayload(clonePayload(response.pack));
      setStatus("Pack saved.");
      router.push("/settings/vocabulary");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save pack");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerate(itemId?: string) {
    if (!packPayload) {
      return;
    }

    setIsGenerating(true);
    setError("");
    setStatus("");

    try {
      const activePackId = await ensurePackExists();

      const payloadToSave = clonePayload(packPayload);
      payloadToSave.packId = activePackId;
      payloadToSave.moduleType = "vocabvoice";
      await saveVocabPack(activePackId, payloadToSave);

      const response: VocabPackResponse = await generateVocabPack({
        packId: activePackId,
        itemId,
      });

      setPayload(clonePayload(response.pack));
      setStatus(itemId ? "Word processed." : "AI pipeline completed for all words.");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  if (isLoading) {
    return <div className="card p-5 text-sm text-slate-600">Loading VocabVoice pack...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          href="/settings/vocabulary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to packs
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              editorMode === "ui" ? "bg-brand-soft text-brand" : "bg-slate-100 text-slate-700"
            }`}
            onClick={() => switchEditorMode("ui")}
            type="button"
          >
            UI Mode
          </button>
          <button
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              editorMode === "json" ? "bg-brand-soft text-brand" : "bg-slate-100 text-slate-700"
            }`}
            onClick={() => switchEditorMode("json")}
            type="button"
          >
            JSON Mode
          </button>
        </div>
      </div>

      {error ? <div className="card border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
      {status ? (
        <div className="card border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" />
            {status}
          </span>
        </div>
      ) : null}

      <section className="card space-y-4 p-5">
        <h2 className="text-xl font-bold text-slate-900">{mode === "create" ? "Create" : "Edit"} VocabVoice Pack</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-slate-700">Pack ID</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2"
              onChange={(event) => updateMeta("packId", event.target.value)}
              value={draft.packId}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-slate-700">Title</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2"
              onChange={(event) => updateMeta("title", event.target.value)}
              value={draft.title}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="font-semibold text-slate-700">Description</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2"
              onChange={(event) => updateMeta("description", event.target.value)}
              value={draft.description}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-slate-700">Language</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2"
              onChange={(event) => updateMeta("language", event.target.value)}
              value={draft.language}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-slate-700">Age Band</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2"
              onChange={(event) => updateMeta("ageBand", event.target.value)}
              value={draft.ageBand}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="font-semibold text-slate-700">Topics (comma separated)</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2"
              onChange={(event) => updateMeta("topicsCsv", event.target.value)}
              value={draft.topicsCsv}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="font-semibold text-slate-700">Pack Thumbnail URL (optional)</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2"
              onChange={(event) => updatePackThumbnail({ link: event.target.value, dataUrl: undefined })}
              placeholder="https://example.com/thumbnail.jpg"
              value={thumbnailLink}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-brand hover:text-brand">
              <Upload className="h-4 w-4" />
              Upload Thumbnail
              <input
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  void handleThumbnailUpload(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
            <button
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
              onClick={() => updatePackThumbnail({ link: "", dataUrl: undefined })}
              type="button"
            >
              Remove Thumbnail
            </button>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2">
            <p className="text-xs font-semibold text-slate-600">Thumbnail preview</p>
            {thumbnailPreviewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={`${draft.title || "VocabVoice pack"} thumbnail`}
                className="mt-2 h-44 w-full rounded-lg border border-slate-200 object-cover"
                src={thumbnailPreviewSrc}
              />
            ) : (
              <p className="mt-2 text-xs text-slate-500">Add a URL or upload an image to set a pack thumbnail.</p>
            )}
          </div>
        </div>
      </section>

      {editorMode === "json" ? (
        <section className="card space-y-3 p-5">
          <h3 className="text-lg font-bold text-slate-900">JSON Editor</h3>
          <textarea
            className="min-h-[420px] w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
            onChange={(event) => setJsonText(event.target.value)}
            value={jsonText}
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
              onClick={applyJsonToEditor}
              type="button"
            >
              Apply JSON to UI
            </button>
          </div>

          {mode === "create" ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-600">Example format</p>
              <pre className="mt-2 overflow-x-auto rounded-md bg-white p-3 text-[11px] text-slate-700">{JSON_EXAMPLE}</pre>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-slate-900">Words</h3>
            <button
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
              onClick={addWordRow}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Add word
            </button>
          </div>

          {words.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              Add words first, then run AI processing to generate syllables, definitions, and pronunciation audio.
            </div>
          ) : (
            <div className="space-y-3">
              {words.map((word) => (
                <article className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={word.id}>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-semibold text-slate-700">Word</span>
                      <input
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        onChange={(event) => updateWord(word.id, { word: event.target.value })}
                        value={word.word}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-semibold text-slate-700">Topic</span>
                      <input
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        onChange={(event) => updateWord(word.id, { topic: event.target.value })}
                        value={word.topic}
                      />
                    </label>
                    <div className="flex items-end justify-end">
                      <button
                        className="rounded-lg border border-rose-300 px-3 py-2 text-rose-700 hover:bg-rose-50"
                        onClick={() => removeWord(word.id)}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-semibold text-slate-700">Image URL (optional)</span>
                      <input
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        onChange={(event) => updateWordImage(word.id, event.target.value)}
                        placeholder="https://example.com/word-image.jpg"
                        value={word.imageSrc?.startsWith("data:image/") ? "" : (word.imageSrc ?? "")}
                      />
                    </label>
                    <div className="flex items-end gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-brand hover:text-brand">
                        <Upload className="h-4 w-4" />
                        Upload Image
                        <input
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            void handleWordImageUpload(word.id, event.target.files?.[0] ?? null);
                            event.currentTarget.value = "";
                          }}
                          type="file"
                        />
                      </label>
                      <button
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
                        onClick={() => updateWordImage(word.id, "")}
                        type="button"
                      >
                        Clear Image
                      </button>
                    </div>
                  </div>

                  {word.imageSrc ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
                      <p className="text-xs font-semibold text-slate-600">Image Preview</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt={`${word.word || "Vocabulary"} preview`}
                        className="mt-2 h-44 w-full rounded-md border border-slate-200 object-cover"
                        src={word.imageSrc}
                      />
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700">
                      <p className="font-semibold text-slate-600">Syllables</p>
                      <p className="mt-1">{word.syllables.length > 0 ? word.syllables.join(" • ") : "Not generated yet"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700">
                      <p className="font-semibold text-slate-600">Definition</p>
                      <p className="mt-1">{word.definition || "Not generated yet"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700">
                      <p className="font-semibold text-slate-600">Pronunciation Audio</p>
                      <p className="mt-1">{word.audioRef ? "Generated" : "Missing"}</p>
                    </div>
                  </div>

                  {word.exampleSentence ? (
                    <p className="mt-2 text-xs text-slate-600">Example: {word.exampleSentence}</p>
                  ) : null}

                  <div className="mt-3">
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                      onClick={() => void handleGenerate(word.id)}
                      type="button"
                    >
                      {isGenerating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
                      Process this word
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="card flex flex-wrap items-center gap-3 p-4">
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
          onClick={() => void handleSave()}
          type="button"
        >
          {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Pack
        </button>

        <button
          className="inline-flex items-center gap-2 rounded-lg border border-brand px-4 py-2 text-sm font-bold text-brand"
          onClick={() => void handleGenerate()}
          type="button"
        >
          {isGenerating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Run AI Processing
        </button>
      </section>
    </div>
  );
}
