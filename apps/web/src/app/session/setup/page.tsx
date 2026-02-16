import { SessionSetupClient } from "@/components/session-setup-client";
import { TopNav } from "@/components/top-nav";
import { Suspense } from "react";

export default function SessionSetupPage() {
  return (
    <>
      <TopNav />
      <main className="container-page">
        <Suspense fallback={<div className="card p-4 text-sm text-slate-600">Loading setup...</div>}>
          <SessionSetupClient />
        </Suspense>
      </main>
    </>
  );
}
