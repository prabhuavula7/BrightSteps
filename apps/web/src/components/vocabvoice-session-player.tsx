"use client";

import type { BrightStepsPack, VocabWordItem } from "@brightsteps/content-schema";
import { useSettings } from "@/components/settings-provider";
import { db } from "@/db/client-db";
import { checkVocabPronunciation, type VocabPronunciationResult } from "@/lib/api";
import type { SessionConfig } from "@/types/session";
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Mic,
  MicOff,
  Volume2,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  pack: Extract<BrightStepsPack, { moduleType: "vocabvoice" }>;
  assetUrlById: Record<string, string>;
  config: SessionConfig;
};

type EndReason = "completed" | "timer" | "manual";

type FeedbackState = {
  correct: boolean;
  headline: string;
  message: string;
};

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }

  const preferredTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/wav",
  ];

  return preferredTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

export function VocabVoiceSessionPlayer({ pack, assetUrlById, config }: Props) {
  const { settings } = useSettings();
  const router = useRouter();
  const completionLockRef = useRef(false);

  const itemOrder = useMemo(() => pack.items.map((item) => item.id), [pack.items]);
  const itemMap = useMemo(() => new Map(pack.items.map((item) => [item.id, item])), [pack.items]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [typedAttempt, setTypedAttempt] = useState("");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [hintCountByItem, setHintCountByItem] = useState<Record<string, number>>({});
  const [resultByItem, setResultByItem] = useState<Record<string, boolean>>({});
  const [checkByItem, setCheckByItem] = useState<Record<string, VocabPronunciationResult | undefined>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(Math.max(0, config.durationMinutes * 60));
  const [sessionStartedAtIso] = useState<string>(new Date().toISOString());
  const [isCompleting, setIsCompleting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);

  const isLearnMode = config.mode === "learn";
  const isReviewMode = config.mode === "review";

  const totalSessionSeconds = Math.max(0, config.durationMinutes * 60);
  const timeProgressPercent =
    totalSessionSeconds > 0 ? Math.max(0, Math.min(100, Math.round((remainingSeconds / totalSessionSeconds) * 100))) : 0;
  const progressPercent = itemOrder.length > 0 ? Math.round(((currentIndex + 1) / itemOrder.length) * 100) : 0;
  const timeLow = remainingSeconds <= 60;

  const currentOrderRef = itemOrder[currentIndex] ?? "";
  const currentItem = itemMap.get(currentOrderRef) as VocabWordItem | undefined;
  const currentCheck = currentItem ? checkByItem[currentItem.id] : undefined;
  const isLastItem = currentIndex >= itemOrder.length - 1;

  const recordingSupported = typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices;

  const currentAudioSrc =
    currentItem?.media?.pronunciationAudioRef
      ? assetUrlById[currentItem.media.pronunciationAudioRef]
      : undefined;
  const currentImageSrc = currentItem?.media?.imageRef
    ? (assetUrlById[currentItem.media.imageRef] ??
      pack.assets.find((asset) => asset.id === currentItem.media.imageRef && asset.kind === "image")?.path)
    : undefined;

  const currentHintCount = currentItem ? hintCountByItem[currentItem.id] ?? 0 : 0;
  const activeHint = currentItem?.hints?.[Math.min(currentHintCount - 1, (currentItem.hints?.length ?? 1) - 1)] ?? undefined;

  useEffect(() => {
    if (!isReviewMode || isCompleting || itemOrder.length === 0) {
      return;
    }

    const timerId = window.setInterval(() => {
      setRemainingSeconds((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [isCompleting, isReviewMode, itemOrder.length]);

  const completeSession = useCallback(
    async (reason: EndReason) => {
      if (completionLockRef.current) {
        return;
      }

      completionLockRef.current = true;
      setIsCompleting(true);

      const totalItems = itemOrder.length;
      const correctItems = Object.values(resultByItem).filter(Boolean).length;
      const hintCount = Object.values(hintCountByItem).reduce((sum, value) => sum + value, 0);
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
    },
    [config.durationMinutes, config.mode, hintCountByItem, isReviewMode, itemOrder.length, pack.moduleType, pack.packId, resultByItem, router, sessionStartedAtIso],
  );

  useEffect(() => {
    if (!isReviewMode || isCompleting || remainingSeconds > 0) {
      return;
    }

    void completeSession("timer");
  }, [completeSession, isCompleting, isReviewMode, remainingSeconds]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  if (!currentItem) {
    return (
      <div className="card p-6">
        <p className="text-sm text-slate-700">No vocabulary words are available for this session.</p>
      </div>
    );
  }

  async function startRecording() {
    if (!recordingSupported || isRecording) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordingChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunkType =
          typeof recordingChunksRef.current[0] === "object" && recordingChunksRef.current[0] instanceof Blob
            ? recordingChunksRef.current[0].type
            : "";
        const blob = new Blob(recordingChunksRef.current, {
          type: recorder.mimeType || chunkType || "audio/webm",
        });
        setRecordedBlob(blob.size > 0 ? blob : null);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setFeedback(null);
    } catch {
      setFeedback({
        correct: false,
        headline: "Microphone blocked",
        message: "Enable microphone permissions or use typed attempt.",
      });
    }
  }

  function stopRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      return;
    }

    mediaRecorderRef.current.stop();
    setIsRecording(false);
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

  async function runPronunciationCheck() {
    const activeItem = currentItem;
    if (!activeItem) {
      return;
    }

    if (isChecking || isCompleting) {
      return;
    }

    const hasInput = Boolean(typedAttempt.trim()) || Boolean(recordedBlob);
    if (!hasInput) {
      setFeedback({
        correct: false,
        headline: "Need an attempt",
        message: "Record your voice or type an attempt first.",
      });
      return;
    }

    setIsChecking(true);
    setFeedback(null);

    try {
      const response = await checkVocabPronunciation({
        packId: pack.packId,
        itemId: activeItem.id,
        mode: config.mode,
        word: activeItem.word,
        syllables: activeItem.syllables,
        acceptedPronunciations: activeItem.review.acceptedPronunciations,
        audioBlob: recordedBlob ?? undefined,
        typedAttempt: typedAttempt.trim() || undefined,
      });

      setCheckByItem((previous) => ({
        ...previous,
        [activeItem.id]: response,
      }));
      setResultByItem((previous) => ({
        ...previous,
        [activeItem.id]: response.isCorrect,
      }));

      setFeedback({
        correct: response.isCorrect,
        headline: response.isCorrect ? "Right!" : "Try again",
        message: response.isCorrect
          ? `Great pronunciation. Score ${Math.round(response.score * 100)}%.`
          : `Heard: "${response.transcript || "(unclear)"}". Keep practicing syllables below.`,
      });
    } catch (error) {
      setFeedback({
        correct: false,
        headline: "Check failed",
        message: error instanceof Error ? error.message : "Could not check pronunciation.",
      });
    } finally {
      setIsChecking(false);
    }
  }

  function resetForNext() {
    setTypedAttempt("");
    setRecordedBlob(null);
    setFeedback(null);
  }

  async function handleContinue() {
    const activeItem = currentItem;
    if (!activeItem) {
      return;
    }

    if (isCompleting) {
      return;
    }

    if (isLearnMode) {
      if (isLastItem) {
        await completeSession("completed");
        return;
      }
      setCurrentIndex((index) => index + 1);
      resetForNext();
      return;
    }

    const isCorrect = resultByItem[activeItem.id] === true;
    if (!isCorrect) {
      await runPronunciationCheck();
      return;
    }

    if (isLastItem) {
      await completeSession("completed");
      return;
    }

    setCurrentIndex((index) => index + 1);
    resetForNext();
  }

  const continueLabel = isLearnMode
    ? isLastItem
      ? "Finish Session"
      : "Next Word"
    : resultByItem[currentItem?.id ?? ""] === true
      ? isLastItem
        ? "Finish Session"
        : "Next Word"
      : "Check & Next";

  const progressText = `${currentIndex + 1} / ${itemOrder.length}`;

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

      <div className="card flex flex-col gap-4 p-6">
        <span className="inline-flex w-fit rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
          VocabVoice {isLearnMode ? "Learn" : "Review"}
        </span>

        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Word</p>
          <h2 className="text-3xl font-black text-slate-900">{currentItem.word}</h2>

          {currentImageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`${currentItem.word} illustration`}
              className="h-48 w-full rounded-lg border border-slate-200 object-cover"
              src={currentImageSrc}
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            {currentItem.syllables.map((syllable, index) => {
              const state = currentCheck?.syllableMatches[index];
              const tone = state
                ? state.correct
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-rose-300 bg-rose-50 text-rose-700"
                : "border-slate-300 bg-white text-slate-700";

              return (
                <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${tone}`} key={`${currentItem.id}-syll-${index}`}>
                  {syllable}
                </span>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Definition</p>
            <p className="mt-1 text-sm text-slate-800">{currentItem.definition}</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Example</p>
            <p className="mt-1 text-sm text-slate-800">{currentItem.exampleSentence}</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Review Prompt</p>
          <p className="mt-1 text-sm text-slate-800">{currentItem.review.sentencePrompt}</p>

          {currentAudioSrc ? (
            <div className="mt-3">
              <p className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                <Volume2 className="h-3.5 w-3.5" />
                Pronunciation Audio
              </p>
              <audio className="w-full" controls preload="none" src={currentAudioSrc} />
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-slate-700">Typed attempt (fallback)</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2"
              onChange={(event) => setTypedAttempt(event.target.value)}
              placeholder="Type what the child said if mic is not available"
              value={typedAttempt}
            />
          </label>

          <div className="flex items-end">
            {recordingSupported ? (
              <button
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white ${
                  isRecording ? "bg-rose-600" : "bg-slate-700"
                }`}
                onClick={() => {
                  if (isRecording) {
                    stopRecording();
                  } else {
                    void startRecording();
                  }
                }}
                type="button"
              >
                {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {isRecording ? "Stop Recording" : "Record Voice"}
              </button>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Microphone not supported.
              </div>
            )}
          </div>
        </div>

        {recordedBlob ? (
          <p className="text-xs text-slate-500">Voice attempt captured ({Math.round(recordedBlob.size / 1024)} KB).</p>
        ) : null}

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

        {currentCheck?.transcript ? (
          <p className="text-xs text-slate-600">Transcript: {currentCheck.transcript}</p>
        ) : null}

        {currentHintCount > 0 && activeHint ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Hint: {activeHint}</p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {isLearnMode ? (
            <button
              className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
              disabled={currentIndex === 0}
              onClick={() => {
                if (currentIndex === 0) {
                  return;
                }
                setCurrentIndex((index) => Math.max(0, index - 1));
                resetForNext();
              }}
              type="button"
            >
              Previous Word
            </button>
          ) : null}

          {isReviewMode ? (
            <button
              className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
              onClick={useHint}
              type="button"
            >
              Hint
            </button>
          ) : null}

          <button
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
            onClick={() => void runPronunciationCheck()}
            type="button"
          >
            {isChecking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            Check Pronunciation
          </button>

          <button
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white"
            onClick={() => void handleContinue()}
            type="button"
          >
            {isCompleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {continueLabel}
          </button>
        </div>

        {isReviewMode && settings.audioEnabled === false ? (
          <p className="text-xs text-slate-500">Audio is enabled for VocabVoice prompts even if global audio toggle is off.</p>
        ) : null}
      </div>
    </div>
  );
}
