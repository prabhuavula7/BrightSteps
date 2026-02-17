import {
  type BrightStepsPack,
  type PicturePhraseItem,
  type ValidationResult,
  validatePack,
} from "@brightsteps/content-schema";
import { randomUUID } from "node:crypto";
import { generatePicturePhraseContent } from "@/server/ai/picturephrases";
import {
  coercePicturePhrasePack,
  createEmptyPicturePhrasePack,
  createPicturePhraseImageAsset,
  deletePicturePhraseAsset,
  deletePicturePhrasePack,
  getPicturePhrasePack,
  listPicturePhraseAssets,
  listPicturePhrasePacks,
  logPicturePhraseGeneration,
  readPicturePhraseAssetBuffer,
  summarizePicturePhrasePack,
  toPicturePhraseAssetUrl,
  upsertPicturePhrasePack,
  type PicturePhrasePackRecord,
  type PicturePhrasePackSummary,
} from "@/server/picturephrases/repository";

export type PicturePhrasePackDetails = {
  record: PicturePhrasePackRecord;
  validation: ValidationResult;
  assetUrlById: Record<string, string>;
  summary: PicturePhrasePackSummary;
};

function toWordTokens(words: string[]): Array<{ id: string; text: string }> {
  const unique = Array.from(new Set(words.map((word) => word.trim().toLowerCase()).filter(Boolean))).slice(0, 24);
  return unique.map((word, index) => ({ id: `w${index + 1}`, text: word }));
}

