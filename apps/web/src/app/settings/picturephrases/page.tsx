import { AppShell } from "@/components/app-shell";
import Link from "next/link";

export default function PicturePhrasesSettingsPage() {
  return (
    <AppShell
      title="PicturePhrases Management"
      subtitle="FactCards management is live. PicturePhrases dedicated editor flow can be added next."
    >
      <section className="card p-6 text-sm text-slate-700">
        <p>
          This page is ready for PicturePhrases manager/editor implementation. We can mirror the same create/edit
          workflow next.
        </p>
        <Link className="mt-4 inline-flex rounded-lg bg-[#2badee] px-4 py-2 text-xs font-bold text-white" href="/settings">
          Back to Settings
        </Link>
      </section>
    </AppShell>
  );
}
