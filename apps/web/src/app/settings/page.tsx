import { AppShell } from "@/components/app-shell";
import { SettingsHome } from "@/components/settings-home";

export default function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      subtitle="Adjust calm controls and open FactCards, PicturePhrases, and VocabVoice pack management pages."
    >
      <SettingsHome />
    </AppShell>
  );
}
