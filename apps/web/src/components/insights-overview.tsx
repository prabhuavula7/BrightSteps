"use client";

import { useSettings } from "@/components/settings-provider";
import { db, type SessionHistoryRecord } from "@/db/client-db";
import {
  Activity,
  AreaChart,
  ChartColumnIncreasing,
  Gauge,
  GraduationCap,
  Info,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";

type RangeView = "week" | "month" | "year" | "all";
type GraphMetric = "sessions" | "accuracy" | "learn" | "hints" | "duration";

type TimeBucket = {
  label: string;
  startMs: number;
  endMs: number;
};

type InsightPoint = {
  label: string;
  startMs: number;
  endMs: number;
  sessions: number;
  learnSessions: number;
  totalItems: number;
  totalCorrect: number;
  hints: number;
  avgDuration: number;
  accuracy: number;
};

type InsightResult = {
  points: InsightPoint[];
  usingFallback: boolean;
};

type GraphMeta = {
  label: string;
  title: string;
  subtitle: string;
  color: string;
};

const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => <div className="h-[390px] animate-pulse rounded-xl bg-slate-100" />,
});

const RANGE_LABELS: Record<RangeView, string> = {
  week: "Week",
  month: "Month",
  year: "Year",
  all: "All Time",
};

const GRAPH_META: Record<GraphMetric, GraphMeta> = {
  sessions: {
    label: "Sessions",
    title: "Sessions Over Time",
    subtitle: "How many sessions were completed in each time bucket.",
    color: "#2563eb",
  },
  accuracy: {
    label: "Accuracy",
    title: "Accuracy Trend",
    subtitle: "Correct answer rate by selected range.",
    color: "#10b981",
  },
  learn: {
    label: "Learn Sessions",
    title: "Learn Mode Sessions",
    subtitle: "How many sessions ran in Learn mode.",
    color: "#6366f1",
  },
  hints: {
    label: "Hints Used",
    title: "Hints Usage",
    subtitle: "Total hints requested during sessions.",
    color: "#f59e0b",
  },
  duration: {
    label: "Avg Duration",
    title: "Average Session Duration",
    subtitle: "Average session duration in minutes.",
    color: "#ec4899",
  },
};

