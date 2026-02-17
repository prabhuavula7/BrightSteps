"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createPicturePhrasePack,
  deletePicturePhraseCard,
  fetchPicturePhrasePack,
  generatePicturePhrasePack,
  savePicturePhrasePack,
  uploadPicturePhraseImage,
  type PicturePhrasePackResponse,
} from "@/lib/api";
import {
  ArrowLeft,
  GripVertical,
  ImagePlus,
  Images,
  LoaderCircle,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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

const EMPTY_JSON_EXAMPLE = `{
  "schemaVersion": "2.0.0",
  "packId": "picturephrases-custom-001",
  "moduleType": "picturephrases",
  "title": "Street Scenes",
  "description": "AI-generated sentence prompts from uploaded photos",
  "version": "1.0.0",
  "language": "en",
  "ageBand": "6-10",
  "topics": ["daily life"],
  "settings": {
    "defaultSupportLevel": 2,
    "audioEnabledByDefault": false
  },
  "assets": [],
  "items": []
}`;

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function clonePayload(payload: unknown): Record<string, unknown> {
  const base = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
}

function toDraftMeta(payload: unknown): DraftMeta {
  const pack = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  return {
    packId: typeof pack.packId === "string" ? pack.packId : "",
    title: typeof pack.title === "string" ? pack.title : "New PicturePhrases Pack",
    description: typeof pack.description === "string" ? pack.description : "",
    language: typeof pack.language === "string" ? pack.language : "en",
    ageBand: typeof pack.ageBand === "string" ? pack.ageBand : "6-10",
    topicsCsv: Array.isArray(pack.topics) ? pack.topics.map((topic) => String(topic)).join(", ") : "general",
  };
}

type CardView = {
  id: string;
  topic: string;
  imageSrc?: string;
  canonical?: string;
  variants: string[];
  wordBank: string[];
  hint?: string;
};

type CreationFlow = "individual" | "story";

type StoryUploadItem = {
  id: string;
  file: File;
  previewUrl: string;
};

type StoryCardGenerationState = "pending" | "running" | "success" | "error";

type SortableTileProps = {
  id: string;
  imageSrc?: string;
  title: string;
  subtitle?: string;
  onRemove?: () => void;
  status?: StoryCardGenerationState;
};

function SortableTile({ id, imageSrc, title, subtitle, onRemove, status }: SortableTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3" ref={setNodeRef} style={style}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
          Drag
        </button>
        {onRemove ? (
          <button
            className="rounded-md border border-rose-300 p-1 text-rose-700 hover:bg-rose-50"
            onClick={onRemove}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={title}
          className="h-36 w-full rounded-md border border-slate-200 object-cover"
          src={imageSrc}
        />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
          Image missing
        </div>
      )}
      <p className="mt-2 text-xs font-semibold text-slate-600">{title}</p>
      {subtitle ? <p className="truncate text-xs text-slate-500">{subtitle}</p> : null}
      {status ? (
        <div
          className={`mt-2 rounded-md px-2 py-1 text-[11px] font-semibold ${
            status === "running"
              ? "bg-blue-100 text-blue-700"
              : status === "success"
                ? "bg-emerald-100 text-emerald-700"
                : status === "error"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-slate-100 text-slate-600"
          }`}
        >
          {status === "running"
            ? "Generating..."
            : status === "success"
              ? "Generated"
              : status === "error"
                ? "Generation failed"
                : "Waiting"}
        </div>
      ) : null}
    </article>
  );
}

function isHeicFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".heif")
  );
}

function toJpegFileName(fileName: string): string {
  return fileName.replace(/\.(heic|heif)$/i, ".jpg");
}

