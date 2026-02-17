"use client";

import { db, type SessionHistoryRecord } from "@/db/client-db";
import { useSettings } from "@/components/settings-provider";
import { AreaChart, Gauge, Info } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

type RangeView = "days" | "weeks" | "months";

type InsightPoint = {
  label: string;
  sessions: number;
  accuracy: number;
};

type InsightResult = {
  points: InsightPoint[];
  usingFallback: boolean;
};

type TimeBucket = {
  label: string;
  startMs: number;
  endMs: number;
};

type Coord = {
  x: number;
  y: number;
  value: number;
  label: string;
};

const RANGE_LABELS: Record<RangeView, string> = {
  days: "Days",
  weeks: "Weeks",
  months: "Months",
};

const STOCK_SERIES: Record<RangeView, InsightPoint[]> = {
  days: [
    { label: "Mon", sessions: 1, accuracy: 72 },
    { label: "Tue", sessions: 2, accuracy: 74 },
    { label: "Wed", sessions: 2, accuracy: 79 },
    { label: "Thu", sessions: 3, accuracy: 82 },
    { label: "Fri", sessions: 2, accuracy: 78 },
    { label: "Sat", sessions: 3, accuracy: 84 },
    { label: "Sun", sessions: 2, accuracy: 83 },
  ],
  weeks: [
    { label: "W1", sessions: 8, accuracy: 70 },
    { label: "W2", sessions: 9, accuracy: 74 },
    { label: "W3", sessions: 11, accuracy: 77 },
    { label: "W4", sessions: 10, accuracy: 79 },
    { label: "W5", sessions: 12, accuracy: 81 },
    { label: "W6", sessions: 13, accuracy: 82 },
    { label: "W7", sessions: 12, accuracy: 84 },
    { label: "W8", sessions: 14, accuracy: 86 },
  ],
  months: [
    { label: "Sep", sessions: 28, accuracy: 73 },
    { label: "Oct", sessions: 31, accuracy: 77 },
    { label: "Nov", sessions: 33, accuracy: 79 },
    { label: "Dec", sessions: 35, accuracy: 82 },
    { label: "Jan", sessions: 38, accuracy: 84 },
    { label: "Feb", sessions: 40, accuracy: 86 },
  ],
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const day = (date.getDay() + 6) % 7;
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - day);
  return startOfDay(weekStart);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildBuckets(view: RangeView): TimeBucket[] {
  const now = new Date();

  if (view === "days") {
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

  if (view === "weeks") {
    const currentWeekStart = startOfWeek(now);
    return Array.from({ length: 8 }, (_, index) => {
      const offset = 7 - index;
      const start = addDays(currentWeekStart, -offset * 7);
      const end = addDays(start, 7);
      return {
        label: `W${index + 1}`,
        startMs: start.getTime(),
        endMs: end.getTime(),
      };
    });
  }

  return Array.from({ length: 6 }, (_, index) => {
    const offset = 5 - index;
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    return {
      label: start.toLocaleDateString(undefined, { month: "short" }),
      startMs: start.getTime(),
      endMs: end.getTime(),
    };
  });
}

function buildInsightSeries(sessions: SessionHistoryRecord[], view: RangeView): InsightResult {
  const buckets = buildBuckets(view);
  const sums = buckets.map(() => ({ sessions: 0, totalItems: 0, totalCorrect: 0 }));

  for (const entry of sessions) {
    const completedAtMs = new Date(entry.completedAt).getTime();
    if (Number.isNaN(completedAtMs)) {
      continue;
    }

    const bucketIndex = buckets.findIndex((bucket) => completedAtMs >= bucket.startMs && completedAtMs < bucket.endMs);
    if (bucketIndex < 0) {
      continue;
    }

    const bucket = sums[bucketIndex];
    if (!bucket) {
      continue;
    }

    bucket.sessions += 1;
    bucket.totalItems += entry.totalItems;
    bucket.totalCorrect += entry.correctItems;
  }

  const points = buckets.map((bucket, index) => {
    const summary = sums[index] ?? { sessions: 0, totalItems: 0, totalCorrect: 0 };
    return {
      label: bucket.label,
      sessions: summary.sessions,
      accuracy: summary.totalItems > 0 ? Math.round((summary.totalCorrect / summary.totalItems) * 100) : 0,
    };
  });

  const hasRealData = points.some((point) => point.sessions > 0);
  return {
    points: hasRealData ? points : STOCK_SERIES[view],
    usingFallback: !hasRealData,
  };
}

function buildSmoothLinePath(coords: Coord[]): string {
  if (coords.length === 0) {
    return "";
  }

  if (coords.length === 1) {
    return `M ${coords[0]?.x ?? 0} ${coords[0]?.y ?? 0}`;
  }

  let path = `M ${coords[0]?.x ?? 0} ${coords[0]?.y ?? 0}`;

  for (let index = 1; index < coords.length; index += 1) {
    const previous = coords[index - 1];
    const current = coords[index];
    if (!previous || !current) {
      continue;
    }

    const dx = current.x - previous.x;
    path += ` C ${previous.x + dx / 3} ${previous.y}, ${previous.x + (2 * dx) / 3} ${current.y}, ${current.x} ${current.y}`;
  }

  return path;
}

function prettyNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

type CurveChartProps = {
  points: InsightPoint[];
  metric: "sessions" | "accuracy";
  color: string;
  fillColor: string;
  title: string;
  subtitle: string;
  goalLineValue?: number;
};

function InsightCurveChart({ points, metric, color, fillColor, title, subtitle, goalLineValue }: CurveChartProps) {
  const gradientId = useId().replace(/:/g, "");

  const values = points.map((point) => (metric === "sessions" ? point.sessions : point.accuracy));
  const maxRaw = Math.max(...values, 0);
  const topValue = metric === "accuracy" ? 100 : Math.max(4, Math.ceil(maxRaw * 1.15));

  const yTicks =
    metric === "accuracy"
      ? [100, 75, 50, 25, 0]
      : [topValue, Math.round(topValue * 0.75), Math.round(topValue * 0.5), Math.round(topValue * 0.25), 0];

  const coords: Coord[] = points.map((point, index) => {
    const value = metric === "sessions" ? point.sessions : point.accuracy;
    const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * 100;
    const y = 100 - (value / Math.max(topValue, 1)) * 100;
    return { x, y, value, label: point.label };
  });

  const linePath = buildSmoothLinePath(coords);
  const first = coords[0];
  const last = coords[coords.length - 1];
  const areaPath = linePath && first && last ? `${linePath} L ${last.x} 100 L ${first.x} 100 Z` : "";
  const goalY =
    goalLineValue !== undefined
      ? 100 - (Math.max(0, Math.min(topValue, goalLineValue)) / Math.max(topValue, 1)) * 100
      : undefined;

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="text-xs text-slate-500">{subtitle}</p>

      <div className="mt-3 grid grid-cols-[44px_1fr] gap-3">
        <div className="relative h-[320px] text-right text-xs font-medium text-slate-500">
          {yTicks.map((tick) => {
            const y = 100 - (tick / Math.max(topValue, 1)) * 100;
            return (
              <span className="absolute right-0 -translate-y-1/2" key={`tick-${metric}-${tick}`} style={{ top: `${y}%` }}>
                {prettyNumber(tick)}
              </span>
            );
          })}
        </div>

        <div>
          <div className="h-[320px] rounded-lg border border-slate-200 bg-white p-3">
            <svg aria-label={`${title} graph`} className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={fillColor} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={fillColor} stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {yTicks.map((tick) => {
                const y = 100 - (tick / Math.max(topValue, 1)) * 100;
                return (
                  <line
                    key={`line-${metric}-${tick}`}
                    stroke="#e2e8f0"
                    strokeDasharray="2 2"
                    strokeWidth="0.55"
                    x1="0"
                    x2="100"
                    y1={y}
                    y2={y}
                  />
                );
              })}

              {goalY !== undefined ? (
                <line stroke="#64748b" strokeDasharray="3 2" strokeWidth="0.8" x1="0" x2="100" y1={goalY} y2={goalY} />
              ) : null}

              {areaPath ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
              {linePath ? <path d={linePath} fill="none" stroke={color} strokeLinecap="round" strokeWidth="2" /> : null}

              {coords.map((coord) => (
                <g key={`${metric}-${coord.label}`}>
                  <circle cx={coord.x} cy={coord.y} fill="white" r="1.6" stroke={color} strokeWidth="1.3" />
                  <text
                    fill={color}
                    fontSize="3.4"
                    fontWeight="700"
                    textAnchor="middle"
                    x={coord.x}
                    y={Math.max(4, coord.y - 3)}
                  >
                    {coord.value}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <div
            className="mt-2 grid gap-2 text-center text-[11px] text-slate-500 sm:text-xs"
            style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
          >
            {points.map((point) => (
              <span key={`${metric}-label-${point.label}`}>{point.label}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function InsightsOverview() {
  const { settings } = useSettings();
  const [rangeView, setRangeView] = useState<RangeView>("days");
  const [history, setHistory] = useState<SessionHistoryRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const sessions = await db.sessionHistory.toArray();
      if (!cancelled) {
        setHistory(sessions);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const insights = useMemo(() => buildInsightSeries(history, rangeView), [history, rangeView]);

  const totals = useMemo(() => {
    const totalSessions = insights.points.reduce((sum, point) => sum + point.sessions, 0);
    const avgAccuracy =
      insights.points.length > 0
        ? Math.round(insights.points.reduce((sum, point) => sum + point.accuracy, 0) / insights.points.length)
        : 0;

    return { totalSessions, avgAccuracy };
  }, [insights.points]);

  const sessionsGoalLine = useMemo(() => {
    if (rangeView === "days") {
      return settings.dailySessionGoal;
    }
    if (rangeView === "weeks") {
      return settings.weeklySessionGoal;
    }
    return settings.weeklySessionGoal * 4;
  }, [rangeView, settings.dailySessionGoal, settings.weeklySessionGoal]);

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
                  rangeView === view ? "bg-white text-brand shadow-sm" : "text-slate-600"
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
          Compare learning pace and accuracy by {RANGE_LABELS[rangeView].toLowerCase()}. Real local data is used when available.
        </p>

        {insights.usingFallback ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Starter graph data is displayed until enough real sessions are available.
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
            Showing real session data from local history.
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">Total sessions in view</p>
            <p className="mt-1 text-3xl font-black text-slate-900">{totals.totalSessions}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700">
              <Gauge className="h-4 w-4 text-brand" />
              Average accuracy in view
            </p>
            <p className="mt-1 text-3xl font-black text-slate-900">{totals.avgAccuracy}%</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <InsightCurveChart
          color="var(--primary)"
          fillColor="var(--primary)"
          goalLineValue={sessionsGoalLine}
          metric="sessions"
          points={insights.points}
          subtitle="Smoothed trend with session count labels and goal marker"
          title="Progress Over Time"
        />

        <InsightCurveChart
          color="#10b981"
          fillColor="#10b981"
          goalLineValue={settings.weeklyAccuracyGoal}
          metric="accuracy"
          points={insights.points}
          subtitle="Accuracy percentage by selected period with goal marker"
          title="Accuracy Trend"
        />
      </div>

      <section className="card p-5">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Info className="h-4 w-4 text-brand" />
          Notes
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          <li>Insights are local-first and based on session completion history stored on-device.</li>
          <li>As usage grows, fallback data automatically disappears and real trends are shown.</li>
          <li>Use Learn mode for untimed guidance and Review mode for measurable quiz outcomes.</li>
        </ul>
      </section>
    </div>
  );
}
