import { AppShell } from "@/components/app-shell";
import { PicturePhrasesPackEditor } from "@/components/picturephrases-pack-editor";

export default async function PicturePhrasesEditPage({
  params,
}: {
  params: Promise<{ packId: string }>;
}) {
  const { packId } = await params;

  return (
    <AppShell
      title="Edit PicturePhrases Pack"
      subtitle="Switch between UI and JSON editing, regenerate sentence prompts, and manage picture cards."
    >
      <PicturePhrasesPackEditor mode="edit" packRef={packId} />
    </AppShell>
  );
}
