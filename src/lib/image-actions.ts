import type { Anchor, ImageAnchor } from "../types";
import type { WebMedia } from "./web-data";
import { HOSTED_IMAGE_MAX_BYTES } from "./pdf-data";
import { REGION_MAX_PIXELS, REGION_MAX_SIDE } from "./pdf-region";

export const IMAGE_ACTION_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const IMAGE_QUOTE_FALLBACK = "图片";
export const IMAGE_ACTION_MAX_BYTES = HOSTED_IMAGE_MAX_BYTES;

const mediaIdPattern = /^[A-Za-z0-9_-]{1,80}$/;
const resourcePattern = /^[a-f0-9]{64}$/;
const revisionPattern = /^[a-zA-Z0-9_-]{1,100}$/;

export interface ImagePngTarget {
  width: number;
  height: number;
  scale: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteSize(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 16384;
}

function cleanText(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : undefined;
}

export function imageAnchorQuote(image: Pick<ImageAnchor, "alt" | "caption">): string {
  const text = (image.caption ?? "").trim() || (image.alt ?? "").trim() || IMAGE_QUOTE_FALLBACK;
  return text.replace(/\s+/g, " ").slice(0, 4000);
}

export function isImageActionableMedia(media: WebMedia | undefined | null): media is WebMedia & { resourceId: string; mime: (typeof IMAGE_ACTION_MIMES)[number] } {
  return !!media
    && media.kind === "image"
    && media.status === "saved"
    && mediaIdPattern.test(media.id)
    && !!media.resourceId
    && resourcePattern.test(media.resourceId)
    && (IMAGE_ACTION_MIMES as readonly string[]).includes(media.mime ?? "")
    && (media.width === undefined || finiteSize(media.width))
    && (media.height === undefined || finiteSize(media.height));
}

export function copyImageAnchor(value: unknown): ImageAnchor | undefined {
  if (!record(value) || value.kind !== "web-media") return;
  const allowed = new Set(["kind", "mediaId", "resourceId", "revisionId", "alt", "caption", "width", "height"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return;
  if (typeof value.mediaId !== "string" || !mediaIdPattern.test(value.mediaId)) return;
  if (typeof value.resourceId !== "string" || !resourcePattern.test(value.resourceId)) return;
  if (typeof value.revisionId !== "string" || !revisionPattern.test(value.revisionId)) return;
  if (typeof value.alt !== "string" || value.alt.length > 4000) return;
  if (value.caption !== undefined && (typeof value.caption !== "string" || value.caption.length > 4000)) return;
  if (value.width !== undefined && !finiteSize(value.width)) return;
  if (value.height !== undefined && !finiteSize(value.height)) return;
  if (typeof value.width === "number" && typeof value.height === "number" && value.width * value.height > 40_000_000) return;
  return {
    kind: "web-media",
    mediaId: value.mediaId,
    resourceId: value.resourceId,
    revisionId: value.revisionId,
    alt: value.alt,
    ...(value.caption === undefined ? {} : { caption: value.caption }),
    ...(value.width === undefined ? {} : { width: value.width as number }),
    ...(value.height === undefined ? {} : { height: value.height as number }),
  };
}

export function createImageAnchor(input: {
  documentId: string;
  revisionId: string;
  media: WebMedia;
  blockId?: string;
  headingPath?: readonly string[];
  prefix?: string;
  suffix?: string;
}): Anchor | null {
  const media = input.media;
  if (!isImageActionableMedia(media)) return null;
  const image = copyImageAnchor({
    kind: "web-media",
    mediaId: media.id,
    resourceId: media.resourceId,
    revisionId: input.revisionId,
    alt: cleanText(media.alt, 4000) ?? "",
    ...(media.caption === undefined ? {} : { caption: cleanText(media.caption, 4000) ?? "" }),
    ...(media.width === undefined ? {} : { width: media.width }),
    ...(media.height === undefined ? {} : { height: media.height }),
  });
  if (!image) return null;
  return {
    textVersion: 2,
    documentId: input.documentId,
    blockId: input.blockId?.trim() || `web-media-${media.id}`,
    headingPath: [...(input.headingPath ?? [])],
    quote: imageAnchorQuote(image),
    prefix: (input.prefix ?? "").replace(/\s+/g, " ").slice(-240),
    suffix: (input.suffix ?? "").replace(/\s+/g, " ").slice(0, 240),
    start: 0,
    end: 0,
    matchStatus: "matched",
    image,
  };
}

export function imageAnchorKey(anchor: Pick<Anchor, "documentId" | "image">): string | undefined {
  if (!anchor.image) return;
  return JSON.stringify([anchor.documentId, anchor.image.mediaId, anchor.image.resourceId]);
}

export function sameImageAnchor(a: Pick<Anchor, "documentId" | "image">, b: Pick<Anchor, "documentId" | "image">): boolean {
  return !!a.image && !!b.image
    && a.documentId === b.documentId
    && a.image.mediaId === b.image.mediaId
    && a.image.resourceId === b.image.resourceId;
}

/** Search is text-only in hosted mode; never invent a query from the image itself. */
export function imageSearchText(media: Pick<WebMedia, "alt" | "caption"> | Pick<ImageAnchor, "alt" | "caption">, nearby = ""): string {
  const parts = [media.caption, media.alt, nearby]
    .map((part) => (part ?? "").replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return [...new Set(parts)].join(" ").slice(0, 256).trim();
}

export function imageContextText(media: Pick<WebMedia, "alt" | "caption"> | Pick<ImageAnchor, "alt" | "caption">, nearby = ""): string {
  const label = media.caption?.trim() || media.alt?.trim();
  return [label ? `图片说明：${label}` : "", nearby.trim() ? `邻近文字：${nearby.trim()}` : ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

export function imageOrientedSize(width: number, height: number, orientation = 1): { width: number; height: number } {
  // EXIF orientations 5–8 rotate the stored bitmap by 90/270 degrees.
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}

export function imagePngTarget(width: number, height: number, maxPixels = REGION_MAX_PIXELS, maxSide = REGION_MAX_SIDE): ImagePngTarget | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const scale = Math.min(1, maxSide / width, maxSide / height, Math.sqrt(maxPixels / (width * height)));
  if (!Number.isFinite(scale) || scale <= 0) return null;
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
  };
}

export function imagePngWithinLimits(bytes: Uint8Array, maxBytes = IMAGE_ACTION_MAX_BYTES): boolean {
  return bytes.length > 33 && bytes.length <= maxBytes
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

export function imageAnchorElement(article: ParentNode, anchor: Pick<Anchor, "image">): HTMLImageElement | null {
  if (!anchor.image) return null;
  return [...article.querySelectorAll<HTMLImageElement>("img[data-web-media]")]
    .find((image) => image.dataset.webMedia === anchor.image!.mediaId && image.dataset.webResource === anchor.image!.resourceId) ?? null;
}
