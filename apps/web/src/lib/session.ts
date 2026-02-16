import {
  computeNextReviewState,
  createInitialReviewState,
  matchesAnySentence,
  selectFactCardSessionItems,
} from "@brightsteps/spaced-repetition";
import type { BrightStepsPack, FactCardItem, PicturePhraseItem } from "@brightsteps/content-schema";
import type { ItemStateRecord } from "@/db/client-db";

export function estimateItemCount(durationMinutes: number, moduleType: "factcards" | "picturephrases") {
  const perItemSeconds = moduleType === "factcards" ? 20 : 45;
  return Math.max(3, Math.floor((durationMinutes * 60) / perItemSeconds));
}

export function buildFactCardSessionItemOrder(
  pack: BrightStepsPack,
  states: ItemStateRecord[],
  targetCount: number,
): string[] {
  if (pack.moduleType !== "factcards") {
    return [];
  }

  const now = Date.now();
  const stateById = new Map(states.map((state) => [state.itemId, state]));

  const dueItemIds = pack.items
    .filter((item) => {
      const state = stateById.get(item.id);
      if (!state) {
        return false;
      }
      return new Date(state.dueAt).getTime() <= now;
    })
    .map((item) => item.id);

  const newItemIds = pack.items.filter((item) => !stateById.has(item.id)).map((item) => item.id);

  return selectFactCardSessionItems({
    dueItemIds,
    newItemIds,
    targetCount,
  });
}

export function gradeFactCardResponse(item: FactCardItem, response: string): boolean {
  return item.answer.trim().toLowerCase() === response.trim().toLowerCase();
}

export function updateFactCardReviewState(
  existing: ItemStateRecord | undefined,
  itemId: string,
  hintsUsed: number,
  correct: boolean,
) {
  const base = existing ? existing : { ...createInitialReviewState(itemId), packId: "", moduleType: "factcards" as const };

  return computeNextReviewState(base, {
    correct,
    hintsUsed,
  });
}

export function checkPicturePhraseResponse(item: PicturePhraseItem, candidateSentence: string): boolean {
  const acceptable = item.sentenceGroups.flatMap((group) => group.acceptable);
  return matchesAnySentence(candidateSentence, acceptable);
}

export function toSentence(tokens: string[]): string {
  return tokens.join(" ").trim();
}