const STOCK_SERIES: Record<RangeView, InsightPoint[]> = {
  week: [
    { label: "Mon", sessions: 2, learnSessions: 1, totalItems: 14, totalCorrect: 10, hints: 3, avgDuration: 6.2, accuracy: 71, startMs: 0, endMs: 0 },
    { label: "Tue", sessions: 2, learnSessions: 1, totalItems: 16, totalCorrect: 12, hints: 3, avgDuration: 6.5, accuracy: 75, startMs: 0, endMs: 0 },
    { label: "Wed", sessions: 3, learnSessions: 2, totalItems: 22, totalCorrect: 17, hints: 4, avgDuration: 7.1, accuracy: 77, startMs: 0, endMs: 0 },
    { label: "Thu", sessions: 3, learnSessions: 1, totalItems: 24, totalCorrect: 19, hints: 4, avgDuration: 7.3, accuracy: 79, startMs: 0, endMs: 0 },
    { label: "Fri", sessions: 2, learnSessions: 1, totalItems: 17, totalCorrect: 13, hints: 2, avgDuration: 6.1, accuracy: 76, startMs: 0, endMs: 0 },
    { label: "Sat", sessions: 4, learnSessions: 2, totalItems: 30, totalCorrect: 24, hints: 5, avgDuration: 8.1, accuracy: 80, startMs: 0, endMs: 0 },
    { label: "Sun", sessions: 3, learnSessions: 2, totalItems: 25, totalCorrect: 21, hints: 3, avgDuration: 7.4, accuracy: 84, startMs: 0, endMs: 0 },
  ],
  month: [
    { label: "W1", sessions: 11, learnSessions: 5, totalItems: 78, totalCorrect: 56, hints: 13, avgDuration: 6.9, accuracy: 72, startMs: 0, endMs: 0 },
    { label: "W2", sessions: 13, learnSessions: 6, totalItems: 92, totalCorrect: 70, hints: 15, avgDuration: 7.2, accuracy: 76, startMs: 0, endMs: 0 },
    { label: "W3", sessions: 14, learnSessions: 6, totalItems: 97, totalCorrect: 76, hints: 16, avgDuration: 7.4, accuracy: 78, startMs: 0, endMs: 0 },
    { label: "W4", sessions: 12, learnSessions: 5, totalItems: 86, totalCorrect: 69, hints: 12, avgDuration: 7.1, accuracy: 80, startMs: 0, endMs: 0 },
    { label: "W5", sessions: 15, learnSessions: 7, totalItems: 106, totalCorrect: 86, hints: 14, avgDuration: 7.5, accuracy: 81, startMs: 0, endMs: 0 },
  ],
  year: [
    { label: "Mar", sessions: 38, learnSessions: 16, totalItems: 274, totalCorrect: 203, hints: 46, avgDuration: 7.1, accuracy: 74, startMs: 0, endMs: 0 },
    { label: "Apr", sessions: 42, learnSessions: 18, totalItems: 304, totalCorrect: 230, hints: 50, avgDuration: 7.3, accuracy: 76, startMs: 0, endMs: 0 },
    { label: "May", sessions: 44, learnSessions: 19, totalItems: 318, totalCorrect: 246, hints: 53, avgDuration: 7.2, accuracy: 77, startMs: 0, endMs: 0 },
    { label: "Jun", sessions: 47, learnSessions: 20, totalItems: 344, totalCorrect: 271, hints: 56, avgDuration: 7.4, accuracy: 79, startMs: 0, endMs: 0 },
    { label: "Jul", sessions: 50, learnSessions: 21, totalItems: 362, totalCorrect: 289, hints: 59, avgDuration: 7.5, accuracy: 80, startMs: 0, endMs: 0 },
    { label: "Aug", sessions: 53, learnSessions: 23, totalItems: 380, totalCorrect: 308, hints: 60, avgDuration: 7.6, accuracy: 81, startMs: 0, endMs: 0 },
    { label: "Sep", sessions: 55, learnSessions: 24, totalItems: 394, totalCorrect: 322, hints: 62, avgDuration: 7.7, accuracy: 82, startMs: 0, endMs: 0 },
    { label: "Oct", sessions: 57, learnSessions: 25, totalItems: 408, totalCorrect: 338, hints: 64, avgDuration: 7.8, accuracy: 83, startMs: 0, endMs: 0 },
    { label: "Nov", sessions: 60, learnSessions: 27, totalItems: 428, totalCorrect: 356, hints: 65, avgDuration: 7.8, accuracy: 83, startMs: 0, endMs: 0 },
    { label: "Dec", sessions: 62, learnSessions: 28, totalItems: 442, totalCorrect: 371, hints: 67, avgDuration: 7.9, accuracy: 84, startMs: 0, endMs: 0 },
    { label: "Jan", sessions: 64, learnSessions: 29, totalItems: 456, totalCorrect: 387, hints: 66, avgDuration: 7.8, accuracy: 85, startMs: 0, endMs: 0 },
    { label: "Feb", sessions: 66, learnSessions: 30, totalItems: 472, totalCorrect: 403, hints: 68, avgDuration: 8.0, accuracy: 85, startMs: 0, endMs: 0 },
  ],
  all: [
    { label: "Q1", sessions: 90, learnSessions: 38, totalItems: 640, totalCorrect: 454, hints: 109, avgDuration: 7.1, accuracy: 71, startMs: 0, endMs: 0 },
    { label: "Q2", sessions: 102, learnSessions: 44, totalItems: 742, totalCorrect: 546, hints: 114, avgDuration: 7.2, accuracy: 74, startMs: 0, endMs: 0 },
    { label: "Q3", sessions: 118, learnSessions: 51, totalItems: 858, totalCorrect: 652, hints: 120, avgDuration: 7.4, accuracy: 76, startMs: 0, endMs: 0 },
    { label: "Q4", sessions: 126, learnSessions: 56, totalItems: 920, totalCorrect: 717, hints: 124, avgDuration: 7.5, accuracy: 78, startMs: 0, endMs: 0 },
    { label: "Q5", sessions: 137, learnSessions: 61, totalItems: 1005, totalCorrect: 804, hints: 128, avgDuration: 7.6, accuracy: 80, startMs: 0, endMs: 0 },
    { label: "Q6", sessions: 148, learnSessions: 66, totalItems: 1080, totalCorrect: 884, hints: 132, avgDuration: 7.7, accuracy: 82, startMs: 0, endMs: 0 },
    { label: "Q7", sessions: 159, learnSessions: 73, totalItems: 1162, totalCorrect: 964, hints: 136, avgDuration: 7.8, accuracy: 83, startMs: 0, endMs: 0 },
    { label: "Q8", sessions: 167, learnSessions: 76, totalItems: 1218, totalCorrect: 1023, hints: 139, avgDuration: 7.9, accuracy: 84, startMs: 0, endMs: 0 },
  ],
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const dayIndex = (date.getDay() + 6) % 7;
  const value = new Date(date);
  value.setDate(date.getDate() - dayIndex);
  return startOfDay(value);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function buildAllTimeBuckets(history: SessionHistoryRecord[]): TimeBucket[] {
  const completedTimes = history
    .map((entry) => new Date(entry.completedAt).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (completedTimes.length === 0) {
    return [];
  }

  const earliest = startOfMonth(new Date(completedTimes[0] ?? Date.now()));
  const latest = startOfMonth(new Date());
  const monthBuckets: TimeBucket[] = [];
  let cursor = earliest;

  while (cursor.getTime() <= latest.getTime()) {
    const start = cursor;
    const end = addMonths(start, 1);
    monthBuckets.push({
      label: start.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
      startMs: start.getTime(),
      endMs: end.getTime(),
    });
    cursor = end;
  }

  if (monthBuckets.length <= 24) {
    return monthBuckets;
  }

  const quarterBuckets: TimeBucket[] = [];
  const quarterStart = new Date(
    earliest.getFullYear(),
    Math.floor(earliest.getMonth() / 3) * 3,
    1,
  );
  let quarterCursor = quarterStart;

  while (quarterCursor.getTime() <= latest.getTime()) {
    const start = quarterCursor;
    const end = addMonths(start, 3);
    quarterBuckets.push({
      label: `Q${Math.floor(start.getMonth() / 3) + 1} '${String(start.getFullYear()).slice(-2)}`,
      startMs: start.getTime(),
      endMs: end.getTime(),
    });
    quarterCursor = end;
  }

  return quarterBuckets;
}

function buildBuckets(range: RangeView, history: SessionHistoryRecord[]): TimeBucket[] {
  const now = new Date();

  if (range === "week") {
    return Array.from({ length: 7 }, (_, index) => {
      const offset = 6 - index;
      const start = startOfDay(addDays(now, -offset));
      const end = addDays(start, 1);
      return {
        label: start.toLocaleDateString(undefined, { weekday: "short" }),
        startMs: start.getTime(),
        endMs: end.getTime(),
      };
    });
  }

  if (range === "month") {
    const currentWeekStart = startOfWeek(now);
    return Array.from({ length: 5 }, (_, index) => {
      const offset = 4 - index;
      const start = addDays(currentWeekStart, -(offset * 7));
      const end = addDays(start, 7);
      return {
        label: `W${index + 1}`,
        startMs: start.getTime(),
        endMs: end.getTime(),
      };
    });
  }

  if (range === "year") {
    return Array.from({ length: 12 }, (_, index) => {
      const offset = 11 - index;
      const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return {
        label: start.toLocaleDateString(undefined, { month: "short" }),
        startMs: start.getTime(),
        endMs: end.getTime(),
      };
    });
  }

  return buildAllTimeBuckets(history);
}

function buildInsightSeries(history: SessionHistoryRecord[], range: RangeView): InsightResult {
  const buckets = buildBuckets(range, history);
  const sums = buckets.map((bucket) => ({
    ...bucket,
    sessions: 0,
    learnSessions: 0,
    totalItems: 0,
    totalCorrect: 0,
    hints: 0,
    totalDuration: 0,
  }));

  for (const entry of history) {
    const completedAtMs = new Date(entry.completedAt).getTime();
    if (!Number.isFinite(completedAtMs)) {
      continue;
    }

    const bucket = sums.find(
      (candidate) =>
        completedAtMs >= candidate.startMs && completedAtMs < candidate.endMs,
    );
    if (!bucket) {
      continue;
    }

    bucket.sessions += 1;
    if (entry.mode === "learn") {
      bucket.learnSessions += 1;
    }
    bucket.totalItems += entry.totalItems;
    bucket.totalCorrect += entry.correctItems;
    bucket.hints += entry.hintCount;
    bucket.totalDuration += entry.durationMinutes;
  }

  const points: InsightPoint[] = sums.map((bucket) => ({
    label: bucket.label,
    startMs: bucket.startMs,
    endMs: bucket.endMs,
    sessions: bucket.sessions,
    learnSessions: bucket.learnSessions,
    totalItems: bucket.totalItems,
    totalCorrect: bucket.totalCorrect,
    hints: bucket.hints,
    avgDuration:
      bucket.sessions > 0
        ? Number((bucket.totalDuration / bucket.sessions).toFixed(1))
        : 0,
    accuracy:
      bucket.totalItems > 0
        ? Math.round((bucket.totalCorrect / bucket.totalItems) * 100)
        : 0,
  }));

  const hasRealData = points.some((point) => point.sessions > 0);
  return {
    points: hasRealData ? points : STOCK_SERIES[range],
    usingFallback: !hasRealData,
  };
}

function valueByMetric(point: InsightPoint, metric: GraphMetric): number {
  if (metric === "sessions") {
    return point.sessions;
  }
  if (metric === "accuracy") {
    return point.accuracy;
  }
  if (metric === "learn") {
    return point.learnSessions;
  }
  if (metric === "hints") {
    return point.hints;
  }
  return point.avgDuration;
}

function getNiceCeiling(value: number): number {
  if (value <= 0) {
    return 4;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  if (normalized <= 1) {
    return magnitude;
  }
  if (normalized <= 2) {
    return 2 * magnitude;
  }
  if (normalized <= 5) {
    return 5 * magnitude;
  }
  return 10 * magnitude;
}

function prettyNumber(value: number, metric: GraphMetric): string {
  if (metric === "accuracy") {
    return `${Math.round(value)}%`;
  }
  if (metric === "duration") {
    return `${value.toFixed(1)}m`;
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1);
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "").trim();
  if (value.length !== 6) {
    return hex;
  }

  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function withAlpha(color: string, alpha: number): string {
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) {
    return hexToRgba(trimmed, alpha);
  }

  if (trimmed.startsWith("rgb(")) {
    const content = trimmed.slice(4, -1);
    return `rgba(${content}, ${alpha})`;
  }

  if (trimmed.startsWith("rgba(")) {
    const content = trimmed.slice(5, -1).split(",").slice(0, 3).join(",");
    return `rgba(${content}, ${alpha})`;
  }

  return trimmed;
}

function goalLineForMetric(params: {
  metric: GraphMetric;
  range: RangeView;
  dailySessionGoal: number;
  weeklySessionGoal: number;
  weeklyAccuracyGoal: number;
}): number | undefined {
  if (params.metric === "accuracy") {
    return params.weeklyAccuracyGoal;
  }
  if (params.metric === "sessions") {
    if (params.range === "week") {
      return params.dailySessionGoal;
    }
    if (params.range === "month") {
      return params.weeklySessionGoal;
    }
    return params.weeklySessionGoal * 4;
  }
  return undefined;
}

type InsightChartProps = {
  points: InsightPoint[];
  metric: GraphMetric;
  goalLineValue?: number;
  primaryColor: string;
};

function InsightChart({
  points,
  metric,
  goalLineValue,
  primaryColor,
}: InsightChartProps) {
  const baseMeta = GRAPH_META[metric];
  const color = metric === "sessions" ? primaryColor : baseMeta.color;

  const options = useMemo<EChartsOption>(() => {
    const values = points.map((point) => valueByMetric(point, metric));
    const maxRaw = Math.max(...values, 0);

    const yMax =
      metric === "accuracy"
        ? 100
        : getNiceCeiling(maxRaw > 0 ? maxRaw * 1.15 : 4);
    const yInterval = metric === "accuracy" ? 20 : yMax / 4;

    return {
      animationDuration: 350,
      grid: {
        left: 56,
        right: 24,
        top: 24,
        bottom: 52,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        borderWidth: 0,
        textStyle: { color: "#f8fafc", fontSize: 12 },
        padding: [10, 12],
        axisPointer: {
          type: "line",
          lineStyle: {
            color: "#64748b",
            width: 1,
            type: "dashed",
          },
        },
        formatter: (params: unknown) => {
          const first = Array.isArray(params) ? params[0] : undefined;
          const dataIndex = Number((first as { dataIndex?: number })?.dataIndex ?? 0);
          const point = points[dataIndex];
          if (!point) {
            return "";
          }

          const metricValue = valueByMetric(point, metric);
          return [
            `<div style=\"font-weight:700;margin-bottom:6px;\">${point.label}</div>`,
            `<div>${baseMeta.label}: <b>${prettyNumber(metricValue, metric)}</b></div>`,
            `<div>Sessions: <b>${point.sessions}</b></div>`,
            `<div>Learn sessions: <b>${point.learnSessions}</b></div>`,
            `<div>Accuracy: <b>${point.accuracy}%</b></div>`,
          ].join("");
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: points.map((point) => point.label),
        axisLine: {
          lineStyle: { color: "#cbd5e1" },
        },
        axisTick: { show: false },
        axisLabel: {
          color: "#64748b",
          fontSize: 11,
          margin: 12,
        },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: yMax,
        interval: yInterval,
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: {
          lineStyle: {
            color: "#e2e8f0",
            type: "dashed",
          },
        },
        axisLabel: {
          color: "#64748b",
          formatter: (value: number) => prettyNumber(Number(value), metric),
        },
      },
      series: [
        {
          name: baseMeta.label,
          type: "line",
          smooth: 0.35,
          data: values,
          showSymbol: true,
          symbol: "circle",
          symbolSize: 6,
          lineStyle: {
            width: 2,
            color,
          },
          itemStyle: {
            color: "#ffffff",
            borderWidth: 2,
            borderColor: color,
          },
          emphasis: {
            focus: "series",
            itemStyle: {
              color,
              borderColor: color,
            },
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(color, 0.28) },
                { offset: 1, color: withAlpha(color, 0.04) },
              ],
            },
          },
          markLine:
            goalLineValue !== undefined
              ? {
                  silent: true,
                  symbol: "none",
                  lineStyle: {
                    color: "#475569",
                    type: "dashed",
                    width: 1,
                  },
                  label: {
                    show: true,
                    formatter: "Goal",
                    color: "#334155",
                    backgroundColor: "#f8fafc",
                    padding: [2, 6],
                    borderRadius: 6,
                  },
                  data: [{ yAxis: goalLineValue }],
                }
              : undefined,
        },
      ],
    };
  }, [baseMeta.label, color, goalLineValue, metric, points]);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-2 sm:p-3">
      <ReactECharts
        notMerge
        option={options}
        style={{ height: "390px", width: "100%" }}
      />
    </div>
  );
}

