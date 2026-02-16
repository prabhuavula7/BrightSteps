import { resolvePackAssetPath } from "@/lib/pack-loader";
import fs from "node:fs/promises";
import path from "node:path";

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _: Request,
  context: { params: Promise<{ packId: string; assetPath: string[] }> },
) {
  const { packId, assetPath } = await context.params;
  const relativePath = assetPath.join("/");

  try {
    const fullPath = await resolvePackAssetPath(packId, relativePath);
    const file = await fs.readFile(fullPath);

    return new Response(file, {
      headers: {
        "content-type": getMimeType(fullPath),
        "cache-control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
