import type { BrightStepsPack } from "@brightsteps/content-schema";

export type PackPayload = {
  pack: BrightStepsPack;
  assetUrlById: Record<string, string>;
};

export type PackSummary = {
  packId: string;
  title: string;
  moduleType: "factcards" | "picturephrases";
  topics: string[];
  itemCount: number;
  description?: string;
  thumbnailUrl?: string;
  thumbnailAlt?: string;
  valid: boolean;
  issues?: string[];
};

export type PicturePhraseSummary = {
  packId: string;
  title: string;
  description?: string;
  topics: string[];
  itemCount: number;
  valid: boolean;
  issues?: string[];
  updatedAt: string;
};

export type PicturePhrasePackResponse = {
  pack: unknown;
  assetUrlById: Record<string, string>;
  summary: PicturePhraseSummary;
  valid: boolean;
  issues: Array<{ path: string; message: string }> | string[];
};

export type LearnContentRequest =
  | {
      moduleType: "factcards";
      packId: string;
      itemId: string;
      language?: string;
      ageBand?: string;
      item: {
        topic: string;
        prompt: string;
        answer: string;
        hints: string[];
      };
    }
  | {
      moduleType: "picturephrases";
      packId: string;
      itemId: string;
      language?: string;
      ageBand?: string;
      item: {
        topic: string;
        canonical: string;
        variants: string[];
        wordBank: string[];
      };
    };

export type LearnContentResponse = {
  cacheKey: string;
  moduleType: "factcards" | "picturephrases";
  packId: string;
  itemId: string;
  fromCache: boolean;
  provider: "openai" | "gemini";
  model: string;
  promptVersion: string;
  flagged: boolean;
  content: {
    headline: string;
    teachText: string;
    speakText: string;
    keyPoints: string[];
    practicePrompt?: string;
  };
  audioUrl?: string;
};

export async function fetchPackSummaries(): Promise<PackSummary[]> {
  const response = await fetch("/api/packs", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load pack summaries");
  }

  const payload = (await response.json()) as { packs: PackSummary[] };
  return payload.packs;
}

export async function fetchPack(packId: string): Promise<PackPayload> {
  const response = await fetch(`/api/packs/${encodeURIComponent(packId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load pack ${packId}`);
  }

  return (await response.json()) as PackPayload;
}

export async function fetchPicturePhraseSummaries(): Promise<PicturePhraseSummary[]> {
  const response = await fetch("/api/picturephrases/packs", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load PicturePhrases packs");
  }

  const payload = (await response.json()) as { packs: PicturePhraseSummary[] };
  return payload.packs;
}

export async function createPicturePhrasePack(payload: {
  packId?: string;
  title: string;
  description?: string;
  language?: string;
  ageBand?: string;
  topics?: string[];
}): Promise<PicturePhrasePackResponse> {
  const response = await fetch("/api/picturephrases/packs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorPayload.error ?? "Failed to create pack");
  }

  return (await response.json()) as PicturePhrasePackResponse;
}

export async function fetchPicturePhrasePack(packId: string): Promise<PicturePhrasePackResponse> {
  const response = await fetch(`/api/picturephrases/packs/${encodeURIComponent(packId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorPayload.error ?? "Failed to load PicturePhrases pack");
  }

  return (await response.json()) as PicturePhrasePackResponse;
}

export async function savePicturePhrasePack(packId: string, payload: unknown): Promise<PicturePhrasePackResponse> {
  const response = await fetch(`/api/picturephrases/packs/${encodeURIComponent(packId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorPayload.error ?? "Failed to save PicturePhrases pack");
  }

  return (await response.json()) as PicturePhrasePackResponse;
}

export async function deletePicturePhrasePack(packId: string): Promise<void> {
  const response = await fetch(`/api/picturephrases/packs/${encodeURIComponent(packId)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorPayload.error ?? "Failed to delete PicturePhrases pack");
  }
}

export async function uploadPicturePhraseImage(params: {
  packId: string;
  file: File;
  altText?: string;
  topic?: string;
  autoGenerate?: boolean;
}): Promise<PicturePhrasePackResponse> {
  const formData = new FormData();
  formData.set("image", params.file);
  if (params.altText) {
    formData.set("altText", params.altText);
  }
  if (params.topic) {
    formData.set("topic", params.topic);
  }
  if (params.autoGenerate !== undefined) {
    formData.set("autoGenerate", String(params.autoGenerate));
  }

  const response = await fetch(`/api/picturephrases/packs/${encodeURIComponent(params.packId)}/images`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorPayload.error ?? "Failed to upload image");
  }

  return (await response.json()) as PicturePhrasePackResponse;
}

export async function generatePicturePhrasePack(params: {
  packId: string;
  itemId?: string;
}): Promise<PicturePhrasePackResponse> {
  const response = await fetch(`/api/picturephrases/packs/${encodeURIComponent(params.packId)}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId: params.itemId }),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorPayload.error ?? "Failed to generate PicturePhrases content");
  }

  return (await response.json()) as PicturePhrasePackResponse;
}

export async function deletePicturePhraseCard(params: {
  packId: string;
  itemId: string;
}): Promise<PicturePhrasePackResponse> {
  const response = await fetch(
    `/api/picturephrases/packs/${encodeURIComponent(params.packId)}/cards/${encodeURIComponent(params.itemId)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorPayload.error ?? "Failed to delete card");
  }

  return (await response.json()) as PicturePhrasePackResponse;
}

export async function fetchLearnContent(payload: LearnContentRequest): Promise<LearnContentResponse> {
  const response = await fetch("/api/learn/content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorPayload.error ?? "Failed to generate learn content");
  }

  return (await response.json()) as LearnContentResponse;
}
