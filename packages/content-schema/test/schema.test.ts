import { describe, expect, it } from "vitest";
import { validatePack } from "../src";

const validFactcardsPack = {
  schemaVersion: "2.0.0",
  packId: "geo-factcards-001",
  moduleType: "factcards",
  title: "Geography Basics",
  version: "1.0.0",
  language: "en",
  ageBand: "6-10",
  topics: ["geography"],
  assets: [{ id: "img_france", kind: "image", path: "assets/images/france.svg", alt: "France map" }],
  items: [
    {
      id: "fc_1",
      type: "factcard",
      topic: "geography",
      prompt: "What is the capital of France?",
      answer: "Paris",
      media: { imageRef: "img_france" },
    },
  ],
};

describe("pack validation", () => {
  it("accepts valid factcards pack", () => {
    const result = validatePack(validFactcardsPack);
    expect(result.success).toBe(true);
  });

  it("rejects mixed module item types", () => {
    const mixedPack = {
      ...validFactcardsPack,
      items: [
        ...validFactcardsPack.items,
        {
          id: "pp_1",
          type: "picturephrase",
          topic: "geography",
          media: { imageRef: "img_france" },
          wordBank: [{ id: "w1", text: "Paris" }],
          sentenceGroups: [
            {
              intent: "simple",
              canonical: "Paris is in France",
              acceptable: ["Paris is in France"],
              requiredWordIds: ["w1"],
              minWords: 2,
              maxWords: 6,
            },
          ],
        },
      ],
    };

    const result = validatePack(mixedPack);
    expect(result.success).toBe(false);
  });

  it("rejects missing asset refs", () => {
    const invalidPack = {
      ...validFactcardsPack,
      items: [
        {
          id: "fc_1",
          type: "factcard",
          topic: "geography",
          prompt: "What is the capital of France?",
          answer: "Paris",
          media: { imageRef: "missing" },
        },
      ],
    };

    const result = validatePack(invalidPack);
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.issues.some((issue) => issue.message.includes("missing asset"))).toBe(true);
    }
  });

  it("rejects missing pack thumbnail asset refs", () => {
    const invalidPack = {
      ...validFactcardsPack,
      settings: {
        packThumbnailImageRef: "missing_thumb",
      },
    };

    const result = validatePack(invalidPack);
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.issues.some((issue) => issue.message.includes("Pack thumbnail references missing asset"))).toBe(
        true,
      );
    }
  });

  it("rejects non-image pack thumbnail assets", () => {
    const invalidPack = {
      ...validFactcardsPack,
      assets: [
        ...validFactcardsPack.assets,
        {
          id: "audio_thumb",
          kind: "audio",
          path: "assets/audio/thumb.mp3",
        },
      ],
      settings: {
        packThumbnailImageRef: "audio_thumb",
      },
    };

    const result = validatePack(invalidPack);
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.issues.some((issue) => issue.message.includes("must be an image"))).toBe(true);
    }
  });
});
