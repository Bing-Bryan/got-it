import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebImageActions } from "./WebImageActions";
import { renderMarkdown } from "./lib/markdown";
import { webWorkspace } from "./test-support/web";

vi.mock("./lib/runtime-mode", () => ({ HOSTED: true }));
vi.mock("./lib/library-client", () => ({ libraryRequest: vi.fn(async () => ({ bookmark: null })) }));

let host: HTMLDivElement, root: Root, article: HTMLElement, articleRef: ReturnType<typeof createRef<HTMLElement>>;
const workspace = webWorkspace();
const web = (workspace.document as Extract<typeof workspace.document, { kind: "web" }>).web;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.body.appendChild(document.createElement("div"));
  article = document.body.appendChild(document.createElement("article"));
  article.innerHTML = renderMarkdown(workspace.document.markdown!, web).html;
  articleRef = createRef<HTMLElement>();
  articleRef.current = article;
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  article.remove();
});

async function render(current = workspace) {
  await act(async () => root.render(<WebImageActions
    article={articleRef}
    documentKey="doc"
    workspace={current}
    entryId="entry"
    revisionId="rev"
    readOnly={false}
    busy={false}
    ready
    modelReady
    bookmarkVersion={0}
    onBookmarkSaved={() => {}}
    onCreate={vi.fn().mockResolvedValue(true)}
  />));
}

it("disables image verification before sending when there is no searchable caption or alt", async () => {
  const empty = structuredClone(workspace);
  if (empty.document.kind !== "web") throw Error();
  empty.document.web.media[0].alt = "";
  await render(empty);
  const image = article.querySelector<HTMLImageElement>("img[data-web-media]")!;
  await act(async () => image.dispatchEvent(new Event("pointerover", { bubbles: true })));
  const verify = host.querySelector<HTMLButtonElement>('.image-card-actions [data-intent="verify"]')!;
  expect(verify.disabled).toBe(true);
  expect(verify.title).toContain("没有可检索的说明文字");
  expect(host.querySelector(".selection-action-note")?.textContent).toContain("没有可检索的说明文字");
  expect(host.querySelector('.image-card-actions [data-intent="explain"]')?.hasAttribute("disabled")).toBe(false);
});

it("keeps verification available when the image has an alt or caption", async () => {
  await render();
  const image = article.querySelector<HTMLImageElement>("img[data-web-media]")!;
  await act(async () => image.dispatchEvent(new Event("pointerover", { bubbles: true })));
  expect(host.querySelector<HTMLButtonElement>('.image-card-actions [data-intent="verify"]')?.disabled).toBe(false);
});
