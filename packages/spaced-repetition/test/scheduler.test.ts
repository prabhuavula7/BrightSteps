import { describe, expect, it } from "vitest";
import {
  computeNextReviewState,
  createInitialReviewState,
  matchesAnySentence,
  selectFactCardSessionItems,
} from "../src";

describe("spaced repetition", () => {
  it("applies interval ladder for correct answers", () => {
    const base = createInitialReviewState("item-1", new Date("2026-01-01T00:00:00.000Z"));
    const first = computeNextReviewState(base, { correct: true, hintsUsed: 0 }, new Date("2026-01-01T00:00:00.000Z"));
    const second = computeNextReviewState(first, { correct: true, hintsUsed: 0 }, new Date("2026-01-02T00:00:00.000Z"));

    expect(first.intervalDays).toBe(1);
    expect(second.intervalDays).toBe(3);
  });

  it("resets interval after incorrect answer", () => {
    const base = createInitialReviewState("item-1", new Date("2026-01-01T00:00:00.000Z"));
    const correct = computeNextReviewState(base, { correct: true, hintsUsed: 0 }, new Date("2026-01-01T00:00:00.000Z"));
    const incorrect = computeNextReviewState(correct, { correct: false, hintsUsed: 2 }, new Date("2026-01-02T00:00:00.000Z"));

    expect(incorrect.intervalDays).toBe(1);
    expect(incorrect.streak).toBe(0);
  });

  it("selects due-heavy session composition", () => {
    const selected = selectFactCardSessionItems({
      dueItemIds: ["d1", "d2", "d3", "d4"],
      newItemIds: ["n1", "n2", "n3"],
      targetCount: 5,
    });

    expect(selected.length).toBe(5);
    expect(selected.filter((id) => id.startsWith("d")).length).toBeGreaterThanOrEqual(3);
  });
});

describe("sentence matching", () => {
  it("normalizes punctuation and case", () => {
    expect(matchesAnySentence("The cat is on the mat!", ["the cat is on the mat"])).toBe(true);
  });
});
