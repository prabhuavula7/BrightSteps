"use client";

import type { BrightStepsPack, FactCardItem, PicturePhraseItem } from "@brightsteps/content-schema";
import { useSettings } from "@/components/settings-provider";
import {
  buildPicturePhraseSessionItemOrder,
  buildFactCardSessionItemOrder,
  checkPicturePhraseResponseForGroup,
  estimateItemCount,
  gradeFactCardResponse,
  toSentence,
  updateFactCardReviewState,
} from "@/lib/session";
import { db } from "@/db/client-db";
import { fetchLearnContent, type LearnContentResponse, type LearnContentRequest } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionConfig } from "@/types/session";
import { CheckCircle2, Clock3, LoaderCircle, OctagonX, Volume2, XCircle } from "lucide-react";

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

function AudioTrackPreview({ src }: { src: string }) {
  const bars = [32, 48, 36, 54, 40, 58, 34, 52, 44, 30];

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
        <Volume2 className="h-4 w-4" />
        Audio Prompt
      </div>
      <div aria-hidden className="mt-3 flex h-14 items-end gap-1.5 rounded-md border border-emerald-100 bg-white px-2">
        {bars.map((height, index) => (
          <span
            className="w-1.5 rounded-full bg-emerald-400/80"
            key={`bar-${index}`}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <audio className="mt-3 w-full" controls preload="none" src={src} />
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

type LearnState = {
  loading: boolean;
  data?: LearnContentResponse;
  error?: string;
};

function parsePicturePhraseOrderRef(value: string): { itemId: string; groupIndex: number } {
  const [itemIdRaw, groupRaw] = value.split("::");
  const itemId = itemIdRaw ?? "";
  const parsed = Number.parseInt(groupRaw ?? "0", 10);
  return {
    itemId,
    groupIndex: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
  };
}

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

function toLearnRequest(params: {
  pack: BrightStepsPack;
  item: FactCardItem | PicturePhraseItem;
  groupIndex: number;
}): LearnContentRequest {
  if (params.item.type === "factcard") {
    return {
      moduleType: "factcards",
      packId: params.pack.packId,
      itemId: params.item.id,
      language: params.pack.language,
      ageBand: params.pack.ageBand,
      item: {
        topic: params.item.topic,
        prompt: params.item.prompt,
        answer: params.item.answer,
        hints: params.item.hints ?? [],
      },
    };
  }

  const targetGroup = params.item.sentenceGroups[params.groupIndex] ?? params.item.sentenceGroups[0];

  return {
    moduleType: "picturephrases",
    packId: params.pack.packId,
    itemId: params.item.id,
    language: params.pack.language,
    ageBand: params.pack.ageBand,
    item: {
      topic: params.item.topic,
      canonical: targetGroup?.canonical ?? "The picture shows a scene.",
      variants: params.item.sentenceGroups.map((group) => group.canonical).slice(0, 5),
      wordBank: params.item.wordBank.map((token) => token.text),
    },
  };
}

export function SessionPlayer({ pack, assetUrlById, config }: Props) {
  const { settings } = useSettings();
  const router = useRouter();
  const completionLockRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [itemOrder, setItemOrder] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [typedAnswer, setTypedAnswer] = useState("");
  const [typedPictureSentence, setTypedPictureSentence] = useState("");
  const [sentenceTokens, setSentenceTokens] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [hintCountByItem, setHintCountByItem] = useState<Record<string, number>>({});
  const [resultByItem, setResultByItem] = useState<Record<string, boolean>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(Math.max(0, config.durationMinutes * 60));
  const [sessionStartedAtIso, setSessionStartedAtIso] = useState<string>(new Date().toISOString());
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [learnStateByOrderRef, setLearnStateByOrderRef] = useState<Record<string, LearnState>>({});

  const isLearnMode = config.mode === "learn";
  const isReviewMode = config.mode === "review";

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

  const currentOrderRef = itemOrder[currentIndex] ?? "";
  const picturePhraseOrderRef = parsePicturePhraseOrderRef(currentOrderRef);
  const currentItem =
    pack.moduleType === "picturephrases"
      ? itemMap.get(picturePhraseOrderRef.itemId ?? "")
      : itemMap.get(currentOrderRef);
  const isLastItem = currentIndex >= itemOrder.length - 1;

  const activeSentenceGroupIndex =
    pack.moduleType === "picturephrases" ? picturePhraseOrderRef.groupIndex : 0;

  const currentFactChoices = useMemo(() => {
    if (!currentItem || currentItem.type !== "factcard") {
      return [];
    }

    return Array.from(new Set([...(currentItem.distractors ?? []), currentItem.answer]));
  }, [currentItem]);

  const totalSessionSeconds = Math.max(0, config.durationMinutes * 60);
  const timeProgressPercent =
    totalSessionSeconds > 0 ? Math.max(0, Math.min(100, Math.round((remainingSeconds / totalSessionSeconds) * 100))) : 0;
  const timeLow = remainingSeconds <= 60;
  const progressPercent = itemOrder.length > 0 ? Math.round(((currentIndex + 1) / itemOrder.length) * 100) : 0;

  useEffect(() => {
    let cancelled = false;

    async function initSession() {
      setLoading(true);
      setCurrentIndex(0);
      setSelectedAnswer("");
      setTypedAnswer("");
      setTypedPictureSentence("");
      setSentenceTokens([]);
      setFeedback(null);
      setHintCountByItem({});
      setResultByItem({});
      setIsTransitioning(false);
      completionLockRef.current = false;
      setIsCompleting(false);
      setLearnStateByOrderRef({});
      setRemainingSeconds(Math.max(0, config.durationMinutes * 60));
      setSessionStartedAtIso(new Date().toISOString());

      if (isLearnMode) {
        if (pack.moduleType === "factcards") {
          const order = pack.items.map((item) => item.id);
          if (!cancelled) {
            setItemOrder(order);
          }
        } else {
          const order = pack.items.map((item) => `${item.id}::0`);
          if (!cancelled) {
            setItemOrder(order);
          }
        }

        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      const targetCount = estimateItemCount(config.durationMinutes, pack.moduleType);

      if (pack.moduleType === "factcards") {
        const states = await db.itemStates.where("packId").equals(pack.packId).toArray();
        const ordered = buildFactCardSessionItemOrder(pack, states, targetCount);
        const fallback = pack.items.slice(0, targetCount).map((item) => item.id);
        if (!cancelled) {
          setItemOrder(ordered.length > 0 ? ordered : fallback);
        }
      } else {
        const fallback = buildPicturePhraseSessionItemOrder(pack, targetCount).map(
          (entry) => `${entry.itemId}::${entry.groupIndex}`,
        );
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
  }, [config.durationMinutes, isLearnMode, pack]);

  useEffect(() => {
    if (!isReviewMode || loading || itemOrder.length === 0 || isCompleting) {
      return;
    }

    const timerId = window.setInterval(() => {
      setRemainingSeconds((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [isCompleting, isReviewMode, itemOrder.length, loading]);

  const completeSession = useCallback(async (reason: EndReason) => {
    if (completionLockRef.current) {
      return;
    }

    completionLockRef.current = true;
    setIsCompleting(true);

    const totalItems = itemOrder.length;
    const correctItems = Object.values(resultByItem).filter(Boolean).length;
    const hintCount = Object.values(hintCountByItem).reduce((total, count) => total + count, 0);
    const startedAtDate = new Date(sessionStartedAtIso);
    const elapsedMs = Date.now() - startedAtDate.getTime();
    const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60000));

    await db.sessionHistory.add({
      packId: pack.packId,
      moduleType: pack.moduleType,
      mode: config.mode,
      startedAt: sessionStartedAtIso,
      completedAt: new Date().toISOString(),
      durationMinutes: isReviewMode ? config.durationMinutes : elapsedMinutes,
      totalItems,
      correctItems,
      hintCount,
    });
    window.dispatchEvent(new CustomEvent("brightsteps:session-completed"));

    const params = new URLSearchParams({
      packId: pack.packId,
      moduleType: pack.moduleType,
      total: String(totalItems),
      correct: String(correctItems),
      hints: String(hintCount),
      endedBy: reason,
      mode: config.mode,
    });

    router.push(`/summary?${params.toString()}`);
  }, [
    config.durationMinutes,
    config.mode,
    hintCountByItem,
    isReviewMode,
    itemOrder.length,
    pack.moduleType,
    pack.packId,
    resultByItem,
    router,
    sessionStartedAtIso,
  ]);

  useEffect(() => {
    if (!isReviewMode || loading || itemOrder.length === 0 || remainingSeconds > 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void completeSession("timer");
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [completeSession, isReviewMode, itemOrder.length, loading, remainingSeconds]);

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
    const sentence =
      config.inputType === "type" ? typedPictureSentence.trim() : toSentence(sentenceTokens);
    const correct = checkPicturePhraseResponseForGroup(item, sentence, activeSentenceGroupIndex);
    const targetGroup =
      item.sentenceGroups[activeSentenceGroupIndex] ??
      item.sentenceGroups[0];

    setResultByItem((previous) => ({ ...previous, [item.id]: correct }));
    setFeedback({
      correct,
      headline: correct ? "Right!" : "Wrong",
      message: correct
        ? "Nice sentence. Keep it up."
        : `Try again. One valid sentence is: ${targetGroup?.canonical ?? "Use key words from the picture."}`,
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
    setTypedPictureSentence("");
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
    if (!isReviewMode || !feedback || isCompleting) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void moveToNextOrComplete();
    }, 1100);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [feedback, isCompleting, isReviewMode, moveToNextOrComplete]);

  const loadLearnContent = useCallback(async (orderRef: string, item: FactCardItem | PicturePhraseItem, groupIndex: number) => {
    if (!orderRef) {
      return;
    }

    const currentState = learnStateByOrderRef[orderRef];
    if (currentState?.loading || currentState?.data || currentState?.error) {
      return;
    }

    setLearnStateByOrderRef((previous) => ({
      ...previous,
      [orderRef]: { loading: true },
    }));

    try {
      const payload = toLearnRequest({
        pack,
        item,
        groupIndex,
      });

      const learn = await fetchLearnContent(payload);
      setLearnStateByOrderRef((previous) => ({
        ...previous,
        [orderRef]: {
          loading: false,
          data: learn,
        },
      }));
    } catch (error) {
      setLearnStateByOrderRef((previous) => ({
        ...previous,
        [orderRef]: {
          loading: false,
          error: error instanceof Error ? error.message : "Learn content unavailable",
        },
      }));
    }
  }, [learnStateByOrderRef, pack]);

  useEffect(() => {
    if (!isLearnMode || !currentItem || !currentOrderRef) {
      return;
    }

    void loadLearnContent(currentOrderRef, currentItem as FactCardItem | PicturePhraseItem, activeSentenceGroupIndex);
  }, [activeSentenceGroupIndex, currentItem, currentOrderRef, isLearnMode, loadLearnContent]);

  useEffect(() => {
    if (!isLearnMode || itemOrder.length === 0) {
      return;
    }

    const nextOrderRef = itemOrder[currentIndex + 1];
    if (!nextOrderRef) {
      return;
    }

    const nextRef = parsePicturePhraseOrderRef(nextOrderRef);
    const nextItem =
      pack.moduleType === "picturephrases"
        ? itemMap.get(nextRef.itemId)
        : itemMap.get(nextOrderRef);

    if (!nextItem) {
      return;
    }

    void loadLearnContent(nextOrderRef, nextItem, nextRef.groupIndex);
  }, [currentIndex, isLearnMode, itemMap, itemOrder, loadLearnContent, pack.moduleType]);

  async function handleContinue() {
    if (!currentItem || isCompleting) {
      return;
    }

    if (isLearnMode) {
      setResultByItem((previous) => ({ ...previous, [currentItem.id]: true }));
      await moveToNextOrComplete();
      return;
    }

    if (feedback) {
      await moveToNextOrComplete();
      return;
    }

    if (pack.moduleType === "factcards" && !Boolean((selectedAnswer || typedAnswer).trim())) {
      return;
    }

    if (pack.moduleType === "picturephrases") {
      if (config.inputType === "type" && !typedPictureSentence.trim()) {
        return;
      }
      if (config.inputType !== "type" && sentenceTokens.length === 0) {
        return;
      }
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
  const factAudioSrc =
    settings.audioEnabled && currentItem.type === "factcard"
      ? currentItem.media?.promptAudioRef
        ? assetSrcById[currentItem.media.promptAudioRef]
        : currentItem.media?.answerAudioRef
          ? assetSrcById[currentItem.media.answerAudioRef]
          : undefined
      : undefined;

  const pictureImageSrc =
    currentItem.type === "picturephrase" ? assetSrcById[currentItem.media.imageRef] : undefined;
  const pictureWordBank =
    currentItem.type === "picturephrase" ? currentItem.wordBank.map((token) => token.text) : [];

  const pictureFrameHeight = isLearnMode
    ? "clamp(260px, 58svh, 820px)"
    : config.inputType === "type"
      ? "clamp(260px, 52svh, 760px)"
      : "clamp(220px, 46svh, 680px)";
  const typedFragment = typedPictureSentence.split(/\s+/).pop()?.toLowerCase() ?? "";
  const typeSuggestion =
    config.inputType === "type" && typedFragment
      ? pictureWordBank.find((word) => word.toLowerCase().startsWith(typedFragment) && word.toLowerCase() !== typedFragment)
      : undefined;

  const feedbackTone = feedback
    ? feedback.correct
      ? "border-emerald-300 bg-emerald-50/70"
      : "border-rose-300 bg-rose-50/70"
    : "";

  const continueLabel = isLearnMode
    ? isLastItem
      ? "Finish Session"
      : "Next Card"
    : feedback
      ? isLastItem
        ? "Finish Session"
        : "Next Question"
      : "Check & Next";

  const currentLearnState = learnStateByOrderRef[currentOrderRef];

  return (
    <div className="flex flex-col gap-4">
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-700">
          <span>Session Progress: {progressText}</span>
          {isReviewMode ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 ${timeLow ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
              <Clock3 className="h-4 w-4" />
              {formatCountdown(remainingSeconds)}
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Untimed Learn Mode</span>
          )}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all ${isReviewMode ? (timeLow ? "bg-rose-500" : "bg-brand") : "bg-emerald-500"}`}
            style={{ width: `${isReviewMode ? timeProgressPercent : progressPercent}%` }}
          />
        </div>
      </div>

      {pack.moduleType === "factcards" ? (
        <div className={`card flex flex-col gap-4 p-6 transition-colors ${isReviewMode ? feedbackTone : ""}`}>
          <span className="inline-flex w-fit rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
            FactCards {isLearnMode ? "Learn" : "Review"}
          </span>

          {isReviewMode && feedback ? (
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

          {factImageSrc || factAudioSrc ? (
            <div className={`grid gap-3 ${factImageSrc && factAudioSrc ? "md:grid-cols-2" : "grid-cols-1"}`}>
              {factImageSrc ? (
                <div className="rounded-lg border border-slate-200 bg-white p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Visual Support</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="Visual support"
                    className={`mt-2 w-full rounded-lg border border-slate-200 bg-white object-contain ${
                      factAudioSrc ? "h-56" : "h-72"
                    }`}
                    src={factImageSrc}
                  />
                </div>
              ) : null}

              {factAudioSrc ? <AudioTrackPreview src={factAudioSrc} /> : null}
            </div>
          ) : null}

          {isLearnMode ? (
            <>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm font-semibold text-emerald-900">Answer</p>
                <p className="mt-1 text-base font-bold text-emerald-800">{(currentItem as FactCardItem).answer}</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                {currentLearnState?.loading ? (
                  <div className="inline-flex items-center gap-2 text-sm text-slate-600">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Preparing learn guidance...
                  </div>
                ) : currentLearnState?.data ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{currentLearnState.data.content.headline}</p>
                      <p className="mt-1 text-sm text-slate-700">{currentLearnState.data.content.teachText}</p>
                    </div>
                    {currentLearnState.data.content.keyPoints.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {currentLearnState.data.content.keyPoints.map((point) => (
                          <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700" key={point}>
                            {point}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {settings.audioEnabled && currentLearnState.data.audioUrl ? (
                      <audio className="w-full" controls preload="none" src={currentLearnState.data.audioUrl} />
                    ) : null}
                  </div>
                ) : currentLearnState?.error ? (
                  <p className="text-sm text-amber-700">{currentLearnState.error}</p>
                ) : (
                  <p className="text-sm text-slate-600">Learn guidance will appear here.</p>
                )}
              </div>

              {(currentItem as FactCardItem).hints?.length ? (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Tip: {(currentItem as FactCardItem).hints?.[0]}</p>
              ) : null}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {currentFactChoices.map((choice) => (
                  <button
                    key={choice}
                    className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold transition ${
                      selectedAnswer === choice
                        ? "border-brand bg-brand-soft"
                        : "border-slate-300 bg-white hover:border-brand"
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

              {(hintCountByItem[currentItem.id] ?? 0) > 0 && (currentItem as FactCardItem).hints?.length ? (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{(currentItem as FactCardItem).hints?.[0]}</p>
              ) : null}
            </>
          )}

          <div className="flex flex-wrap gap-3">
            {isReviewMode ? (
              <button
                aria-label="Show clue"
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={useHint}
                type="button"
              >
                Hint
              </button>
            ) : null}
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white"
              onClick={() => void handleContinue()}
              type="button"
            >
              {isTransitioning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {continueLabel}
            </button>
          </div>
        </div>
      ) : (
          <div className={`card flex flex-col gap-4 p-6 transition-colors ${isReviewMode ? feedbackTone : ""}`}>
            <span className="inline-flex w-fit rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
              PicturePhrases {isLearnMode ? "Learn" : "Review"}
            </span>

            {isReviewMode && feedback ? (
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
              <div
                className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white p-2"
                style={{
                  height: pictureFrameHeight,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="Picture prompt"
                  className="h-full w-full rounded-md object-contain"
                  src={pictureImageSrc}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                <div className="inline-flex items-center gap-2">
                  <OctagonX className="h-4 w-4" />
                  Picture unavailable for this item.
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {isLearnMode ? "Learn the sentence for this picture." : "Build a sentence that matches this picture."}
              <span className="ml-1 text-slate-500">
                Variation {Math.min(activeSentenceGroupIndex + 1, 5)} of {Math.min((currentItem as PicturePhraseItem).sentenceGroups.length, 5)}
              </span>
            </div>

            {isLearnMode ? (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {currentLearnState?.loading ? (
                  <div className="inline-flex items-center gap-2 text-sm text-slate-600">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Preparing learn guidance...
                  </div>
                ) : currentLearnState?.data ? (
                  <>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{currentLearnState.data.content.headline}</p>
                      <p className="mt-1 text-sm text-slate-700">{currentLearnState.data.content.teachText}</p>
                    </div>
                    {settings.audioEnabled && currentLearnState.data.audioUrl ? (
                      <audio className="w-full" controls preload="none" src={currentLearnState.data.audioUrl} />
                    ) : null}
                    {currentLearnState.data.content.practicePrompt ? (
                      <p className="text-xs text-slate-500">Practice: {currentLearnState.data.content.practicePrompt}</p>
                    ) : null}
                  </>
                ) : currentLearnState?.error ? (
                  <p className="text-sm text-amber-700">{currentLearnState.error}</p>
                ) : (
                  <p className="text-sm text-slate-600">Learn guidance will appear here.</p>
                )}

                {(() => {
                  const group =
                    (currentItem as PicturePhraseItem).sentenceGroups[activeSentenceGroupIndex] ??
                    (currentItem as PicturePhraseItem).sentenceGroups[0];
                  return (
                    <div className="rounded-lg border border-emerald-200 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Target Sentence</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{group?.canonical}</p>
                    </div>
                  );
                })()}

                <div className="flex flex-wrap gap-2">
                  {pictureWordBank.slice(0, 18).map((word) => (
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700" key={word}>
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            ) : config.inputType === "type" ? (
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-600">Type your sentence</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  onChange={(event) => {
                    if (feedback) {
                      return;
                    }
                    setTypedPictureSentence(event.target.value);
                  }}
                  placeholder="Type a clear sentence about the picture"
                  value={typedPictureSentence}
                />
                {typeSuggestion ? (
                  <p className="text-xs text-slate-400">
                    Autocomplete:
                    <span className="ml-1 text-slate-500">{typeSuggestion}</span>
                  </p>
                ) : null}
                <p className="text-xs text-slate-500">
                  Word bank: {pictureWordBank.slice(0, 14).join(", ")}
                </p>
              </label>
            ) : (
              <>
                <DropZone>
                  <div className="flex min-h-10 flex-wrap gap-2">
                    {sentenceTokens.length === 0 ? (
                      <span className="text-sm text-slate-500">Tap words to build your sentence.</span>
                    ) : (
                      sentenceTokens.map((token, index) => (
                        <div
                          key={`${token}-${index}`}
                          className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-1 text-sm text-brand"
                        >
                          <span>{token}</span>
                          <button
                            aria-label="Remove item"
                            className="rounded px-1 text-xs text-brand-strong hover:bg-brand-soft hover:text-brand"
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
              </>
            )}

            <div className="flex flex-wrap gap-3">
              {isReviewMode ? (
                <button
                  aria-label="Show clue"
                  className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
                  onClick={useHint}
                  type="button"
                >
                  Hint
                </button>
              ) : null}
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white"
                onClick={() => void handleContinue()}
                type="button"
              >
                {isTransitioning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {continueLabel}
              </button>
              {isReviewMode ? (
                <button
                  aria-label="Clear sentence"
                  className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
                  onClick={() => {
                    if (feedback) {
                      return;
                    }
                    setSentenceTokens([]);
                    setTypedPictureSentence("");
                  }}
                  type="button"
                >
                  Clear
                </button>
              ) : null}
            </div>

            {isReviewMode && (hintCountByItem[currentItem.id] ?? 0) > 0 && (currentItem as PicturePhraseItem).hintLevels ? (
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
