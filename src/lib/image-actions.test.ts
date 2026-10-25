import { expect, it } from "vitest";
import { webWorkspace } from "../test-support/web";
import { renderMarkdown } from "./markdown";
import { sanitizeWorkspace, restoreWorkspace } from "./storage";
import { sameAnchor } from "./inquiry-tabs";
import { bookmarkPosition } from "./bookmark-types";
import { selectionContext, selectionRequestError } from "./inquiry-selection";
import {
  IMAGE_QUOTE_FALLBACK,
  copyImageAnchor,
  createImageAnchor,
  imageAnchorKey,
  imageAnchorQuote,
  imageContextText,
  imageOrientedSize,
  imagePngTarget,
  imagePngWithinLimits,
  imageSearchText,
  imageAnchorElement,
  isImageActionableMedia,
  sameImageAnchor,
} from "./image-actions";
import type { Inquiry } from "../types";

const inquiry = (anchor: Inquiry["anchor"], id = "image-inquiry"): Inquiry => ({
  id,
  intent: "explain",
  question: "这张图在说什么？",
  anchor,
  status: "ready",
  messages: [],
  understanding: "",
  createdAt: "2026-10-25T00:00:00.000Z",
  updatedAt: "2026-10-25T00:00:00.000Z",
});

it("selects only saved raster web images and builds a stable image anchor", () => {
  const w = webWorkspace();
  const web = w.document.kind === "web" ? w.document.web : null;
  expect(web).not.toBeNull();
  const image = web!.media[0];
  const chart = web!.media[1];
  expect(isImageActionableMedia(image)).toBe(true);
  expect(isImageActionableMedia(chart)).toBe(false);
  expect(isImageActionableMedia({ ...image, mime: "image/svg+xml" })).toBe(false);
  expect(isImageActionableMedia({ ...image, status: "missing" })).toBe(false);
  const anchor = createImageAnchor({ documentId: w.document.id, revisionId: "revision-1", media: image, headingPath: ["图表"], prefix: "前文", suffix: "后文" });
  expect(anchor).not.toBeNull();
  expect(anchor!.image).toEqual({ kind: "web-media", mediaId: "image-one", resourceId: "b".repeat(64), revisionId: "revision-1", alt: "Architecture", width: 640, height: 360 });
  expect(anchor!.quote).toBe("Architecture");
  expect(anchor!.blockId).toBe("web-media-image-one");
  expect(anchor!.start).toBe(0);
  expect(anchor!.end).toBe(0);
  expect(anchor!.prefix).toBe("前文");
  expect(anchor!.suffix).toBe("后文");
  expect(imageAnchorKey(anchor!)).toContain("image-one");
  expect(sameImageAnchor(anchor!, { ...anchor!, image: { ...anchor!.image!, mediaId: "chart-two" } })).toBe(false);
  expect(sameAnchor(anchor!, { ...anchor!, quote: "另一个说明" })).toBe(true);
  expect(sameAnchor(anchor!, { ...anchor!, image: { ...anchor!.image!, resourceId: "c".repeat(64) } })).toBe(false);
});

it("uses a readable fallback and rejects malformed stored image anchors", () => {
  const w = webWorkspace();
  const image = (w.document as Extract<typeof w.document, { kind: "web" }>).web.media[0];
  const anchor = createImageAnchor({ documentId: w.document.id, revisionId: "r", media: { ...image, alt: "", caption: "  图 1  流程  " } })!;
  expect(anchor.quote).toBe("图 1 流程");
  expect(imageAnchorQuote({ alt: "" })).toBe(IMAGE_QUOTE_FALLBACK);
  expect(copyImageAnchor({ ...anchor.image, extra: true })).toBeUndefined();
  expect(copyImageAnchor({ ...anchor.image, resourceId: "not-a-hash" })).toBeUndefined();
  expect(copyImageAnchor({ ...anchor.image, width: 0 })).toBeUndefined();
});

it("builds bounded search text and context without URLs or duplicate fragments", () => {
  const media = { alt: "Architecture", caption: "系统 图 https://example.com/a" };
  expect(imageSearchText(media, "  系统 图  ")).toBe("系统 图 Architecture");
  expect(imageSearchText({ alt: "" }, "")).toBe("");
  expect(imageContextText(media, "邻近 说明")).toContain("图片说明：系统 图");
  expect(imageContextText(media, "邻近 说明")).toContain("邻近文字：邻近 说明");
  expect(imageSearchText({ alt: "x".repeat(500) }, "").length).toBe(256);
});

