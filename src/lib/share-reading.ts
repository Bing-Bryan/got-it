export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export interface ShareArticle {
  id: string;
  title: string;
  file: string;
}

export interface ShareManifest {
  schema: 1;
  title: string;
  articles: ShareArticle[];
}

export interface LoadedShareArticle extends ShareArticle {
  filename: string;
  markdown: string;
}

const FILE_PATTERN = /^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.md$/i;

function text(value: unknown, field: string, max: number) {
  if (typeof value !== "string") throw new Error(`分享内容缺少${field}。`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001f\u007f]/.test(trimmed)) throw new Error(`分享内容的${field}无效。`);
  return trimmed;
}

export function parseShareManifest(value: unknown): ShareManifest {
  if (!value || typeof value !== "object") throw new Error("分享清单格式无效。");
  const record = value as Record<string, unknown>;
  if (record.schema !== 1) throw new Error("分享清单版本不受支持。");
  if (!Array.isArray(record.articles) || record.articles.length < 1 || record.articles.length > 20) throw new Error("分享文章数量无效。");
  const seen = new Set<string>();
  const articles = record.articles.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`第 ${index + 1} 篇文章格式无效。`);
    const article = item as Record<string, unknown>;
    const id = text(article.id, "文章编号", 40);
    const title = text(article.title, "文章标题", 80);
    const file = text(article.file, "文章路径", 120);
    if (!FILE_PATTERN.test(file) || file.includes("..") || file.startsWith("/")) throw new Error(`第 ${index + 1} 篇文章的路径无效。`);
    if (seen.has(id)) throw new Error("分享文章编号重复。");
    seen.add(id);
    return { id, title, file };
  });
  return { schema: 1, title: text(record.title, "分享标题", 80), articles };
}

export function shareTokenFromLocation(locationLike: Pick<Location, "hash"> = location): string {
  let candidate = "";
  try {
    candidate = new URLSearchParams(locationLike.hash.replace(/^#/u, "")).get("share")?.trim() ?? "";
  } catch {
    candidate = "";
  }
  return SHARE_TOKEN_PATTERN.test(candidate) ? candidate : "";
}

export function rewriteShareMarkdown(markdown: string, origin: string, token: string): string {
  if (!SHARE_TOKEN_PATTERN.test(token)) throw new Error("分享链接无效。");
  const prefix = `${origin.replace(/\/$/u, "")}/s/${token}/`;
  return markdown
    .replace(/(\]\()assets\//gu, `$1${prefix}assets/`)
    .replace(/(<img\b[^>]*\bsrc=["'])assets\//gu, `$1${prefix}assets/`);
}

function safeFilename(title: string, id: string): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 80) || `分享文章-${id}`;
  return `${base}.md`;
}

export async function loadShareManifest(
  token: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<ShareManifest> {
  if (!SHARE_TOKEN_PATTERN.test(token)) throw new Error("分享链接无效。");
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`/s/${token}/manifest.json`, { cache: "no-store", credentials: "same-origin", signal: options.signal });
  if (!response.ok) throw new Error("分享内容暂时无法读取，请稍后重试。");
  let value: unknown;
  try { value = await response.json(); } catch { throw new Error("分享清单无法解析。"); }
  return parseShareManifest(value);
}

export async function loadShareArticles(
  manifest: ShareManifest,
  token: string,
  options: { origin?: string; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<LoadedShareArticle[]> {
  if (!SHARE_TOKEN_PATTERN.test(token)) throw new Error("分享链接无效。");
  const origin = options.origin ?? location.origin;
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = `${origin.replace(/\/$/u, "")}/s/${token}/`;
  const used = new Set<string>();
  const loaded: LoadedShareArticle[] = [];
  for (const article of manifest.articles) {
    const response = await fetchImpl(new URL(article.file, base).href, { cache: "no-store", credentials: "same-origin", signal: options.signal });
    if (!response.ok) throw new Error(`《${article.title}》暂时无法读取。`);
    const markdown = rewriteShareMarkdown(await response.text(), origin, token);
    let filename = safeFilename(article.title, article.id);
    if (used.has(filename)) filename = `${filename.slice(0, -3)}（${article.id}）.md`;
    used.add(filename);
    loaded.push({ ...article, filename, markdown });
  }
  return loaded;
}
