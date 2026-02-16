import { AppShell } from "@/components/app-shell";
import { FactCardsPackEditor } from "@/components/factcards-pack-editor";

export default function FactCardsCreatePage() {
  return (
    <AppShell
      title="Create FactCards Pack"
      subtitle="Choose UI creation or JSON upload mode. Both save packs to local memory."
    >
      <FactCardsPackEditor mode="create" />
    </AppShell>
  );
}
