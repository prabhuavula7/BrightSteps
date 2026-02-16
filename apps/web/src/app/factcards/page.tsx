import { AppShell } from "@/components/app-shell";
import { ModulePackBrowser } from "@/components/module-pack-browser";

export default function FactCardsPage() {
  return (
    <AppShell
      title="FactCards"
      subtitle="Use structured flashcards with spaced review and predictable response patterns."
    >
      <ModulePackBrowser moduleType="factcards" />
    </AppShell>
  );
}