function normalizeSentence(sentence: string): string {
  const trimmed = sentence.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function defaultSentence(topic: string): string {
  const safeTopic = topic.trim().toLowerCase() || "picture";
  if (safeTopic === "general") {
    return "The picture shows a scene.";
  }

  return `The picture shows ${safeTopic}.`;
}

function toPicturePhraseItem(params: {
  itemId: string;
  topic: string;
  imageRef: string;
  canonical: string;
  variants: string[];
  wordBankWords: string[];
  distractorWords: string[];
  hints?: {
    level3?: string;
    level2?: string;
    level1?: string;
    level0?: string;
  };
}): PicturePhraseItem {
  const canonical = normalizeSentence(params.canonical) || defaultSentence(params.topic);

  const variants = Array.from(
    new Set([canonical, ...params.variants.map((value) => normalizeSentence(value)).filter(Boolean)]),
  ).slice(0, 5);

  const wordBank = toWordTokens(params.wordBankWords.length > 0 ? params.wordBankWords : canonical.split(/\s+/));
  const availableWordIds = wordBank.map((token) => token.id);

  const sentenceGroups = variants.map((variant, index) => {
    const tokenCount = variant.split(/\s+/).filter(Boolean).length;
    return {
      intent: index === 0 ? "primary" : `variant_${index}`,
      canonical: variant,
      acceptable: [variant],
      requiredWordIds: availableWordIds.slice(0, Math.min(3, availableWordIds.length)),
      minWords: Math.max(1, tokenCount - 1),
      maxWords: Math.max(4, tokenCount + 2),
    };
  });

  return {
    id: params.itemId,
    type: "picturephrase",
    topic: params.topic.trim() || "general",
    media: {
      imageRef: params.imageRef,
    },
    wordBank,
    sentenceGroups,
    distractors: toWordTokens(params.distractorWords).map((token, index) => ({
      ...token,
      id: `d${index + 1}`,
    })),
    hintLevels: params.hints,
  };
}

function ensurePackShape(packId: string, payload: unknown): BrightStepsPack | Record<string, unknown> {
  return coercePicturePhrasePack(payload, packId);
}

function withAssetUrls(payload: unknown): { payload: unknown; assetUrlById: Record<string, string> } {
  const pack = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const assets = Array.isArray(pack.assets) ? pack.assets : [];

  const assetUrlById: Record<string, string> = {};

  for (const asset of assets) {
    if (!asset || typeof asset !== "object") {
      continue;
    }

    const mutableAsset = asset as Record<string, unknown>;
    const assetId = typeof mutableAsset.id === "string" ? mutableAsset.id : "";
    const kind = typeof mutableAsset.kind === "string" ? mutableAsset.kind : "";

    if (!assetId || kind !== "image") {
      continue;
    }

    const resolved = toPicturePhraseAssetUrl(assetId);
    mutableAsset.path = resolved;
    assetUrlById[assetId] = resolved;
  }

  return { payload: pack, assetUrlById };
}

export function listPicturePhrasePackSummaries(): PicturePhrasePackSummary[] {
  return listPicturePhrasePacks().map(summarizePicturePhrasePack);
}

export function getPicturePhrasePackDetails(packId: string): PicturePhrasePackDetails | null {
  const record = getPicturePhrasePack(packId);
  if (!record) {
    return null;
  }

  const { payload, assetUrlById } = withAssetUrls(ensurePackShape(packId, record.payload));
  const validation = validatePack(payload);

  return {
    record: {
      ...record,
      payload,
    },
    validation,
    assetUrlById,
    summary: summarizePicturePhrasePack({
      ...record,
      payload,
    }),
  };
}

export function createPicturePhrasePack(input: {
  packId?: string;
  title: string;
  description?: string;
  language?: string;
  ageBand?: string;
  topics?: string[];
}): PicturePhrasePackDetails {
  const packId = input.packId?.trim() || `picturephrases-${randomUUID().replaceAll("-", "").slice(0, 10)}`;

  const draft = createEmptyPicturePhrasePack({
    packId,
    title: input.title,
    description: input.description,
    language: input.language,
    ageBand: input.ageBand,
    topics: input.topics,
  });

  upsertPicturePhrasePack(packId, draft);
  const details = getPicturePhrasePackDetails(packId);

  if (!details) {
    throw new Error("Failed to create PicturePhrases pack.");
  }

  return details;
}

export function savePicturePhrasePack(packId: string, payload: unknown): PicturePhrasePackDetails {
  upsertPicturePhrasePack(packId, payload);
  const details = getPicturePhrasePackDetails(packId);

  if (!details) {
    throw new Error("Failed to save PicturePhrases pack.");
  }

  return details;
}

export async function removePicturePhrasePack(packId: string): Promise<void> {
  await deletePicturePhrasePack(packId);
}

export async function addImageCardToPack(input: {
  packId: string;
  fileBuffer: Buffer;
  mimeType: string;
  altText?: string;
  topic?: string;
}): Promise<{ details: PicturePhrasePackDetails; itemId: string; assetId: string }> {
  const details = getPicturePhrasePackDetails(input.packId);
  if (!details) {
    throw new Error("Pack not found.");
  }

  const asset = await createPicturePhraseImageAsset({
    packId: input.packId,
    fileBuffer: input.fileBuffer,
    mimeType: input.mimeType,
    altText: input.altText,
  });

  const pack = ensurePackShape(input.packId, details.record.payload) as Record<string, unknown>;
  const assets = Array.isArray(pack.assets) ? [...pack.assets] : [];
  const items = Array.isArray(pack.items) ? [...pack.items] : [];

  assets.push({
    id: asset.assetId,
    kind: "image",
    path: toPicturePhraseAssetUrl(asset.assetId),
    alt: input.altText?.trim() || "Picture prompt image",
  });

  const topic = input.topic?.trim() || "general";
  const itemId = `pp_${randomUUID().replaceAll("-", "").slice(0, 10)}`;

  items.push(
    toPicturePhraseItem({
      itemId,
      topic,
      imageRef: asset.assetId,
      canonical: defaultSentence(topic),
      variants: [defaultSentence(topic)],
      wordBankWords: ["the", "picture", "shows", topic],
      distractorWords: ["blue", "small"],
      hints: {
        level3: "Start with: The picture",
        level2: "Name what you see.",
        level1: "Use a short sentence.",
      },
    }),
  );

  const nextPayload = {
    ...pack,
    assets,
    items,
  };

  const saved = savePicturePhrasePack(input.packId, nextPayload);
  return {
    details: saved,
    itemId,
    assetId: asset.assetId,
  };
}

export async function removeImageCardFromPack(input: {
  packId: string;
  itemId: string;
}): Promise<PicturePhrasePackDetails> {
  const details = getPicturePhrasePackDetails(input.packId);
  if (!details) {
    throw new Error("Pack not found.");
  }

  const pack = ensurePackShape(input.packId, details.record.payload) as Record<string, unknown>;
  const items = Array.isArray(pack.items) ? [...pack.items] : [];

  const target = items.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return (item as Record<string, unknown>).id === input.itemId;
  }) as Record<string, unknown> | undefined;

  if (!target) {
    throw new Error("Card not found.");
  }

  const media = target.media && typeof target.media === "object" ? (target.media as Record<string, unknown>) : null;
  const imageRef = media && typeof media.imageRef === "string" ? media.imageRef : null;

  const nextItems = items.filter((item) => {
    if (!item || typeof item !== "object") {
      return true;
    }
    return (item as Record<string, unknown>).id !== input.itemId;
  });

  const assets = Array.isArray(pack.assets) ? [...pack.assets] : [];
  const nextAssets = assets.filter((asset) => {
    if (!asset || typeof asset !== "object") {
      return true;
    }

    if (!imageRef) {
      return true;
    }

    return (asset as Record<string, unknown>).id !== imageRef;
  });

  const nextPayload = {
    ...pack,
    items: nextItems,
    assets: nextAssets,
  };

  if (imageRef) {
    await deletePicturePhraseAsset(imageRef);
  }

  return savePicturePhrasePack(input.packId, nextPayload);
}

