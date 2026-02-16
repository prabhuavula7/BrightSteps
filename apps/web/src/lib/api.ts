import type { BrightStepsPack } from "@brightsteps/content-schema";

export type PackPayload = {
  pack: BrightStepsPack;
  assetUrlById: Record<string, string>;
};

export type PackSummary = {
  packId: string;
  title: string;
  moduleType: "factcards" | "picturephrases";
  topics: string[];
  itemCount: number;
  description?: string;
  valid: boolean;
  issues?: string[];
};

export async function fetchPackSummaries(): Promise<PackSummary[]> {
  const response = await fetch("/api/packs", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load pack summaries");
  }

  const payload = (await response.json()) as { packs: PackSummary[] };
  return payload.packs;
}

export async function fetchPack(packId: string): Promise<PackPayload> {
  const response = await fetch(`/api/packs/${encodeURIComponent(packId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load pack ${packId}`);
  }

  return (await response.json()) as PackPayload;
}
