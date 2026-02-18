import { AppShell } from "@/components/app-shell";
import { VocabPackEditor } from "@/components/vocab-pack-editor";

export default function VocabularyCreatePage() {
  return (
    <AppShell
      title="Create VocabVoice Pack"
      subtitle="Add words, tune topics, and run one-time AI processing before sessions."
    >
      <VocabPackEditor mode="create" />
    </AppShell>
  );
}