async function generateForItem(input: {
  packId: string;
  itemId: string;
}): Promise<PicturePhrasePackDetails> {
  const details = getPicturePhrasePackDetails(input.packId);
  if (!details) {
    throw new Error("Pack not found.");
  }

  const pack = ensurePackShape(input.packId, details.record.payload) as Record<string, unknown>;
  const items = Array.isArray(pack.items) ? [...pack.items] : [];
  const itemIndex = items.findIndex((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return (item as Record<string, unknown>).id === input.itemId;
  });

  if (itemIndex < 0) {
    throw new Error("Card not found.");
  }

  const targetItem = items[itemIndex] as Record<string, unknown>;
  const media = targetItem.media && typeof targetItem.media === "object"
    ? (targetItem.media as Record<string, unknown>)
    : null;
  const imageRef = media && typeof media.imageRef === "string" ? media.imageRef : "";

  if (!imageRef) {
    throw new Error("Card does not have an image reference.");
  }

  const assets = listPicturePhraseAssets(input.packId);
  const asset = assets.find((entry) => entry.assetId === imageRef);
  if (!asset) {
    throw new Error("Image asset for card not found.");
  }

  const { buffer: imageBytes } = await readPicturePhraseAssetBuffer(imageRef);

  const generated = await generatePicturePhraseContent({
    imageBuffer: imageBytes,
    mimeType: asset.mimeType,
    suggestedTopic: typeof targetItem.topic === "string" ? targetItem.topic : undefined,
  });

  const nextItem = toPicturePhraseItem({
    itemId: input.itemId,
    topic: generated.topic,
    imageRef,
    canonical: generated.canonical,
    variants: generated.variants,
    wordBankWords: generated.wordBank,
    distractorWords: generated.distractors,
    hints: generated.hints,
  });

  items[itemIndex] = nextItem;

  const nextPayload = {
    ...pack,
    items,
  };

  logPicturePhraseGeneration({
    packId: input.packId,
    itemId: input.itemId,
    provider: generated.provider,
    model: generated.model,
    promptVersion: generated.promptVersion,
    status: "success",
    outputJson: generated,
  });

  return savePicturePhrasePack(input.packId, nextPayload);
}

export async function generateForPicturePhrasePack(input: {
  packId: string;
  itemId?: string;
}): Promise<PicturePhrasePackDetails> {
  const details = getPicturePhrasePackDetails(input.packId);
  if (!details) {
    throw new Error("Pack not found.");
  }

  const pack = ensurePackShape(input.packId, details.record.payload) as Record<string, unknown>;
  const items = Array.isArray(pack.items) ? itemsFromUnknown(pack.items) : [];

  if (items.length === 0) {
    throw new Error("Add at least one image card before generating.");
  }

  if (input.itemId) {
    try {
      return await generateForItem({ packId: input.packId, itemId: input.itemId });
    } catch (error) {
      logPicturePhraseGeneration({
        packId: input.packId,
        itemId: input.itemId,
        provider: "unknown",
        model: "unknown",
        promptVersion: "pp-v1",
        status: "failure",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  let latest = details;
  for (const item of items) {
    try {
      latest = await generateForItem({ packId: input.packId, itemId: item.id });
    } catch (error) {
      logPicturePhraseGeneration({
        packId: input.packId,
        itemId: item.id,
        provider: "unknown",
        model: "unknown",
        promptVersion: "pp-v1",
        status: "failure",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  return latest;
}

function itemsFromUnknown(items: unknown[]): Array<{ id: string }> {
  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const id = (item as Record<string, unknown>).id;
      if (typeof id !== "string" || !id.trim()) {
        return null;
      }

      return { id };
    })
    .filter((item): item is { id: string } => item !== null);
}

export function toSessionPayload(packId: string): {
  pack: BrightStepsPack;
  assetUrlById: Record<string, string>;
} {
  const details = getPicturePhrasePackDetails(packId);
  if (!details) {
    throw new Error("Pack not found.");
  }

  if (!details.validation.success) {
    throw new Error("Pack is not valid yet. Generate content or fix JSON before starting a session.");
  }

  const pack = details.validation.data;

  return {
    pack,
    assetUrlById: details.assetUrlById,
  };
}
