import { AppShell } from "@/components/app-shell";
import { ModulePackBrowser } from "@/components/module-pack-browser";

export default function VocabularyPage() {
  return (
    <AppShell
      title="VocabVoice"
      subtitle="Practice pronunciation with syllables, audio prompts, and clear definitions in calm learn/review flows."
    >
      <ModulePackBrowser moduleType="vocabvoice" />
    </AppShell>
  );
}
