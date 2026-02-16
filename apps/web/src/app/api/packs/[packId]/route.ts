import { buildAssetUrl, loadValidatedPack } from "@/lib/pack-loader";
import { NextResponse } from "next/server";

function toAssetUrl(packId: string, pathValue: string): string {
  const isExternal = /^https?:\/\//i.test(pathValue);
  const isData = /^data:/i.test(pathValue);
  const isBlob = /^blob:/i.test(pathValue);
  if (isExternal || isData || isBlob) {
    return pathValue;
  }
  return buildAssetUrl(packId, pathValue);
}

export async function GET(_: Request, context: { params: Promise<{ packId: string }> }) {
  const { packId } = await context.params;
  const result = await loadValidatedPack(packId);

  if (!result.pack) {
    return NextResponse.json(
      {
        error: "Invalid pack",
        issues: result.issues ?? ["Pack failed validation"],
      },
      { status: 400 },
    );
  }

  const assetUrlById = Object.fromEntries(
    result.pack.assets.map((asset) => [asset.id, toAssetUrl(packId, asset.path)]),
  );

  return NextResponse.json({ pack: result.pack, assetUrlById });
}