it("fits PNG targets to the existing side and pixel limits", () => {
  expect(imagePngTarget(640, 360)).toMatchObject({ width: 640, height: 360, scale: 1 });
  const huge = imagePngTarget(8000, 6000)!;
  expect(huge.width).toBeLessThanOrEqual(4096);
  expect(huge.height).toBeLessThanOrEqual(4096);
  expect(huge.width * huge.height).toBeLessThanOrEqual(2_500_001);
  expect(imagePngTarget(0, 1)).toBeNull();
  expect(imagePngWithinLimits(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(40).fill(1)]))).toBe(true);
  expect(imagePngWithinLimits(new Uint8Array(8))).toBe(false);
});

it("persists image anchors without changing text anchors or old records", () => {
  const w = webWorkspace();
  const web = (w.document as Extract<typeof w.document, { kind: "web" }>).web;
  const anchor = createImageAnchor({ documentId: w.document.id, revisionId: "rev", media: web.media[0], prefix: "前", suffix: "后" })!;
  w.inquiries = [inquiry(anchor)];
  const saved = sanitizeWorkspace(w);
  expect(saved.inquiries[0].anchor.image).toEqual(anchor.image);
  expect(saved.inquiries[0].anchor.quote).toBe("Architecture");
  const restored = restoreWorkspace(JSON.parse(JSON.stringify(saved)));
  expect(restored?.inquiries[0].anchor.image).toEqual(anchor.image);
  const text = sanitizeWorkspace({ ...w, inquiries: [{ ...inquiry(anchor), anchor: { ...anchor, image: undefined, blockId: "block-1", quote: "正文", start: 0, end: 2, prefix: "", suffix: "" } }] });
  expect(text.inquiries[0].anchor.image).toBeUndefined();
  expect(text.inquiries[0].anchor.quote).toBe("正文");
});

it("uses image identity for bookmark dedupe instead of alt text", () => {
  const w = webWorkspace();
  const web = (w.document as Extract<typeof w.document, { kind: "web" }>).web;
  const anchor = createImageAnchor({ documentId: w.document.id, revisionId: "rev", media: web.media[0] })!;
  const first = bookmarkPosition({ entryId: "entry", revisionId: "rev", anchor });
  const second = bookmarkPosition({ entryId: "entry", revisionId: "rev", anchor: { ...anchor, quote: "不同的说明" } });
  expect(second).toBe(first);
  const other = bookmarkPosition({ entryId: "entry", revisionId: "rev", anchor: { ...anchor, image: { ...anchor.image!, mediaId: "other" } } });
  expect(other).not.toBe(first);
});


it("builds bounded image context and accepts image requests without sending other images", () => {
  const w = webWorkspace();
  const web = (w.document as Extract<typeof w.document, { kind: "web" }>).web;
  const anchor = createImageAnchor({ documentId: w.document.id, revisionId: "rev", media: web.media[0], headingPath: ["图表"], suffix: "邻近说明" })!;
  const context = selectionContext(null, anchor, "explain", "解释");
  expect(context).toContain("章节：图表");
  expect(context).toContain("图片说明：Architecture");
  expect(context).toContain("邻近文字：邻近说明");
  expect(selectionRequestError(anchor, "解释", context, "explain")).toBeUndefined();
  const empty = createImageAnchor({ documentId: w.document.id, revisionId: "rev", media: { ...web.media[0], alt: "", caption: "" } })!;
  expect(imageSearchText(empty.image!, "")).toBe("");
});

it('does not bind a DOM image whose authorized resource changed', () => {
  const w = webWorkspace();
  const web = (w.document as Extract<typeof w.document, { kind: "web" }>).web;
  const article = document.createElement("article");
  article.innerHTML = renderMarkdown(w.document.markdown!, web).html;
  const anchor = createImageAnchor({ documentId: w.document.id, revisionId: "rev", media: web.media[0] })!;
  expect(imageAnchorElement(article, anchor)).not.toBeNull();
  expect(imageAnchorElement(article, { ...anchor, image: { ...anchor.image!, resourceId: "c".repeat(64) } })).toBeNull();
  delete article.querySelector('img')!.dataset.webResource;
  expect(imageAnchorElement(article, anchor)).toBeNull();
});


it("swaps dimensions for EXIF orientations that rotate the stored image", () => {
  expect(imageOrientedSize(800, 450, 1)).toEqual({ width: 800, height: 450 });
  expect(imageOrientedSize(800, 450, 6)).toEqual({ width: 450, height: 800 });
  expect(imageOrientedSize(800, 450, 8)).toEqual({ width: 450, height: 800 });
  expect(imageOrientedSize(800, 450, 3)).toEqual({ width: 800, height: 450 });
});
