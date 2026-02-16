import { AppShell } from "@/components/app-shell";
import { DashboardOverview } from "@/components/dashboard-overview";

export default function DashboardPage() {
  return (
    <AppShell
      title="Dashboard"
      subtitle="Track goals, review progress, and navigate module-specific learning flows."
    >
      <DashboardOverview />
    </AppShell>
  );
}
