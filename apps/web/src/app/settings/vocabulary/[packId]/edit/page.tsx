import { AppShell } from "@/components/app-shell";
import { VocabPackEditor } from "@/components/vocab-pack-editor";

export default async function VocabularyEditPage({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;

  return (
    <AppShell
      title="Edit VocabVoice Pack"
      subtitle="Switch between UI and JSON modes, process words, and keep audio assets synced."
    >
      <VocabPackEditor mode="edit" packRef={packId} />
    </AppShell>
  );
}
