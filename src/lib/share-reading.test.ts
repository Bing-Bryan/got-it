import { expect, it } from "vitest";
import {
  loadShareArticles,
  parseShareManifest,
  rewriteShareMarkdown,
  shareTokenFromLocation,
  type ShareManifest,
} from "./share-reading";

const token = "a".repeat(32);

it("parses a bounded share manifest and rejects unsafe paths", () => {
  const manifest = parseShareManifest({
    schema: 1,
    title: "九篇分享",
    articles: [
      { id: "01", title: "第一篇", file: "articles/01.md" },
      { id: "02", title: "第二篇", file: "articles/02.md" },
    ],
  });
  expect(manifest.articles).toHaveLength(2);
  expect(() => parseShareManifest({ schema: 1, title: "x", articles: [{ id: "01", title: "x", file: "../secret.md" }] })).toThrow();
  expect(() => parseShareManifest({ schema: 1, title: "x", articles: [{ id: "01", title: "x", file: "/etc/passwd" }] })).toThrow();
  expect(() => parseShareManifest({ schema: 1, title: "x", articles: [{ id: "01", title: "x", file: "assets/a.png" }] })).toThrow();
  expect(() => parseShareManifest({ schema: 2, title: "x", articles: [] })).toThrow();
});

it("reads the share token from the hash without hijacking later normal URLs", () => {
  expect(shareTokenFromLocation({ hash: `#share=${token}` })).toBe(token);
  expect(shareTokenFromLocation({ hash: "#section-2" })).toBe("");
  expect(shareTokenFromLocation({ hash: "#share=short" })).toBe("");
  expect(shareTokenFromLocation({ hash: "" })).toBe("");
});

it("rewards relative article images to absolute same-origin URLs", () => {
  const markdown = "![图](assets/one/a.png)\n\n<img src=\"assets/two/b.png\" alt=\"b\">\n\n![remote](https://example.com/c.png)";
  const rewritten = rewriteShareMarkdown(markdown, "https://gotit.example", token);
  expect(rewritten).toContain(`https://gotit.example/s/${token}/assets/one/a.png`);
  expect(rewritten).toContain(`https://gotit.example/s/${token}/assets/two/b.png`);
  expect(rewritten).toContain("https://example.com/c.png");
});

it("loads every article and assigns a readable filename", async () => {
  const manifest: ShareManifest = {
    schema: 1,
    title: "分享",
    articles: [
      { id: "01", title: "第一篇：开始", file: "articles/01.md" },
      { id: "02", title: "第一篇：开始", file: "articles/02.md" },
    ],
  };
  const fetchImpl = (async (url: string) => ({
    ok: true,
    text: async () => `# ${url}\n\n![图](assets/a.png)`,
    json: async () => manifest,
  })) as unknown as typeof fetch;
  const articles = await loadShareArticles(manifest, token, { origin: "https://gotit.example", fetchImpl });
  expect(articles).toHaveLength(2);
  expect(articles[0].filename).toBe("第一篇：开始.md");
  expect(articles[1].filename).toBe("第一篇：开始（02）.md");
  expect(articles[0].markdown).toContain(`https://gotit.example/s/${token}/assets/a.png`);
});