function toCardViews(payload: unknown): CardView[] {
  const pack = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const assets = Array.isArray(pack.assets) ? pack.assets : [];
  const items = Array.isArray(pack.items) ? pack.items : [];

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

  const views: CardView[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    if (record.type !== "picturephrase" || typeof record.id !== "string") {
      continue;
    }

    const media = record.media && typeof record.media === "object"
      ? (record.media as Record<string, unknown>)
      : null;
    const imageRef = media && typeof media.imageRef === "string" ? media.imageRef : "";

    const sentenceGroups = Array.isArray(record.sentenceGroups) ? record.sentenceGroups : [];
    const canonical =
      sentenceGroups[0] && typeof sentenceGroups[0] === "object"
        ? String((sentenceGroups[0] as Record<string, unknown>).canonical ?? "")
        : "";
    const variants = sentenceGroups
      .map((group) => {
        if (!group || typeof group !== "object") {
          return "";
        }
        return String((group as Record<string, unknown>).canonical ?? "").trim();
      })
      .filter(Boolean);

    const wordBank = Array.isArray(record.wordBank)
      ? record.wordBank
          .map((token) => {
            if (!token || typeof token !== "object") {
              return "";
            }
            return String((token as Record<string, unknown>).text ?? "").trim();
          })
          .filter(Boolean)
      : [];

    const hintLevels = record.hintLevels && typeof record.hintLevels === "object"
      ? (record.hintLevels as Record<string, unknown>)
      : null;

    views.push({
      id: record.id,
      topic: typeof record.topic === "string" ? record.topic : "general",
      imageSrc: imageRef ? imageById.get(imageRef) : undefined,
      canonical: canonical || undefined,
      variants,
      wordBank,
      hint:
        hintLevels && typeof hintLevels.level3 === "string"
          ? hintLevels.level3
          : undefined,
    });
  }

  return views;
}

function getPicturePhraseItemIds(payload: Record<string, unknown> | null): string[] {
  if (!payload) {
    return [];
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const record = item as Record<string, unknown>;
      if (record.type !== "picturephrase" || typeof record.id !== "string") {
        return "";
      }
      return record.id;
    })
    .filter(Boolean);
}

