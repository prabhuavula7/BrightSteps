import { AppShell } from "@/components/app-shell";
import { PicturePhrasesPackEditor } from "@/components/picturephrases-pack-editor";

export default function PicturePhrasesCreatePage() {
  return (
    <AppShell
      title="Create PicturePhrases Pack"
      subtitle="Upload pictures only, then let AI generate sentence variants and word-bank prompts."
    >
      <PicturePhrasesPackEditor mode="create" />
    </AppShell>
  );
}
