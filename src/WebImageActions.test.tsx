import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebImageActions } from "./WebImageActions";
import { renderMarkdown } from "./lib/markdown";
import { webWorkspace } from "./test-support/web";
import { libraryRequest } from "./lib/library-client";

vi.mock("./lib/library-client", () => ({ libraryRequest: vi.fn(async () => ({ bookmark: null })) }));

let host: HTMLDivElement, root: Root, article: HTMLElement, articleRef: ReturnType<typeof createRef<HTMLElement>>;
const workspace = webWorkspace();
const media = (workspace.document as Extract<typeof workspace.document, { kind: "web" }>).web.media[0];

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.body.appendChild(document.createElement("div"));
  article = document.body.appendChild(document.createElement("article"));
  article.innerHTML = renderMarkdown(workspace.document.markdown!, (workspace.document as Extract<typeof workspace.document, { kind: "web" }>).web).html;
  articleRef = createRef<HTMLElement>();
  articleRef.current = article;
  root = createRoot(host);
  vi.mocked(libraryRequest).mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  article.remove();
});

async function render(onCreate = vi.fn().mockResolvedValue(true), overrides: Partial<Parameters<typeof WebImageActions>[0]> = {}) {
  await act(async () => root.render(<WebImageActions
    article={articleRef}
    documentKey="doc"
    workspace={workspace}
    entryId="entry"
    revisionId="rev"
    readOnly={false}
    busy={false}
    ready
    modelReady
    bookmarkVersion={0}
    onBookmarkSaved={() => {}}
    onCreate={onCreate}
    {...overrides}
  />));
  return onCreate;
}

it("shows a fixed image toolbar on hover without creating an inquiry", async () => {
  const onCreate = await render();
  const image = article.querySelector<HTMLImageElement>("img[data-web-media]")!;
  await act(async () => image.dispatchEvent(new Event("pointerover", { bubbles: true })));
  const toolbar = host.querySelector<HTMLElement>(".image-actions-toolbar");
  expect(toolbar).not.toBeNull();
  expect(toolbar!.getAttribute("role")).toBe("toolbar");
  expect(toolbar!.textContent).toContain("解释一下");
  expect(toolbar!.textContent).toContain("查找来源");
  expect(toolbar!.textContent).toContain("问一问");
  expect(toolbar!.textContent).not.toContain("托管及模型服务");
  expect(onCreate).not.toHaveBeenCalled();
});

it("creates an image inquiry from the clicked image and keeps the hover toolbar until explicitly closed", async () => {
  const onCreate = vi.fn().mockResolvedValue(false);
  await render(onCreate);
  const image = article.querySelector<HTMLImageElement>("img[data-web-media]")!;
  await act(async () => image.dispatchEvent(new Event("pointerover", { bubbles: true })));
  await act(async () => host.querySelector<HTMLButtonElement>('.image-card-actions [data-intent="explain"]')!.click());
  expect(onCreate).toHaveBeenCalledOnce();
  const [intent, draft] = onCreate.mock.calls[0];
  expect(intent).toBe("explain");
  expect(draft.anchor.image).toMatchObject({ mediaId: media.id, resourceId: media.resourceId, revisionId: "rev" });
  expect(draft.anchor.quote).toBe("Architecture");
  expect(host.querySelector(".image-actions-toolbar")).not.toBeNull();

  onCreate.mockResolvedValue(true);
  await act(async () => host.querySelector<HTMLButtonElement>('.image-card-actions [data-intent="verify"]')!.click());
  expect(host.querySelector(".image-actions-toolbar")).not.toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('.image-actions-toolbar .selection-close')!.click());
  expect(host.querySelector(".image-actions-toolbar")).toBeNull();
});

it("closes with Escape and returns focus to the image", async () => {
  await render();
  const image = article.querySelector<HTMLImageElement>("img[data-web-media]")!;
  await act(async () => image.dispatchEvent(new Event("pointerover", { bubbles: true })));
  expect(host.querySelector(".image-actions-toolbar")).not.toBeNull();
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(host.querySelector(".image-actions-toolbar")).toBeNull();
  expect(document.activeElement).toBe(image);
});

it("does not open for missing or unsupported images", async () => {
  const onCreate = await render();
  const image = article.querySelector<HTMLImageElement>("img[data-web-media]")!;
  image.dataset.webMedia = "chart-two";
  await act(async () => image.dispatchEvent(new Event("pointerover", { bubbles: true })));
  expect(host.querySelector(".image-actions-toolbar")).toBeNull();
  expect(onCreate).not.toHaveBeenCalled();
});


it("keeps the image bookmark available when the model is unavailable", async () => {
  await render(vi.fn().mockResolvedValue(true), { modelReady: false });
  const image = article.querySelector<HTMLImageElement>("img[data-web-media]")!;
  await act(async () => image.dispatchEvent(new Event("pointerover", { bubbles: true })));
  const bookmark = host.querySelector<HTMLButtonElement>(".image-actions-toolbar .bookmark-icon")!;
  const explain = host.querySelector<HTMLButtonElement>('.image-card-actions [data-intent="explain"]')!;
  expect(bookmark.disabled).toBe(false);
  expect(explain.disabled).toBe(true);
});

it("keeps the toolbar inside the viewport when the image extends below it", async () => {
  await render();
  const image = article.querySelector<HTMLImageElement>("img[data-web-media]")!;
  const original = image.getBoundingClientRect.bind(image);
  image.getBoundingClientRect = () => ({ ...original(), top: 600, bottom: 1500, height: 900, y: 600, toJSON: () => ({}) }) as DOMRect;
  await act(async () => image.dispatchEvent(new Event("pointerover", { bubbles: true })));
  const toolbar = host.querySelector<HTMLElement>(".image-actions-toolbar")!;
  expect(Number.parseFloat(toolbar.style.bottom)).toBeGreaterThanOrEqual(8);
});


it("does not open when the DOM no longer carries the authorized resource identity", async () => {
  await render();
  const image = article.querySelector<HTMLImageElement>("img[data-web-media]")!;
  delete image.dataset.webResource;
  await act(async () => image.dispatchEvent(new Event("pointerover", { bubbles: true })));
  expect(host.querySelector(".image-actions-toolbar")).toBeNull();
});
