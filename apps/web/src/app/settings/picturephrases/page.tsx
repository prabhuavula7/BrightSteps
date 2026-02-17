import { AppShell } from "@/components/app-shell";
import { PicturePhrasesPackManager } from "@/components/picturephrases-pack-manager";

export default function PicturePhrasesSettingsPage() {
  return (
    <AppShell
      title="PicturePhrases Pack Manager"
      subtitle="Upload images, generate reusable sentence prompts, and edit packs in UI or JSON mode."
    >
      <PicturePhrasesPackManager />
    </AppShell>
  );
}
