import type { BrightStepsPack } from "@brightsteps/content-schema";

export type PackThumbnail = {
  src?: string;
  alt?: string;
};

export function resolvePackThumbnail(pack: BrightStepsPack): PackThumbnail {
  const ref = pack.settings?.packThumbnailImageRef;
  if (!ref) {
    return {};
  }

  const asset = pack.assets.find((entry) => entry.id === ref && entry.kind === "image");
  if (!asset) {
    return {};
  }

  const src = toRenderableThumbnailPath(asset.path);
  if (!src) {
    return {};
  }

  return {
    src,
    alt: asset.alt,
  };
}

function toRenderableThumbnailPath(pathValue: string): string | undefined {
  if (
    pathValue.startsWith("http://") ||
    pathValue.startsWith("https://") ||
    pathValue.startsWith("data:") ||
    pathValue.startsWith("blob:") ||
    pathValue.startsWith("/")
  ) {
    return pathValue;
  }

  return undefined;
}

