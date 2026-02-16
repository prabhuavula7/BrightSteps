export type SessionConfig = {
  durationMinutes: 5 | 10 | 15;
  mode: "learn" | "review";
  supportLevel: "auto" | 0 | 1 | 2 | 3;
  inputType: "tap" | "drag" | "type";
};

export type SessionItemResult = {
  itemId: string;
  correct: boolean;
  hintsUsed: number;
};
