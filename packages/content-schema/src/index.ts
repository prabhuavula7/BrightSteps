import { z } from "zod";

export const moduleTypeSchema = z.enum(["factcards", "picturephrases", "vocabvoice"]);

export const assetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["image", "audio"]),
  path: z.string().min(1),
  alt: z.string().optional(),
  transcript: z.string().optional(),
  durationMs: z.number().int().positive().optional(),
});

const tokenSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  pos: z.string().optional(),
});

const sentenceGroupSchema = z.object({
  intent: z.string().min(1),
  canonical: z.string().min(1),
  acceptable: z.array(z.string().min(1)).min(1),
  requiredWordIds: z.array(z.string().min(1)).default([]),
  minWords: z.number().int().min(1),
  maxWords: z.number().int().min(1),
});

const factCardItemSchema = z.object({
  id: z.string().min(1),
  type: z.literal("factcard"),
  topic: z.string().min(1),
  prompt: z.string().min(1),
  answer: z.string().min(1),
  variants: z.array(z.string().min(1)).optional(),
  distractors: z.array(z.string().min(1)).optional(),
  hints: z.array(z.string().min(1)).optional(),
  media: z
    .object({
      imageRef: z.string().optional(),
      promptAudioRef: z.string().optional(),
      answerAudioRef: z.string().optional(),
    })
    .optional(),
});

const picturePhraseItemSchema = z.object({
  id: z.string().min(1),
  type: z.literal("picturephrase"),
  topic: z.string().min(1),
  media: z.object({
    imageRef: z.string().min(1),
    promptAudioRef: z.string().optional(),
  }),
  wordBank: z.array(tokenSchema).min(1),
  sentenceGroups: z.array(sentenceGroupSchema).min(1),
  distractors: z.array(tokenSchema).optional(),
  hintLevels: z
    .object({
      level3: z.string().optional(),
      level2: z.string().optional(),
      level1: z.string().optional(),
      level0: z.string().optional(),
    })
    .optional(),
});

const vocabReviewSchema = z.object({
  sentencePrompt: z.string().min(1),
  acceptedPronunciations: z.array(z.string().min(1)).default([]),
});

const vocabAiMetaSchema = z.object({
  provider: z.enum(["openai", "gemini", "manual"]).default("manual"),
  model: z.string().min(1).default("manual"),
  promptVersion: z.string().min(1).default("manual"),
  generatedAt: z.string().min(1).default("manual"),
});

const vocabWordItemSchema = z.object({
  id: z.string().min(1),
  type: z.literal("vocabword"),
  topic: z.string().min(1),
  word: z.string().min(1),
  syllables: z.array(z.string().min(1)).min(1),
  definition: z.string().min(1),
  partOfSpeech: z.string().optional(),
  exampleSentence: z.string().min(1),
  review: vocabReviewSchema,
  hints: z.array(z.string().min(1)).default([]),
  media: z.object({
    pronunciationAudioRef: z.string().min(1),
    imageRef: z.string().optional(),
    slowAudioRef: z.string().optional(),
  }),
  aiMeta: vocabAiMetaSchema.optional(),
});

const commonPackFields = {
  schemaVersion: z.string().min(1),
  packId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  version: z.string().min(1),
  language: z.string().min(1),
  ageBand: z.string().min(1),
  topics: z.array(z.string().min(1)).min(1),
  settings: z
    .object({
      defaultSupportLevel: z.number().int().min(0).max(3).optional(),
      audioEnabledByDefault: z.boolean().optional(),
      packThumbnailImageRef: z.string().min(1).optional(),
    })
    .optional(),
  assets: z.array(assetSchema),
};

const factCardsPackSchema = z.object({
  ...commonPackFields,
  moduleType: z.literal("factcards"),
  items: z.array(factCardItemSchema).min(1),
});

const picturePhrasesPackSchema = z.object({
  ...commonPackFields,
  moduleType: z.literal("picturephrases"),
  items: z.array(picturePhraseItemSchema).min(1),
});

const vocabVoicePackSchema = z.object({
  ...commonPackFields,
  moduleType: z.literal("vocabvoice"),
  items: z.array(vocabWordItemSchema).min(1),
});

