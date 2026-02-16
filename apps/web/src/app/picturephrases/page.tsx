import { AppShell } from "@/components/app-shell";
import { ModulePackBrowser } from "@/components/module-pack-browser";

export default function PicturePhrasesPage() {
  return (
    <AppShell
      title="PicturePhrases"
      subtitle="Build sentence meaning from visual context using guided word banks and hints."
    >
      <ModulePackBrowser moduleType="picturephrases" />
    </AppShell>
  );
}