export function PicturePhrasesPackEditor({ mode, packRef }: Props) {
  const router = useRouter();
  const storyQueueRef = useRef<StoryUploadItem[]>([]);
  const uploadedSequenceRef = useRef<HTMLDivElement>(null);

  const [packId, setPackId] = useState(packRef ?? "");
  const [packPayload, setPackPayload] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<DraftMeta>({
    packId: packRef ?? "",
    title: "New PicturePhrases Pack",
    description: "",
    language: "en",
    ageBand: "6-10",
    topicsCsv: "general",
  });
  const [editorMode, setEditorMode] = useState<"ui" | "json">("ui");
  const [jsonText, setJsonText] = useState(EMPTY_JSON_EXAMPLE);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [creationFlow, setCreationFlow] = useState<CreationFlow | null>(mode === "create" ? null : "individual");

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTopic, setUploadTopic] = useState("general");
  const [uploadAlt, setUploadAlt] = useState("");
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [storyQueue, setStoryQueue] = useState<StoryUploadItem[]>([]);
  const [isStoryDropActive, setIsStoryDropActive] = useState(false);
  const [isPreparingImages, setIsPreparingImages] = useState(false);
  const [storyGenerationByCardId, setStoryGenerationByCardId] = useState<Record<string, StoryCardGenerationState>>({});
  const [storyPipelineCompleted, setStoryPipelineCompleted] = useState(false);

  const cards = useMemo(() => toCardViews(packPayload), [packPayload]);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
  );

  useEffect(() => {
    if (mode !== "edit" || !packRef) {
      return;
    }
    const editPackId = packRef;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError("");

      try {
        const payload = await fetchPicturePhrasePack(editPackId);
        if (cancelled) {
          return;
        }

        const packObject = clonePayload(payload.pack);
        setPackPayload(packObject);
        setDraft(toDraftMeta(packObject));
        setPackId(editPackId);
        setJsonText(toPrettyJson(packObject));
        const persistedFlow = packObject.editorFlow;
        if (persistedFlow === "individual" || persistedFlow === "story") {
          setCreationFlow(persistedFlow);
        } else {
          setCreationFlow("individual");
        }
        setIsDirty(false);
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
  }, [mode, packRef]);

  useEffect(() => {
    storyQueueRef.current = storyQueue;
  }, [storyQueue]);

  useEffect(() => {
    return () => {
      for (const item of storyQueueRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  function applyPackResponse(response: PicturePhrasePackResponse) {
    const next = clonePayload(response.pack);
    setPackPayload(next);
    setPackId(response.summary.packId);
    setDraft(toDraftMeta(next));
    const persistedFlow = next.editorFlow;
    if (persistedFlow === "individual" || persistedFlow === "story") {
      setCreationFlow(persistedFlow);
    }
    setJsonText(toPrettyJson(next));
    setIsDirty(false);
  }

  function updateDraftField(field: keyof DraftMeta, value: string) {
    setDraft((previous) => ({ ...previous, [field]: value }));

    if (!packPayload) {
      setIsDirty(true);
      return;
    }

    const next = clonePayload(packPayload);
    next[field] = value;

    if (field === "topicsCsv") {
      next.topics = value
        .split(",")
        .map((topic) => topic.trim())
        .filter(Boolean);
      delete next.topicsCsv;
    }

    setPackPayload(next);
    setJsonText(toPrettyJson(next));
    setIsDirty(true);
  }

  function chooseCreationFlow(flow: CreationFlow) {
    setCreationFlow(flow);
    if (flow === "story") {
      setAutoGenerate(false);
      if (!uploadTopic.trim()) {
        setUploadTopic("story");
      }
    }
    if (!packPayload) {
      return;
    }
    const next = clonePayload(packPayload);
    next.editorFlow = flow;
    setPackPayload(next);
    setJsonText(toPrettyJson(next));
    setIsDirty(true);
  }

  function clearStoryQueue() {
    for (const item of storyQueue) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setStoryQueue([]);
  }

async function normalizeImageFile(file: File): Promise<File> {
    if (!isHeicFile(file)) {
      return file;
    }

    try {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.92,
      });
      const blob = Array.isArray(converted) ? converted[0] : converted;
      if (!blob) {
        throw new Error("No converted blob returned");
      }
      return new File([blob], toJpegFileName(file.name), {
        type: "image/jpeg",
      });
    } catch {
      const formData = new FormData();
      formData.set("image", file);
      const response = await fetch("/api/picturephrases/convert-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Unable to convert HEIC image. Please use JPG/PNG or try another HEIC file.");
      }

      const blob = await response.blob();
      return new File([blob], toJpegFileName(file.name), {
        type: "image/jpeg",
      });
    }
  }

  async function enqueueStoryFiles(files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith("image/") || isHeicFile(file));
    if (imageFiles.length === 0) {
      return;
    }

    setIsPreparingImages(true);
    try {
      const normalizedResults = await Promise.allSettled(imageFiles.map((file) => normalizeImageFile(file)));
      const normalized = normalizedResults
        .filter((result): result is PromiseFulfilledResult<File> => result.status === "fulfilled")
        .map((result) => result.value);

      const failedCount = normalizedResults.length - normalized.length;
      if (failedCount > 0) {
        setError(`${failedCount} image(s) could not be converted. Try JPG/PNG for those files.`);
      }
      if (normalized.length === 0) {
        return;
      }

      const nextItems = normalized.map((file) => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setStoryQueue((previous) => [...previous, ...nextItems]);
      if (failedCount === 0) {
        setError("");
      }
    } finally {
      setIsPreparingImages(false);
    }
  }

  function handleStoryDropFiles(files: FileList | null) {
    if (!files) {
      return;
    }
    void enqueueStoryFiles(Array.from(files));
  }

  function removeStoryQueueItem(itemId: string) {
    setStoryQueue((previous) => {
      const target = previous.find((item) => item.id === itemId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return previous.filter((item) => item.id !== itemId);
    });
  }

  function reorderUploadedStoryCards(draggedCardId: string, targetCardId: string) {
    if (!packPayload || draggedCardId === targetCardId) {
      return;
    }

    const next = clonePayload(packPayload);
    const items = Array.isArray(next.items) ? [...next.items] : [];
    const sourceIndex = items.findIndex((item) => {
      return item && typeof item === "object" && (item as Record<string, unknown>).id === draggedCardId;
    });
    const targetIndex = items.findIndex((item) => {
      return item && typeof item === "object" && (item as Record<string, unknown>).id === targetCardId;
    });

    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const [moved] = items.splice(sourceIndex, 1);
    if (!moved) {
      return;
    }

    items.splice(targetIndex, 0, moved);
    next.items = items;

    setPackPayload(next);
    setJsonText(toPrettyJson(next));
    setIsDirty(true);
    setStatus("Story order updated. This order will be used when running the AI pipeline.");
  }

  function handleStoryQueueDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setStoryQueue((previous) => {
      const sourceIndex = previous.findIndex((item) => item.id === String(active.id));
      const targetIndex = previous.findIndex((item) => item.id === String(over.id));
      if (sourceIndex < 0 || targetIndex < 0) {
        return previous;
      }
      return arrayMove(previous, sourceIndex, targetIndex);
    });
  }

  function handleUploadedCardsDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    reorderUploadedStoryCards(String(active.id), String(over.id));
  }

  async function handleCreateDraft() {
    setError("");
    setStatus("");
    setIsSaving(true);

    try {
      const response = await createPicturePhrasePack({
        packId: draft.packId.trim() || undefined,
        title: draft.title.trim(),
        description: draft.description.trim(),
        language: draft.language.trim(),
        ageBand: draft.ageBand.trim(),
        topics: draft.topicsCsv
          .split(",")
          .map((topic) => topic.trim())
          .filter(Boolean),
      });
      const createdPack = clonePayload(response.pack);
      createdPack.editorFlow = creationFlow ?? "individual";
      const saved = await savePicturePhrasePack(response.summary.packId, createdPack);
      applyPackResponse(saved);
      setStatus(
        creationFlow === "story"
          ? "Story draft created. Bulk upload images, set order, then run AI generation."
          : "Draft pack created. Upload images to generate sentence cards.",
      );
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create draft");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCurrentPack(options?: { navigateBack?: boolean }) {
    if (!packId) {
      setError("Create a draft pack first.");
      return;
    }

    setError("");
    setStatus("");
    setIsSaving(true);

    try {
      let payloadToSave: unknown;
      if (editorMode === "json") {
        payloadToSave = JSON.parse(jsonText);
      } else {
        const next = clonePayload(packPayload);
        if (creationFlow) {
          next.editorFlow = creationFlow;
        }
        payloadToSave = next;
      }

      const response = await savePicturePhrasePack(packId, payloadToSave);
      applyPackResponse(response);
      setStatus("Pack saved successfully.");

      if (options?.navigateBack) {
        router.push("/settings/picturephrases");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save pack");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUploadImage() {
    if (!packId) {
      setError("Create a draft pack first.");
      return;
    }

    if (!uploadFile) {
      setError("Choose an image file to upload.");
      return;
    }

    setError("");
    setStatus("");
    setIsUploading(true);

    try {
      const preparedFile = await normalizeImageFile(uploadFile);
      const response = await uploadPicturePhraseImage({
        packId,
        file: preparedFile,
        topic: uploadTopic.trim() || "general",
        altText: uploadAlt.trim() || undefined,
        autoGenerate,
      });

      applyPackResponse(response);
      setUploadFile(null);
      setUploadAlt("");
      setStatus(
        autoGenerate
          ? "Image uploaded and AI content generated."
          : "Image uploaded. Run generation when ready.",
      );
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleBulkUploadStory() {
    if (!packId) {
      setError("Create a draft pack first.");
      return;
    }

    if (storyQueue.length === 0) {
      setError("Add story images first.");
      return;
    }

    setError("");
    setStatus("");
    setIsUploading(true);

    try {
      let latest: PicturePhrasePackResponse | null = null;

      for (const [index, item] of storyQueue.entries()) {
        latest = await uploadPicturePhraseImage({
          packId,
          file: item.file,
          topic: uploadTopic.trim() || "story",
          altText: `Story image ${index + 1}: ${item.file.name}`,
          autoGenerate: false,
        });
      }

      if (latest) {
        const fresh = await fetchPicturePhrasePack(packId);
        applyPackResponse(fresh);
      }
      setStoryGenerationByCardId({});
      setStoryPipelineCompleted(false);
      clearStoryQueue();
      setStatus("Story images uploaded in selected order. Run AI pipeline when ready.");
      requestAnimationFrame(() => {
        uploadedSequenceRef.current?.focus();
        uploadedSequenceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Bulk upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleGenerate(itemId?: string) {
    if (!packId) {
      setError("Create a draft pack first.");
      return;
    }

    setError("");
    setStatus("");
    setIsGenerating(true);

    try {
      if (creationFlow === "story" && !itemId) {
        let workingPayload = packPayload;
        if (workingPayload && isDirty) {
          const savedOrder = await savePicturePhrasePack(packId, workingPayload);
          applyPackResponse(savedOrder);
          workingPayload = clonePayload(savedOrder.pack);
        }

        const itemIds = getPicturePhraseItemIds(workingPayload);
        if (itemIds.length === 0) {
          setError("Upload story images first.");
          return;
        }

        setStoryPipelineCompleted(false);
        setStoryGenerationByCardId(Object.fromEntries(itemIds.map((id) => [id, "pending"])));

        for (const currentItemId of itemIds) {
          setStoryGenerationByCardId((previous) => ({
            ...previous,
            [currentItemId]: "running",
          }));

          try {
            const response = await generatePicturePhrasePack({ packId, itemId: currentItemId });
            applyPackResponse(response);
            setStoryGenerationByCardId((previous) => ({
              ...previous,
              [currentItemId]: "success",
            }));
          } catch (singleError) {
            setStoryGenerationByCardId((previous) => ({
              ...previous,
              [currentItemId]: "error",
            }));
            throw singleError;
          }
        }

        setStoryPipelineCompleted(true);
        setStatus("Story AI pipeline completed for all uploaded cards.");
        return;
      }

      if (creationFlow === "story" && itemId) {
        setStoryGenerationByCardId((previous) => ({
          ...previous,
          [itemId]: "running",
        }));
      }

      const response = await generatePicturePhrasePack({ packId, itemId });
      applyPackResponse(response);
      if (creationFlow === "story" && itemId) {
        setStoryGenerationByCardId((previous) => ({
          ...previous,
          [itemId]: "success",
        }));
      }
      setStatus(itemId ? "Card regenerated." : "Pack regenerated.");
    } catch (generationError) {
      if (creationFlow === "story" && itemId) {
        setStoryGenerationByCardId((previous) => ({
          ...previous,
          [itemId]: "error",
        }));
      }
      setError(generationError instanceof Error ? generationError.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDeleteCard(itemId: string) {
    if (!packId) {
      setError("Create a draft pack first.");
      return;
    }

    const confirmed = window.confirm("Delete this picture card?");
    if (!confirmed) {
      return;
    }

    setError("");
    setStatus("");

    try {
      const response = await deletePicturePhraseCard({ packId, itemId });
      applyPackResponse(response);
      setStatus("Card deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete card");
    }
  }

  function requestBack() {
    if (!isDirty) {
      router.push("/settings/picturephrases");
      return;
    }

    setShowLeaveModal(true);
  }

  const hasQueuedStoryImages = storyQueue.length > 0;
  const hasUploadedStoryImages = cards.length > 0;
  const generationStates = Object.values(storyGenerationByCardId);
  const isStoryPipelineRunning = generationStates.some((state) => state === "pending" || state === "running");
  const hasStoryGenerationErrors = generationStates.some((state) => state === "error");

  if (isLoading) {
    return <div className="card p-6 text-sm text-slate-600">Loading PicturePhrases pack...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          onClick={requestBack}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Manager
        </button>

        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
          <button
            className={`rounded-md px-3 py-1 text-sm font-semibold ${
              editorMode === "ui" ? "bg-brand-soft text-brand" : "text-slate-600"
            }`}
            onClick={() => setEditorMode("ui")}
            type="button"
          >
            UI Mode
          </button>
          <button
            className={`rounded-md px-3 py-1 text-sm font-semibold ${
              editorMode === "json" ? "bg-brand-soft text-brand" : "text-slate-600"
            }`}
            onClick={() => setEditorMode("json")}
            type="button"
          >
            JSON Mode
          </button>
        </div>
      </div>

      {error ? <div className="card border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
      {status ? <div className="card border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{status}</div> : null}
      {mode === "create" && creationFlow ? (
        <div className="card flex flex-wrap items-center justify-between gap-2 border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <span>
            Creation flow:
            <span className="ml-1 font-bold text-slate-900">
              {creationFlow === "story" ? "Story Mode" : "Individual Mode"}
            </span>
          </span>
          {!packPayload ? (
            <button
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
              onClick={() => setCreationFlow(null)}
              type="button"
            >
              Change
            </button>
          ) : null}
        </div>
      ) : null}

      {editorMode === "ui" ? (
        <>
          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-bold text-slate-900">Pack Details</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-600">Pack ID</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  disabled={Boolean(packId)}
                  onChange={(event) => updateDraftField("packId", event.target.value)}
                  placeholder="picturephrases-custom-001"
                  value={draft.packId}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-600">Title</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  onChange={(event) => updateDraftField("title", event.target.value)}
                  value={draft.title}
                />
              </label>

              <label className="md:col-span-2 flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-600">Description</span>
                <textarea
                  className="min-h-24 rounded-lg border border-slate-300 px-3 py-2"
                  onChange={(event) => updateDraftField("description", event.target.value)}
                  value={draft.description}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-600">Language</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  onChange={(event) => updateDraftField("language", event.target.value)}
                  value={draft.language}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-600">Age Band</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  onChange={(event) => updateDraftField("ageBand", event.target.value)}
                  value={draft.ageBand}
                />
              </label>

              <label className="md:col-span-2 flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-600">Topics (comma separated)</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  onChange={(event) => updateDraftField("topicsCsv", event.target.value)}
                  value={draft.topicsCsv}
                />
              </label>
            </div>

            {!packPayload ? (
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
                disabled={isSaving || !draft.title.trim()}
                onClick={() => void handleCreateDraft()}
                type="button"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Create Draft Pack
              </button>
            ) : (
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
                disabled={isSaving}
                onClick={() => void saveCurrentPack()}
                type="button"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Pack
              </button>
            )}
          </section>

          {packPayload ? (
            <>
              <section className="card space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-slate-900">
                    {creationFlow === "story" ? "Story Mode Uploader" : "Upload Picture Card"}
                  </h2>
                  <span className="text-xs font-semibold text-slate-500">
                    {creationFlow === "story"
                      ? "Bulk upload related images, drag to reorder, then run AI."
                      : "Image only. AI generates phrase data."}
                  </span>
                </div>

                {creationFlow === "story" ? (
                  <>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        {
                          id: "queue",
                          label: "1. Queue Images",
                          done: hasQueuedStoryImages || hasUploadedStoryImages,
                          active: !hasQueuedStoryImages && !hasUploadedStoryImages,
                        },
                        {
                          id: "upload",
                          label: "2. Upload Ordered Images",
                          done: hasUploadedStoryImages,
                          active: hasQueuedStoryImages && !hasUploadedStoryImages,
                        },
                        {
                          id: "reorder",
                          label: "3. Reorder Uploaded Sequence",
                          done: hasUploadedStoryImages,
                          active: hasUploadedStoryImages && !isStoryPipelineRunning && !storyPipelineCompleted,
                        },
                        {
                          id: "generate",
                          label: "4. Run Story AI Pipeline",
                          done: storyPipelineCompleted && !hasStoryGenerationErrors,
                          active: hasUploadedStoryImages && (isStoryPipelineRunning || (!storyPipelineCompleted && !hasStoryGenerationErrors)),
                        },
                      ].map((step) => (
                        <div
                          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                            step.done
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : step.active
                                ? "border-brand bg-brand-soft text-brand"
                                : "border-slate-200 bg-slate-50 text-slate-500"
                          }`}
                          key={step.id}
                        >
                          {step.label}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-semibold text-slate-600">Story topic</span>
                        <input
                          className="rounded-lg border border-slate-300 px-3 py-2"
                          onChange={(event) => setUploadTopic(event.target.value)}
                          placeholder="story"
                          value={uploadTopic}
                        />
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-semibold text-slate-600">Bulk image upload button</span>
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-brand hover:text-brand">
                          <Images className="h-4 w-4" />
                          Add multiple images
                          <input
                            accept="image/*"
                            className="hidden"
                            multiple
                            onChange={(event) => {
                              handleStoryDropFiles(event.target.files);
                              event.currentTarget.value = "";
                            }}
                            type="file"
                          />
                        </label>
                      </label>
                    </div>

                    <div
                      className={`rounded-lg border-2 border-dashed p-4 text-sm transition ${
                        isStoryDropActive
                          ? "border-brand bg-brand-soft text-brand-strong"
                          : "border-slate-300 bg-slate-50 text-slate-600"
                      }`}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setIsStoryDropActive(true);
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        setIsStoryDropActive(false);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setIsStoryDropActive(true);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setIsStoryDropActive(false);
                        handleStoryDropFiles(event.dataTransfer.files);
                      }}
                    >
                      Drag and drop multiple images here.
                      <span className="block text-xs text-slate-500">
                        Then drag tiles to set story order, upload, and run AI pipeline.
                      </span>
                    </div>
                    {isPreparingImages ? (
                      <div className="inline-flex items-center gap-2 text-sm text-slate-600">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Preparing image previews...
                      </div>
                    ) : null}

                    {storyQueue.length === 0 ? (
                      <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
                        No story images queued yet.
                      </div>
                    ) : (
                      <DndContext collisionDetection={closestCenter} onDragEnd={handleStoryQueueDragEnd} sensors={sensors}>
                        <SortableContext items={storyQueue.map((item) => item.id)} strategy={rectSortingStrategy}>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {storyQueue.map((item, index) => (
                              <SortableTile
                                id={item.id}
                                imageSrc={item.previewUrl}
                                key={item.id}
                                onRemove={() => removeStoryQueueItem(item.id)}
                                subtitle={item.file.name}
                                title={`Queue Order ${index + 1}`}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}

                    <div className="rounded-lg border border-slate-200 bg-white p-3" ref={uploadedSequenceRef} tabIndex={-1}>
                      <div className="mb-2 text-sm font-semibold text-slate-700">
                        Uploaded Story Sequence (drag to reorder before AI)
                      </div>
                      {cards.length === 0 ? (
                        <p className="text-sm text-slate-600">
                          Uploaded images will appear here after you click
                          <span className="mx-1 font-semibold">Upload Ordered Story Images</span>
                          so you can fine-tune order before running AI.
                        </p>
                      ) : (
                        <DndContext collisionDetection={closestCenter} onDragEnd={handleUploadedCardsDragEnd} sensors={sensors}>
                          <SortableContext items={cards.map((card) => card.id)} strategy={rectSortingStrategy}>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              {cards.map((card, index) => (
                                <SortableTile
                                  id={card.id}
                                  imageSrc={card.imageSrc}
                                  key={`uploaded-${card.id}`}
                                  status={storyGenerationByCardId[card.id]}
                                  subtitle={card.topic}
                                  title={`Story Step ${index + 1}`}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
                        disabled={isUploading || isPreparingImages || storyQueue.length === 0}
                        onClick={() => void handleBulkUploadStory()}
                        type="button"
                      >
                        {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        Upload Ordered Story Images
                      </button>
                      <button
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                        onClick={clearStoryQueue}
                        type="button"
                      >
                        Clear Queue
                      </button>
                      <button
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                        disabled={isGenerating || cards.length === 0}
                        onClick={() => void handleGenerate()}
                        type="button"
                      >
                        {isGenerating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Run Story AI Pipeline
                      </button>
                    </div>
                    {Object.keys(storyGenerationByCardId).length > 0 ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                        Story generation:
                        <span className="ml-1 font-semibold text-slate-700">
                          {Object.values(storyGenerationByCardId).filter((state) => state === "success").length}
                        </span>
                        <span className="mx-1">done,</span>
                        <span className="font-semibold text-blue-700">
                          {Object.values(storyGenerationByCardId).filter((state) => state === "running").length}
                        </span>
                        <span className="mx-1">running,</span>
                        <span className="font-semibold text-rose-700">
                          {Object.values(storyGenerationByCardId).filter((state) => state === "error").length}
                        </span>
                        <span className="ml-1">failed.</span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-semibold text-slate-600">Picture</span>
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-brand hover:text-brand">
                          <Upload className="h-4 w-4" />
                          {uploadFile ? uploadFile.name : "Choose image file"}
                          <input
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                            type="file"
                          />
                        </label>
                      </label>

                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-semibold text-slate-600">Topic</span>
                        <input
                          className="rounded-lg border border-slate-300 px-3 py-2"
                          onChange={(event) => setUploadTopic(event.target.value)}
                          placeholder="general"
                          value={uploadTopic}
                        />
                      </label>

                      <label className="md:col-span-2 flex flex-col gap-2">
                        <span className="text-sm font-semibold text-slate-600">Alt text (optional)</span>
                        <input
                          className="rounded-lg border border-slate-300 px-3 py-2"
                          onChange={(event) => setUploadAlt(event.target.value)}
                          placeholder="What is shown in the image"
                          value={uploadAlt}
                        />
                      </label>
                    </div>

                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input
                        checked={autoGenerate}
                        onChange={(event) => setAutoGenerate(event.target.checked)}
                        type="checkbox"
                      />
                      Auto-generate sentence content after upload
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
                        disabled={isUploading}
                        onClick={() => void handleUploadImage()}
                        type="button"
                      >
                        {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                        Upload Image
                      </button>
                      <button
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                        disabled={isGenerating || cards.length === 0}
                        onClick={() => void handleGenerate()}
                        type="button"
                      >
                        {isGenerating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Regenerate All
                      </button>
                    </div>
                  </>
                )}
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-bold text-slate-900">Card Preview</h2>
                {cards.length === 0 ? (
                  <div className="card p-4 text-sm text-slate-600">No cards yet. Upload a picture to begin.</div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {cards.map((card) => (
                      <article className="card space-y-3 p-4" key={card.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-500">Topic: {card.topic}</p>
                            <h3 className="text-base font-bold text-slate-900">{card.canonical || "Awaiting generation"}</h3>
                          </div>
                          <div className="flex gap-1">
                            <button
                              className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-100"
                              onClick={() => void handleGenerate(card.id)}
                              type="button"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                            <button
                              className="rounded-md border border-rose-300 p-2 text-rose-700 hover:bg-rose-50"
                              onClick={() => void handleDeleteCard(card.id)}
                              type="button"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {card.imageSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt="Picture phrase prompt"
                            className="h-48 w-full rounded-lg border border-slate-200 object-cover"
                            src={card.imageSrc}
                          />
                        ) : (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                            Image unavailable for this card.
                          </div>
                        )}

                        <p className="text-xs text-slate-500">Variants: {card.variants.length}</p>
                        {card.wordBank.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {card.wordBank.slice(0, 16).map((word) => (
                              <span
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700"
                                key={`${card.id}-${word}`}
                              >
                                {word}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {card.hint ? <p className="text-xs text-slate-600">Hint: {card.hint}</p> : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </>
      ) : (
        <section className="card space-y-4 p-5">
          <div className="text-sm text-slate-600">
            JSON mode shows the full persisted pack payload. Save applies the JSON directly.
          </div>
          <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            {EMPTY_JSON_EXAMPLE}
          </pre>
          <textarea
            className="min-h-[420px] w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
            onChange={(event) => {
              setJsonText(event.target.value);
              setIsDirty(true);
            }}
            value={jsonText}
          />
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
            disabled={isSaving || !packId}
            onClick={() => void saveCurrentPack()}
            type="button"
          >
            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save JSON
          </button>
        </section>
      )}

      {packId ? (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
            disabled={isSaving}
            onClick={() => void saveCurrentPack({ navigateBack: true })}
            type="button"
          >
            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Pack
          </button>
        </div>
      ) : null}

      {mode === "create" && creationFlow === null ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <h3 className="text-xl font-bold text-slate-900">Choose PicturePhrases Create Mode</h3>
            <p className="mt-2 text-sm text-slate-600">
              Pick how this pack should be built.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <button
                className="rounded-xl border border-slate-300 bg-white p-4 text-left transition hover:border-brand hover:bg-brand-soft"
                onClick={() => chooseCreationFlow("individual")}
                type="button"
              >
                <p className="text-base font-bold text-slate-900">Individual Unrelated Pictures</p>
                <p className="mt-1 text-sm text-slate-600">
                  Upload one image at a time. Best for mixed topics and independent prompts.
                </p>
              </button>
              <button
                className="rounded-xl border border-slate-300 bg-white p-4 text-left transition hover:border-brand hover:bg-brand-soft"
                onClick={() => chooseCreationFlow("story")}
                type="button"
              >
                <p className="text-base font-bold text-slate-900">Story Mode (Bulk Upload)</p>
                <p className="mt-1 text-sm text-slate-600">
                  Upload related images in bulk, drag to sequence, then generate a story-style learning set.
                </p>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showLeaveModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <h3 className="text-lg font-bold text-slate-900">Unsaved changes</h3>
            <p className="mt-2 text-sm text-slate-600">
              Save your changes before leaving this editor?
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setShowLeaveModal(false)}
                type="button"
              >
                Stay
              </button>
              <Link
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
                href="/settings/picturephrases"
              >
                Leave
              </Link>
              <button
                className="rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white"
                onClick={() => void saveCurrentPack({ navigateBack: true })}
                type="button"
              >
                Save & Leave
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