export const packSchema = z
  .discriminatedUnion("moduleType", [factCardsPackSchema, picturePhrasesPackSchema, vocabVoicePackSchema])
  .superRefine((pack, ctx) => {
    const assetIds = new Set<string>();
    for (const asset of pack.assets) {
      if (assetIds.has(asset.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["assets"],
          message: `Duplicate asset id: ${asset.id}`,
        });
      }
      assetIds.add(asset.id);

      if (asset.kind === "image" && !asset.alt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["assets"],
          message: `Image asset ${asset.id} must include alt text`,
        });
      }
    }

    const itemIds = new Set<string>();
    for (const item of pack.items) {
      if (itemIds.has(item.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items"],
          message: `Duplicate item id: ${item.id}`,
        });
      }
      itemIds.add(item.id);

      if (item.type === "factcard") {
        const refs = [item.media?.imageRef, item.media?.promptAudioRef, item.media?.answerAudioRef].filter(
          Boolean,
        ) as string[];

        for (const ref of refs) {
          if (!assetIds.has(ref)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["items"],
              message: `FactCard item ${item.id} references missing asset ${ref}`,
            });
          }
        }
      }

      if (item.type === "picturephrase") {
        const refs = [item.media.imageRef, item.media.promptAudioRef].filter(Boolean) as string[];

        for (const ref of refs) {
          if (!assetIds.has(ref)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["items"],
              message: `PicturePhrase item ${item.id} references missing asset ${ref}`,
            });
          }
        }

        const wordIds = new Set(item.wordBank.map((token) => token.id));
        for (const group of item.sentenceGroups) {
          if (group.minWords > group.maxWords) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["items"],
              message: `PicturePhrase item ${item.id} has invalid min/max words`,
            });
          }

          for (const requiredWordId of group.requiredWordIds) {
            if (!wordIds.has(requiredWordId)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["items"],
                message: `PicturePhrase item ${item.id} required word ${requiredWordId} not found in wordBank`,
              });
            }
          }
        }
      }

      if (item.type === "vocabword") {
        const audioRefs = [item.media.pronunciationAudioRef, item.media.slowAudioRef].filter(Boolean) as string[];
        for (const ref of audioRefs) {
          if (!assetIds.has(ref)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["items"],
              message: `VocabWord item ${item.id} references missing asset ${ref}`,
            });
            continue;
          }

          const asset = pack.assets.find((entry) => entry.id === ref);
          if (asset?.kind !== "audio") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["items"],
              message: `VocabWord item ${item.id} audio ref ${ref} must point to an audio asset`,
            });
          }
        }

        if (item.media.imageRef) {
          const ref = item.media.imageRef;
          if (!assetIds.has(ref)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["items"],
              message: `VocabWord item ${item.id} references missing image asset ${ref}`,
            });
          } else {
            const asset = pack.assets.find((entry) => entry.id === ref);
            if (asset?.kind !== "image") {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["items"],
                message: `VocabWord item ${item.id} image ref ${ref} must point to an image asset`,
              });
            }
          }
        }

        const accepted = item.review.acceptedPronunciations.map((value) => value.trim().toLowerCase());
        if (!accepted.includes(item.word.trim().toLowerCase())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["items"],
            message: `VocabWord item ${item.id} must include the base word in review.acceptedPronunciations`,
          });
        }
      }
    }

    const thumbnailRef = pack.settings?.packThumbnailImageRef;
    if (thumbnailRef) {
      if (!assetIds.has(thumbnailRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["settings", "packThumbnailImageRef"],
          message: `Pack thumbnail references missing asset ${thumbnailRef}`,
        });
      } else {
        const asset = pack.assets.find((entry) => entry.id === thumbnailRef);
        if (asset?.kind !== "image") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["settings", "packThumbnailImageRef"],
            message: `Pack thumbnail asset ${thumbnailRef} must be an image`,
          });
        }
      }
    }
  });

export type ModuleType = z.infer<typeof moduleTypeSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type FactCardItem = z.infer<typeof factCardItemSchema>;
export type PicturePhraseItem = z.infer<typeof picturePhraseItemSchema>;
export type VocabWordItem = z.infer<typeof vocabWordItemSchema>;
export type BrightStepsPack = z.infer<typeof packSchema>;

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult =
  | {
      success: true;
      data: BrightStepsPack;
    }
  | {
      success: false;
      issues: ValidationIssue[];
    };

export function validatePack(input: unknown): ValidationResult {
  const result = packSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: `/${issue.path.join("/")}`,
      message: issue.message,
    })),
  };
}
