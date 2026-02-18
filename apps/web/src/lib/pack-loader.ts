import { validatePack, type BrightStepsPack } from "@brightsteps/content-schema";
import fs from "node:fs/promises";
import path from "node:path";

export type PackSummary = {
  packId: string;
  title: string;
  moduleType: "factcards" | "picturephrases" | "vocabvoice";
  topics: string[];
  itemCount: number;
  description?: string;
  thumbnailUrl?: string;
  thumbnailAlt?: string;
  valid: boolean;
  issues?: string[];
};

const CANDIDATE_PACK_DIRS = [
  path.resolve(process.cwd(), "content/packs"),
  path.resolve(process.cwd(), "../../content/packs"),
  path.resolve(process.cwd(), "../../../content/packs"),
  path.resolve(process.cwd(), "apps/web/../../content/packs"),
];

async function getPacksRootDir(): Promise<string> {
  for (const candidate of CANDIDATE_PACK_DIRS) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        return candidate;
      }
    } catch {
      // Keep checking candidates.
    }
  }

  throw new Error("Could not locate content/packs directory from current workspace.");
}

export async function listPackDirectories(): Promise<string[]> {
  const root = await getPacksRootDir();
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

export async function readPackJson(packId: string): Promise<unknown> {
  const root = await getPacksRootDir();
  const packPath = path.join(root, packId, "pack.json");
  const raw = await fs.readFile(packPath, "utf-8");
  return JSON.parse(raw) as unknown;
}

export async function loadValidatedPack(packId: string): Promise<{
  pack: BrightStepsPack | null;
  issues?: string[];
}> {
  const json = await readPackJson(packId);
  const result = validatePack(json);

  if (!result.success) {
    return {
      pack: null,
      issues: result.issues.map((issue) => `${issue.path}: ${issue.message}`),
    };
  }

  return { pack: result.data };
}

export async function listPackSummaries(): Promise<PackSummary[]> {
  const ids = await listPackDirectories();

  const summaries = await Promise.all(
    ids.map(async (packId) => {
      try {
        const { pack, issues } = await loadValidatedPack(packId);
        if (!pack) {
          return {
            packId,
            title: packId,
            moduleType: "factcards",
            topics: [],
            itemCount: 0,
            valid: false,
            issues,
          } as PackSummary;
        }

        return {
          packId,
          title: pack.title,
          description: pack.description,
          moduleType: pack.moduleType,
          topics: pack.topics,
          itemCount: pack.items.length,
          thumbnailUrl: getPackThumbnailUrl(packId, pack),
          thumbnailAlt: getPackThumbnailAlt(pack),
          valid: true,
        } as PackSummary;
      } catch (error) {
        return {
          packId,
          title: packId,
          moduleType: "factcards",
          topics: [],
          itemCount: 0,
          valid: false,
          issues: [error instanceof Error ? error.message : "Unknown pack load error"],
        } as PackSummary;
      }
    }),
  );

  return summaries;
}

function getPackThumbnailUrl(packId: string, pack: BrightStepsPack): string | undefined {
  const imageRef = pack.settings?.packThumbnailImageRef;
  if (!imageRef) {
    return undefined;
  }

  const asset = pack.assets.find((entry) => entry.id === imageRef && entry.kind === "image");
  if (!asset) {
    return undefined;
  }

  if (
    asset.path.startsWith("http://") ||
    asset.path.startsWith("https://") ||
    asset.path.startsWith("data:") ||
    asset.path.startsWith("/")
  ) {
    return asset.path;
  }

  return buildAssetUrl(packId, asset.path);
}

function getPackThumbnailAlt(pack: BrightStepsPack): string | undefined {
  const imageRef = pack.settings?.packThumbnailImageRef;
  if (!imageRef) {
    return undefined;
  }

  return pack.assets.find((entry) => entry.id === imageRef && entry.kind === "image")?.alt;
}

export async function resolvePackAssetPath(packId: string, relativePath: string): Promise<string> {
  const root = await getPacksRootDir();
  const fullPath = path.join(root, packId, relativePath);
  const normalizedRoot = path.join(root, packId);

  if (!fullPath.startsWith(normalizedRoot)) {
    throw new Error("Invalid asset path");
  }

  return fullPath;
}

export function buildAssetUrl(packId: string, relativePath: string): string {
  const encoded = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/api/packs/${packId}/asset/${encoded}`;
}
