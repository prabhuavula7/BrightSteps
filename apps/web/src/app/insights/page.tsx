import { AppShell } from "@/components/app-shell";
import { InsightsOverview } from "@/components/insights-overview";

export default function InsightsPage() {
  return (
    <AppShell
      title="Insights"
      subtitle="Switch between multiple learning graphs and explore week, month, year, and all-time trends."
    >
      <InsightsOverview />
    </AppShell>
  );
}
