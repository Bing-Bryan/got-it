import { expect, it, vi } from "vitest";
import { applyInquiryHighlights, findInquiryHighlight, emphasizeInquiryHighlight, clearInquiryHighlights } from "./anchors";
import { renderMarkdown } from "./markdown";
import { createImageAnchor } from "./image-actions";
import { webWorkspace } from "../test-support/web";
import type { Inquiry } from "../types";

function fixture() {
  const w = webWorkspace();
  const web = (w.document as Extract<typeof w.document, { kind: "web" }>).web;
  const article = document.createElement("article");
  article.innerHTML = renderMarkdown(w.document.markdown!, web).html;
  const image = article.querySelector<HTMLImageElement>("img[data-web-media]")!;
  const anchor = createImageAnchor({ documentId: w.document.id, revisionId: "rev", media: web.media[0] })!;
  const note: Inquiry = { id: "image-note", intent: "explain", question: "这张图说明什么？", anchor, status: "ready", messages: [], understanding: "", createdAt: "2026", updatedAt: "2026" };
  return { article, image, anchor, note };
}

it("marks an image without wrapping text and keeps one active image focus", () => {
  const { article, image, note } = fixture();
  const originalLabel = image.getAttribute("aria-label");
  const cleanup = applyInquiryHighlights(article, [note], "image-note");
  expect(article.querySelector("mark")).toBeNull();
  expect(image.dataset.imageInquiry).toBe("image-note");
  expect(image.classList.contains("image-inquiry-mark")).toBe(true);
  expect(image.classList.contains("is-active")).toBe(true);
  expect(image.getAttribute("aria-label")).toContain("图片知识贴");
  expect(findInquiryHighlight(article, [note], "image-note")).toBe(image);
  emphasizeInquiryHighlight(article, [note], null);
  expect(image.classList.contains("is-emphasized")).toBe(false);
  emphasizeInquiryHighlight(article, [note], "image-note");
  expect(image.classList.contains("is-emphasized")).toBe(true);
  cleanup();
  expect(image.hasAttribute("data-image-inquiry")).toBe(false);
  expect(image.classList.contains("image-inquiry-mark")).toBe(false);
  expect(image.getAttribute("aria-label")).toBe(originalLabel);
});

it("keeps same-alt images separate and reports a missing image without a text fallback", () => {
  const { article, image, anchor } = fixture();
  const other = { ...anchor, image: { ...anchor.image!, mediaId: "other-image", resourceId: "c".repeat(64) }, quote: anchor.quote };
  const first: Inquiry = { id: "first", intent: "explain", question: "q1", anchor, status: "ready", messages: [], understanding: "", createdAt: "2026", updatedAt: "2026" };
  const second: Inquiry = { ...first, id: "second", anchor: other };
  const missing = vi.fn();
  applyInquiryHighlights(article, [first, second], "first", missing);
  expect(article.querySelectorAll("img[data-image-inquiry]")).toHaveLength(1);
  expect(missing).toHaveBeenCalledWith(second);
  expect(findInquiryHighlight(article, [first, second], "second")).toBeNull();
  expect(image.dataset.imageInquiry).toBe("first");
  clearInquiryHighlights(article);
});


it("does not mark an image inquiry missing merely because the translated view lacks the image", () => {
  const { article, image, note } = fixture();
  article.dataset.readingSide = "translated";
  image.remove();
  const missing = vi.fn();
  applyInquiryHighlights(article, [note], "image-note", missing);
  expect(missing).not.toHaveBeenCalled();
});
