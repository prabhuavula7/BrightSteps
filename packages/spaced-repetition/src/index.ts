export type ReviewResult = {
  correct: boolean;
  hintsUsed: number;
  reviewedAt: string;
};

export type ReviewState = {
  itemId: string;
  dueAt: string;
  intervalDays: number;
  streak: number;
  supportLevel: 0 | 1 | 2 | 3;
  lastResult?: ReviewResult;
};

export type SessionSelectionInput = {
  dueItemIds: string[];
  newItemIds: string[];
  targetCount: number;
};

const LADDER = [1, 3, 7, 14, 30, 45, 60];

export function createInitialReviewState(itemId: string, now = new Date()): ReviewState {
  return {
    itemId,
    dueAt: now.toISOString(),
    intervalDays: 0,
    streak: 0,
    supportLevel: 3,
  };
}

export function computeNextReviewState(
  current: ReviewState,
  result: Omit<ReviewResult, "reviewedAt">,
  now = new Date(),
): ReviewState {
  const nextStreak = result.correct ? current.streak + 1 : 0;
  const intervalDays = result.correct
    ? (LADDER[Math.min(nextStreak - 1, LADDER.length - 1)] ?? LADDER[LADDER.length - 1] ?? 1)
    : 1;

  const dueAtDate = new Date(now);
  dueAtDate.setDate(dueAtDate.getDate() + intervalDays);

  return {
    ...current,
    streak: nextStreak,
    intervalDays,
    dueAt: dueAtDate.toISOString(),
    supportLevel: adjustSupportLevel(current.supportLevel, result.correct, result.hintsUsed),
    lastResult: {
      ...result,
      reviewedAt: now.toISOString(),
    },
  };
}

export function adjustSupportLevel(
  supportLevel: 0 | 1 | 2 | 3,
  correct: boolean,
  hintsUsed: number,
): 0 | 1 | 2 | 3 {
  if (correct && hintsUsed === 0) {
    return Math.max(0, supportLevel - 1) as 0 | 1 | 2 | 3;
  }

  if (!correct) {
    return Math.min(3, supportLevel + 1) as 0 | 1 | 2 | 3;
  }

  return supportLevel;
}

export function selectFactCardSessionItems(input: SessionSelectionInput): string[] {
  const { dueItemIds, newItemIds, targetCount } = input;

  const dueTarget = Math.min(dueItemIds.length, Math.ceil(targetCount * 0.6));
  const picks = new Set<string>();

  for (const id of dueItemIds.slice(0, dueTarget)) {
    picks.add(id);
  }

  for (const id of newItemIds) {
    if (picks.size >= targetCount) {
      break;
    }
    picks.add(id);
  }

  for (const id of dueItemIds) {
    if (picks.size >= targetCount) {
      break;
    }
    picks.add(id);
  }

  return [...picks];
}

export function normalizeSentence(sentence: string): string {
  return sentence
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

export function matchesAnySentence(userSentence: string, acceptableSentences: string[]): boolean {
  const normalizedInput = normalizeSentence(userSentence);
  return acceptableSentences.some((candidate) => normalizeSentence(candidate) === normalizedInput);
}
