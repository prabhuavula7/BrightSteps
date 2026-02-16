"use client";

import type { BrightStepsPack, FactCardItem, PicturePhraseItem } from "@brightsteps/content-schema";
import {
  buildFactCardSessionItemOrder,
  checkPicturePhraseResponse,
  estimateItemCount,
  gradeFactCardResponse,
  toSentence,
  updateFactCardReviewState,
} from "@/lib/session";
import { db } from "@/db/client-db";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionConfig } from "@/types/session";
import { CheckCircle2, Clock3, LoaderCircle, OctagonX, XCircle } from "lucide-react";

function DraggableWord({ word, id, onClick }: { word: string; id: string; onClick: () => void }) {
  return (
    <button
      aria-label={`Word ${word}`}
      data-token-id={id}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
      onClick={onClick}
      type="button"
    >
      {word}
    </button>
  );
}

function DropZone({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-16 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-3">
      {children}
    </div>
  );
}

type FeedbackState = {
  correct: boolean;
  headline: string;
  message: string;
};

type EndReason = "completed" | "timer" | "manual";

type Props = {
  pack: BrightStepsPack;
  assetUrlById: Record<string, string>;
  config: SessionConfig;
};

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function toRuntimeAssetUrl(packId: string, pathValue: string): string {
  if (/^https?:\/\//i.test(pathValue) || /^data:/i.test(pathValue) || /^blob:/i.test(pathValue)) {
    return pathValue;
  }

  if (pathValue.startsWith("/")) {
    return pathValue;
  }

  const encoded = pathValue
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/api/packs/${encodeURIComponent(packId)}/asset/${encoded}`;
}

export function SessionPlayer({ pack, assetUrlById, config }: Props) {
  const router = useRouter();
  const completionLockRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [itemOrder, setItemOrder] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [typedAnswer, setTypedAnswer] = useState("");
  const [sentenceTokens, setSentenceTokens] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [hintCountByItem, setHintCountByItem] = useState<Record<string, number>>({});
  const [resultByItem, setResultByItem] = useState<Record<string, boolean>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(config.durationMinutes * 60);
  const [sessionStartedAtIso, setSessionStartedAtIso] = useState<string>(new Date().toISOString());
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const itemMap = useMemo(() => {
    return new Map(pack.items.map((item) => [item.id, item]));
  }, [pack.items]);

  const assetSrcById = useMemo(() => {
    return Object.fromEntries(
      pack.assets.map((asset) => {
        const mapped = assetUrlById[asset.id];
        return [asset.id, mapped ?? toRuntimeAssetUrl(pack.packId, asset.path)];
      }),
    );
  }, [assetUrlById, pack.assets, pack.packId]);

  const currentItem = itemMap.get(itemOrder[currentIndex] ?? "");
  const isLastItem = currentIndex >= itemOrder.length - 1;

  const currentFactChoices = useMemo(() => {
    if (!currentItem || currentItem.type !== "factcard") {
      return [];
    }

    return Array.from(new Set([...(currentItem.distractors ?? []), currentItem.answer]));
  }, [currentItem]);

  const totalSessionSeconds = config.durationMinutes * 60;
  const timeProgressPercent = Math.max(0, Math.min(100, Math.round((remainingSeconds / totalSessionSeconds) * 100)));
  const timeLow = remainingSeconds <= 60;

  useEffect(() => {
    let cancelled = false;

    async function initSession() {
      setLoading(true);
      setCurrentIndex(0);
      setSelectedAnswer("");
      setTypedAnswer("");
      setSentenceTokens([]);
      setFeedback(null);
      setHintCountByItem({});
      setResultByItem({});
      setIsTransitioning(false);
      completionLockRef.current = false;
      setIsCompleting(false);
      setRemainingSeconds(config.durationMinutes * 60);
      setSessionStartedAtIso(new Date().toISOString());

      const targetCount = estimateItemCount(config.durationMinutes, pack.moduleType);

      if (pack.moduleType === "factcards") {
        const states = await db.itemStates.where("packId").equals(pack.packId).toArray();
        const ordered = buildFactCardSessionItemOrder(pack, states, targetCount);
        const fallback = pack.items.slice(0, targetCount).map((item) => item.id);
        if (!cancelled) {
          setItemOrder(ordered.length > 0 ? ordered : fallback);
        }
      } else {
        const fallback = pack.items.slice(0, targetCount).map((item) => item.id);
        if (!cancelled) {
          setItemOrder(fallback);
        }
      }

      if (!cancelled) {
        setLoading(false);
      }
    }

    void initSession();
    return () => {
      cancelled = true;
    };
  }, [config.durationMinutes, pack]);

  useEffect(() => {
    if (loading || itemOrder.length === 0 || isCompleting) {
      return;
    }

    const timerId = window.setInterval(() => {
      setRemainingSeconds((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [isCompleting, itemOrder.length, loading]);

  const completeSession = useCallback(async (reason: EndReason) => {
    if (completionLockRef.current) {
      return;
    }

    completionLockRef.current = true;
    setIsCompleting(true);

    const totalItems = itemOrder.length;
    const correctItems = Object.values(resultByItem).filter(Boolean).length;
    const hintCount = Object.values(hintCountByItem).reduce((total, count) => total + count, 0);

    await db.sessionHistory.add({
      packId: pack.packId,
      moduleType: pack.moduleType,
      startedAt: sessionStartedAtIso,
      completedAt: new Date().toISOString(),
      durationMinutes: config.durationMinutes,
      totalItems,
      correctItems,
      hintCount,
    });

    const params = new URLSearchParams({
      packId: pack.packId,
      moduleType: pack.moduleType,
      total: String(totalItems),
      correct: String(correctItems),
      hints: String(hintCount),
      endedBy: reason,
    });

    router.push(`/summary?${params.toString()}`);
  }, [
    config.durationMinutes,
    hintCountByItem,
    itemOrder.length,
    pack.moduleType,
    pack.packId,
    resultByItem,
    router,
    sessionStartedAtIso,
  ]);

  useEffect(() => {
    if (loading || itemOrder.length === 0 || remainingSeconds > 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void completeSession("timer");
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [completeSession, itemOrder.length, loading, remainingSeconds]);

  async function evaluateFactCard(item: FactCardItem) {
    const answer = selectedAnswer || typedAnswer;
    const correct = gradeFactCardResponse(item, answer);

    setResultByItem((previous) => ({ ...previous, [item.id]: correct }));
    setFeedback({
      correct,
      headline: correct ? "Right!" : "Wrong",
      message: correct ? "Great job. Keep going." : `Correct answer: ${item.answer}`,
    });

    const stateId = `${pack.packId}:${item.id}`;
    const existing = await db.itemStates.get(stateId);
    const nextState = updateFactCardReviewState(existing, item.id, hintCountByItem[item.id] ?? 0, correct);

    await db.itemStates.put({
      id: stateId,
      ...existing,
      ...nextState,
      packId: pack.packId,
      itemId: item.id,
      moduleType: "factcards",
    });
  }

  async function evaluatePicturePhrase(item: PicturePhraseItem) {
    const sentence = toSentence(sentenceTokens);
    const correct = checkPicturePhraseResponse(item, sentence);

    setResultByItem((previous) => ({ ...previous, [item.id]: correct }));
    setFeedback({
      correct,
      headline: correct ? "Right!" : "Wrong",
      message: correct
        ? "Nice sentence. Keep it up."
        : "Try a clearer sentence with key words from the picture.",
    });

    await db.itemStates.put({
      id: `${pack.packId}:${item.id}`,
      packId: pack.packId,
      itemId: item.id,
      moduleType: "picturephrases",
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      streak: correct ? 1 : 0,
      supportLevel: 2,
      lastResult: {
        correct,
        hintsUsed: hintCountByItem[item.id] ?? 0,
        reviewedAt: new Date().toISOString(),
      },
    });
  }

  function resetQuestionState() {
    setSelectedAnswer("");
    setTypedAnswer("");
    setSentenceTokens([]);
    setFeedback(null);
    setIsTransitioning(false);
  }

  const moveToNextOrComplete = useCallback(async () => {
    if (isTransitioning || isCompleting) {
      return;
    }

    setIsTransitioning(true);

    if (isLastItem) {
      await completeSession("completed");
      return;
    }

    setCurrentIndex((index) => index + 1);
    resetQuestionState();
  }, [completeSession, isCompleting, isLastItem, isTransitioning]);

  useEffect(() => {
    if (!feedback || isCompleting) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void moveToNextOrComplete();
    }, 1100);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [feedback, isCompleting, moveToNextOrComplete]);

  async function handleContinue() {
    if (!currentItem || isCompleting) {
      return;
    }

    if (feedback) {
      await moveToNextOrComplete();
      return;
    }

    if (pack.moduleType === "factcards" && !Boolean((selectedAnswer || typedAnswer).trim())) {
      return;
    }

    if (pack.moduleType === "factcards") {
      await evaluateFactCard(currentItem as FactCardItem);
    } else {
      await evaluatePicturePhrase(currentItem as PicturePhraseItem);
    }
  }

  function useHint() {
    if (!currentItem) {
      return;
    }

    setHintCountByItem((previous) => ({
      ...previous,
      [currentItem.id]: (previous[currentItem.id] ?? 0) + 1,
    }));
  }

  if (loading) {
    return <div className="card p-6">Preparing session...</div>;
  }

  if (!currentItem) {
    return (
      <div className="card p-6">
        <p className="text-sm text-slate-700">No questions are available for this session.</p>
      </div>
    );
  }

  const progressText = `${currentIndex + 1} / ${itemOrder.length}`;

  const factImageSrc =
    currentItem.type === "factcard" && currentItem.media?.imageRef
      ? assetSrcById[currentItem.media.imageRef]
      : undefined;

  const pictureImageSrc =
    currentItem.type === "picturephrase" ? assetSrcById[currentItem.media.imageRef] : undefined;

  const feedbackTone = feedback
    ? feedback.correct
      ? "border-emerald-300 bg-emerald-50/70"
      : "border-rose-300 bg-rose-50/70"
    : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-700">
          <span>Session Progress: {progressText}</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 ${timeLow ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
            <Clock3 className="h-4 w-4" />
            {formatCountdown(remainingSeconds)}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all ${timeLow ? "bg-rose-500" : "bg-[#2badee]"}`}
            style={{ width: `${timeProgressPercent}%` }}
          />
        </div>
      </div>

      {pack.moduleType === "factcards" ? (
        <div className={`card flex flex-col gap-4 p-6 transition-colors ${feedbackTone}`}>
          <span className="inline-flex w-fit rounded-full bg-[#2badee]/10 px-3 py-1 text-xs font-bold text-[#2badee]">
            FactCards
          </span>

          {feedback ? (
            <div
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                feedback.correct ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-rose-300 bg-rose-50 text-rose-700"
              }`}
            >
              {feedback.correct ? <CheckCircle2 className="mt-0.5 h-5 w-5" /> : <XCircle className="mt-0.5 h-5 w-5" />}
              <div>
                <p className="text-base font-bold">{feedback.headline}</p>
                <p className="text-sm">{feedback.message}</p>
              </div>
            </div>
          ) : null}

          <h2 className="text-2xl font-bold text-slate-900">{(currentItem as FactCardItem).prompt}</h2>

          {factImageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="Visual support"
              className="h-56 w-full rounded-lg border border-slate-200 object-contain bg-white"
              src={factImageSrc}
            />
          ) : null}

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {currentFactChoices.map((choice) => (
              <button
                key={choice}
                className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold transition ${
                  selectedAnswer === choice
                    ? "border-[#2badee] bg-[#2badee]/10"
                    : "border-slate-300 bg-white hover:border-[#2badee]/60"
                }`}
                onClick={() => {
                  if (feedback) {
                    return;
                  }
                  setSelectedAnswer(choice);
                }}
                type="button"
              >
                {choice}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-600">Type answer (optional)</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2"
              value={typedAnswer}
              onChange={(event) => {
                if (feedback) {
                  return;
                }
                setTypedAnswer(event.target.value);
              }}
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              aria-label="Show clue"
              className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
              onClick={useHint}
              type="button"
            >
              Hint
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-[#2badee] px-3 py-2 text-sm font-bold text-white"
              onClick={() => void handleContinue()}
              type="button"
            >
              {isTransitioning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {feedback ? (isLastItem ? "Finish Session" : "Next Question") : "Check & Next"}
            </button>
          </div>

          {(hintCountByItem[currentItem.id] ?? 0) > 0 && (currentItem as FactCardItem).hints?.length ? (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{(currentItem as FactCardItem).hints?.[0]}</p>
          ) : null}
        </div>
      ) : (
          <div className={`card flex flex-col gap-4 p-6 transition-colors ${feedbackTone}`}>
            <span className="inline-flex w-fit rounded-full bg-[#2badee]/10 px-3 py-1 text-xs font-bold text-[#2badee]">
              PicturePhrases
            </span>

            {feedback ? (
              <div
                className={`flex items-start gap-3 rounded-lg border p-3 ${
                  feedback.correct ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-rose-300 bg-rose-50 text-rose-700"
                }`}
              >
                {feedback.correct ? <CheckCircle2 className="mt-0.5 h-5 w-5" /> : <XCircle className="mt-0.5 h-5 w-5" />}
                <div>
                  <p className="text-base font-bold">{feedback.headline}</p>
                  <p className="text-sm">{feedback.message}</p>
                </div>
              </div>
            ) : null}

            {pictureImageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Picture prompt"
                className="h-56 w-full rounded-lg border border-slate-200 object-cover"
                src={pictureImageSrc}
              />
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                <div className="inline-flex items-center gap-2">
                  <OctagonX className="h-4 w-4" />
                  Picture unavailable for this item.
                </div>
              </div>
            )}

            <DropZone>
              <div className="flex min-h-10 flex-wrap gap-2">
                {sentenceTokens.length === 0 ? (
                  <span className="text-sm text-slate-500">Drag words here (or tap words to add).</span>
                ) : (
                  sentenceTokens.map((token, index) => (
                    <div
                      key={`${token}-${index}`}
                      className="inline-flex items-center gap-1 rounded-md bg-[#2badee]/10 px-2 py-1 text-sm text-[#2badee]"
                    >
                      <span>{token}</span>
                      <button
                        aria-label="Remove item"
                        className="rounded px-1 text-xs text-[#2badee]/70 hover:bg-[#2badee]/15 hover:text-[#2badee]"
                        onClick={() => {
                          if (feedback) {
                            return;
                          }
                          setSentenceTokens((previous) => previous.filter((_, tokenIndex) => tokenIndex !== index));
                        }}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </DropZone>

            <div className="flex flex-wrap gap-2">
              {(currentItem as PicturePhraseItem).wordBank.map((token) => (
                <DraggableWord
                  key={token.id}
                  id={`${currentItem.id}-${token.id}`}
                  onClick={() => {
                    if (feedback) {
                      return;
                    }
                    setSentenceTokens((previous) => [...previous, token.text]);
                  }}
                  word={token.text}
                />
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                aria-label="Show clue"
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={useHint}
                type="button"
              >
                Hint
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-[#2badee] px-3 py-2 text-sm font-bold text-white"
                onClick={() => void handleContinue()}
                type="button"
              >
                {isTransitioning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {feedback ? (isLastItem ? "Finish Session" : "Next Question") : "Check & Next"}
              </button>
              <button
                aria-label="Clear sentence"
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => {
                  if (feedback) {
                    return;
                  }
                  setSentenceTokens([]);
                }}
                type="button"
              >
                Clear
              </button>
            </div>

            {(hintCountByItem[currentItem.id] ?? 0) > 0 && (currentItem as PicturePhraseItem).hintLevels ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                {(currentItem as PicturePhraseItem).hintLevels?.level3 ??
                  "Try building a short sentence with the key words."}
              </p>
            ) : null}
          </div>
      )}
    </div>
  );
}
