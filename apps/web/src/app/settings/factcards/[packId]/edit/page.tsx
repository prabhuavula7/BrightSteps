import { AppShell } from "@/components/app-shell";
import { FactCardsPackEditor } from "@/components/factcards-pack-editor";

export default async function FactCardsEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ packId: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { packId } = await params;
  const { source } = await searchParams;
  const normalizedSource = source === "custom" ? "custom" : "builtin";

  return (
    <AppShell
      title="Edit FactCards Pack"
      subtitle="Edit pack fields in full-page UI and save back to local memory."
    >
      <FactCardsPackEditor mode="edit" packRef={packId} source={normalizedSource} />
    </AppShell>
  );
}
