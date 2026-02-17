import { AppShell } from "@/components/app-shell";
import { InsightsOverview } from "@/components/insights-overview";

export default function InsightsPage() {
  return (
    <AppShell
      title="Insights"
      subtitle="Track progress and accuracy trends across days, weeks, and months."
    >
      <InsightsOverview />
    </AppShell>
  );
}
