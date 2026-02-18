import {
  computeNextReviewState,
  createInitialReviewState,
  matchesAnySentence,
  selectFactCardSessionItems,
} from "@brightsteps/spaced-repetition";
import type { BrightStepsPack, FactCardItem, PicturePhraseItem } from "@brightsteps/content-schema";
import type { ItemStateRecord } from "@/db/client-db";

export function estimateItemCount(durationMinutes: number, moduleType: "factcards" | "picturephrases" | "vocabvoice") {
  const perItemSeconds = moduleType === "factcards" ? 20 : moduleType === "picturephrases" ? 45 : 35;
  return Math.max(3, Math.floor((durationMinutes * 60) / perItemSeconds));
}

export function getReviewDurationOptions(itemCount: number): number[] {
  if (itemCount < 5) {
    return [2, 3, 5];
  }

  if (itemCount < 10) {
    return [7, 10, 15];
  }

  if (itemCount <= 20) {
    return [15, 17, 20];
  }

  return [20, 25, 30];
}

export function getDefaultReviewDuration(itemCount: number): number {
  const options = getReviewDurationOptions(itemCount);
  return options[1] ?? options[0] ?? 10;
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

export function checkPicturePhraseResponseForGroup(
  item: PicturePhraseItem,
  candidateSentence: string,
  groupIndex: number,
): boolean {
  const group = item.sentenceGroups[groupIndex];
  if (!group) {
    return checkPicturePhraseResponse(item, candidateSentence);
  }

  return matchesAnySentence(candidateSentence, [group.canonical, ...group.acceptable]);
}

export function buildPicturePhraseSessionItemOrder(
  pack: BrightStepsPack,
  targetCount: number,
): Array<{ itemId: string; groupIndex: number }> {
  if (pack.moduleType !== "picturephrases") {
    return [];
  }

  const refs: Array<{ itemId: string; groupIndex: number }> = [];
  const safeTarget = Math.max(targetCount, pack.items.length);

  while (refs.length < safeTarget) {
    for (const item of pack.items) {
      const groupLength = Math.max(1, item.sentenceGroups.length);
      const attemptsForItem = Math.min(5, groupLength);
      const seenGroups = refs.filter((entry) => entry.itemId === item.id).length;
      const groupIndex = seenGroups % attemptsForItem;

      refs.push({ itemId: item.id, groupIndex });
      if (refs.length >= safeTarget) {
        break;
      }
    }
  }

  return refs;
}

export function toSentence(tokens: string[]): string {
  return tokens.join(" ").trim();
}