export function InsightsOverview() {
  const { settings } = useSettings();
  const [rangeView, setRangeView] = useState<RangeView>("week");
  const [graphMetric, setGraphMetric] = useState<GraphMetric>("sessions");
  const [history, setHistory] = useState<SessionHistoryRecord[]>([]);
  const primaryColor =
    typeof window === "undefined"
      ? "#2563eb"
      : getComputedStyle(document.documentElement)
            .getPropertyValue("--primary")
            .trim() || "#2563eb";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const sessions = await db.sessionHistory.toArray();
      if (!cancelled) {
        setHistory(sessions);
      }
    }

    void load();

    const onSessionCompleted = () => {
      void load();
    };

    window.addEventListener("brightsteps:session-completed", onSessionCompleted);
    return () => {
      cancelled = true;
      window.removeEventListener("brightsteps:session-completed", onSessionCompleted);
    };
  }, []);

  const insights = useMemo(
    () => buildInsightSeries(history, rangeView),
    [history, rangeView],
  );
  const selectedMeta = GRAPH_META[graphMetric];
  const goalLineValue = goalLineForMetric({
    metric: graphMetric,
    range: rangeView,
    dailySessionGoal: settings.dailySessionGoal,
    weeklySessionGoal: settings.weeklySessionGoal,
    weeklyAccuracyGoal: settings.weeklyAccuracyGoal,
  });

  const totals = useMemo(() => {
    const totalSessions = insights.points.reduce(
      (sum, point) => sum + point.sessions,
      0,
    );
    const totalLearnSessions = insights.points.reduce(
      (sum, point) => sum + point.learnSessions,
      0,
    );
    const totalItems = insights.points.reduce(
      (sum, point) => sum + point.totalItems,
      0,
    );
    const totalDuration = insights.points.reduce(
      (sum, point) => sum + point.avgDuration * point.sessions,
      0,
    );
    const avgAccuracy =
      totalItems > 0
        ? Math.round(
            (insights.points.reduce((sum, point) => sum + point.totalCorrect, 0) /
              totalItems) *
              100,
          )
        : 0;
    const avgDuration =
      totalSessions > 0 ? Number((totalDuration / totalSessions).toFixed(1)) : 0;

    return { totalSessions, totalLearnSessions, avgAccuracy, avgDuration };
  }, [insights.points]);

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="inline-flex items-center gap-2 text-xl font-bold text-slate-800">
            <AreaChart className="h-5 w-5 text-brand" />
            Learning Insights
          </h2>
          <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
            {(Object.keys(RANGE_LABELS) as RangeView[]).map((view) => (
              <button
                className={`rounded-md px-3 py-1 text-xs font-semibold sm:text-sm ${
                  rangeView === view
                    ? "bg-white text-brand shadow-sm"
                    : "text-slate-600"
                }`}
                key={view}
                onClick={() => setRangeView(view)}
                type="button"
              >
                {RANGE_LABELS[view]}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-2 text-sm text-slate-600">
          Switch graph types and ranges. Hover points for detailed insights.
        </p>

        {insights.usingFallback ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Showing starter sample data until enough real local sessions are
            available.
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
            Showing real local session history data.
          </div>
        )}

        <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
          {(Object.keys(GRAPH_META) as GraphMetric[]).map((metric) => (
            <button
              className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                graphMetric === metric
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
              key={metric}
              onClick={() => setGraphMetric(metric)}
              type="button"
            >
              {metric === "sessions" ? <Activity className="h-3.5 w-3.5" /> : null}
              {metric === "accuracy" ? <Gauge className="h-3.5 w-3.5" /> : null}
              {metric === "learn" ? <GraduationCap className="h-3.5 w-3.5" /> : null}
              {metric === "hints" ? <Info className="h-3.5 w-3.5" /> : null}
              {metric === "duration" ? (
                <ChartColumnIncreasing className="h-3.5 w-3.5" />
              ) : null}
              {GRAPH_META[metric].label}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-700">{selectedMeta.title}</p>
          <p className="text-xs text-slate-500">{selectedMeta.subtitle}</p>
          <InsightChart
            goalLineValue={goalLineValue}
            metric={graphMetric}
            points={insights.points}
            primaryColor={primaryColor}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-600">Total sessions</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{totals.totalSessions}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-600">Learn sessions</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{totals.totalLearnSessions}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-600">Average accuracy</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{totals.avgAccuracy}%</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-600">Avg duration</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{totals.avgDuration.toFixed(1)}m</p>
          </div>
        </div>
      </section>
    </div>
  );
}
