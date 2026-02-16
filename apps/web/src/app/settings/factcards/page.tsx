import { AppShell } from "@/components/app-shell";
import { FactCardsPackManager } from "@/components/factcards-pack-manager";

export default function FactCardsSettingsPage() {
  return (
    <AppShell
      title="FactCards Pack Manager"
      subtitle="View available packs and choose create or edit actions in dedicated full-page editor flows."
    >
      <FactCardsPackManager />
    </AppShell>
  );
}
