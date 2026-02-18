import { AppShell } from "@/components/app-shell";
import { VocabPackManager } from "@/components/vocab-pack-manager";

export default function VocabularySettingsPage() {
  return (
    <AppShell
      title="VocabVoice Pack Manager"
      subtitle="Create and manage voice-native vocabulary packs with AI-processed syllables, definitions, and pronunciation audio."
    >
      <VocabPackManager />
    </AppShell>
  );
}
