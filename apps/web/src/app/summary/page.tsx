import Link from "next/link";
import { TopNav } from "@/components/top-nav";

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{
    packId?: string;
    total?: string;
    correct?: string;
    hints?: string;
    moduleType?: string;
    endedBy?: "completed" | "timer" | "manual";
  }>;
}) {
  const { packId, total, correct, hints, moduleType, endedBy } = await searchParams;
  const endingNote =
    endedBy === "timer"
      ? "Session ended when the timer reached 00:00."
      : endedBy === "manual"
        ? "Session ended manually."
        : "Session ended after all planned questions were completed.";

  return (
    <>
      <TopNav />
      <main className="container-page">
        <section className="card mx-auto max-w-3xl p-5 text-center sm:p-6 md:p-8">
          <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">Session Complete</h1>
          <p className="mt-2 text-slate-600">Calm progress, one step at a time.</p>

          <div className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-slate-500">Correct</p>
              <p className="text-xl font-bold text-slate-900">{correct ?? "0"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-slate-500">Total</p>
              <p className="text-xl font-bold text-slate-900">{total ?? "0"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-slate-500">Hints</p>
              <p className="text-xl font-bold text-slate-900">{hints ?? "0"}</p>
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-500">
            Module: {moduleType ?? "unknown"} | Pack: {packId ?? "unknown"}
          </p>
          <p className="mt-1 text-sm text-slate-500">{endingNote}</p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link className="rounded-lg bg-[#2badee] px-4 py-2 text-sm font-bold text-white" href="/">
              Back to Packs
            </Link>
            <Link
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              href="/settings"
            >
              Open Settings
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
