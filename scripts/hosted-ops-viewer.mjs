import {createServer} from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;
const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.woff2', 'font/woff2'],
  ['.ico', 'image/x-icon'],
]);
const ALLOWED_QUERY = new Set(['from', 'to', 'channel', 'material']);
const secureHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

function loopbackOrigin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} 必须是回环 HTTP 来源`); }
  if (url.protocol !== 'http:' || !['127.0.0.1', '::1'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error(`${name} 必须是无路径、无凭据的回环 HTTP 来源`);
  return url.origin;
}

function hostMatches(host, origin) {
  return typeof host === 'string' && host === new URL(origin).host;
}

function crossSite(req) {
  const site = req.headers['sec-fetch-site'];
  return site !== undefined && site !== 'same-origin' && site !== 'none';
}

function proxied(req) {
  return !!(req.headers['x-forwarded-for'] || req.headers.forwarded || req.headers['x-real-ip'] || req.headers['x-forwarded-host']);
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {...secureHeaders, ...headers});
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), {'Content-Type': 'application/json; charset=utf-8'});
}

function safeStaticPath(staticRoot, pathname) {
  if (pathname === '/' || pathname === '') return path.join(staticRoot, 'index.html');
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (!decoded.startsWith('/') || decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(part => part === '..' || part.startsWith('.'))) return null;
  return path.join(staticRoot, decoded);
}

async function boundedJson(response) {
  if (!response.body) throw new Error('响应没有正文');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_UPSTREAM_BYTES) throw new Error('上游响应超过限制');
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const text = Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8');
  return JSON.parse(text);
}

export async function startViewer(options) {
  const staticRoot = await realpath(options.staticDir);
  if (!(await stat(staticRoot)).isDirectory()) throw new Error('静态目录无效');
  if (!existsSync(path.join(staticRoot, 'index.html'))) throw new Error('静态目录缺少 index.html；请先运行 npm run build:ops');
  const apiOrigin = loopbackOrigin(options.apiOrigin, 'HOSTED_OPS_API_ORIGIN');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  let publicOrigin = options.origin ? loopbackOrigin(options.origin, 'HOSTED_OPS_VIEWER_ORIGIN') : '';
  const port = options.port ?? 8790;
  const host = '127.0.0.1';
  const token = options.token;
  if (!token) throw new Error('HOSTED_OPS_TOKEN 未配置');

  const server = createServer(async (req, res) => {
    const expectedOrigin = publicOrigin || `http://${host}:${server.address()?.port ?? port}`;
    if (!hostMatches(req.headers.host, expectedOrigin) || proxied(req)) { sendJson(res, 421, {error: '请求主机不被允许'}); return; }
    const origin = req.headers.origin;
    if ((origin !== undefined && origin !== expectedOrigin) || crossSite(req)) { sendJson(res, 403, {error: '请求来源不被允许'}); return; }
    let url;
    try { url = new URL(req.url ?? '/', expectedOrigin); } catch { sendJson(res, 400, {error: '请求格式错误'}); return; }

    if (url.pathname === '/api/ops/summary') {
      if (req.method !== 'GET') { sendJson(res, 405, {error: '只读入口仅支持 GET'}, {Allow: 'GET'}); return; }
      const params = new URLSearchParams();
      for (const key of ALLOWED_QUERY) {
        const values = url.searchParams.getAll(key);
        if (values.length > 1) { sendJson(res, 400, {error: '查询参数重复'}); return; }
        if (!values.length) continue;
        const value = values[0];
        if (key === 'from' || key === 'to') {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) { sendJson(res, 400, {error: '日期格式无效'}); return; }
        } else if (!/^[a-z][a-z0-9-]{0,31}$/.test(value)) { sendJson(res, 400, {error: '筛选值无效'}); return; }
        params.set(key, value);
      }
      if ([...url.searchParams.keys()].some(key => !ALLOWED_QUERY.has(key))) { sendJson(res, 400, {error: '查询参数无效'}); return; }
      const upstream = new URL('/api/hosted/ops', apiOrigin);
      for (const [key, value] of params) upstream.searchParams.set(key, value);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const abortOnDisconnect = () => { if (!res.writableEnded) controller.abort(); };
      res.once('close', abortOnDisconnect);
      try {
        const response = await fetchImpl(upstream, {
          method: 'GET', redirect: 'manual', signal: controller.signal, cache: 'no-store',
          headers: {Accept: 'application/json', 'X-Gotit-Ops-Token': token},
        });
        if (response.status >= 300 && response.status < 400) throw new Error('上游重定向被拒绝');
        if (!response.ok) throw new Error('上游读取失败');
        if (!/^application\/json/i.test(response.headers.get('content-type') ?? '')) throw new Error('上游返回格式异常');
        const value = await boundedJson(response);
        sendJson(res, 200, value);
      } catch {
        if (!res.destroyed) sendJson(res, 502, {error: '无法读取服务器运营汇总；这不表示服务已停止。'});
      } finally { clearTimeout(timer); res.off('close', abortOnDisconnect); }
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') { sendJson(res, 405, {error: '只读入口仅支持 GET'}, {Allow: 'GET, HEAD'}); return; }
    const target = safeStaticPath(staticRoot, url.pathname);
    if (!target) { sendJson(res, 404, {error: '页面不存在'}); return; }
    try {
      const resolved = await realpath(target);
      if (resolved !== staticRoot && !resolved.startsWith(staticRoot + path.sep)) { sendJson(res, 404, {error: '页面不存在'}); return; }
      const info = await stat(resolved);
      if (!info.isFile()) { sendJson(res, 404, {error: '页面不存在'}); return; }
      const mime = MIME.get(path.extname(resolved).toLowerCase());
      if (!mime) { sendJson(res, 404, {error: '页面不存在'}); return; }
      const body = await readFile(resolved);
      res.writeHead(200, {...secureHeaders, 'Content-Type': mime, 'Content-Length': body.length});
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { sendJson(res, 404, {error: '页面不存在'}); }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 10_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(undefined));
  });
  const actualPort = server.address()?.port;
  publicOrigin = `http://${host}:${actualPort}`;
  return {
    server,
    origin: publicOrigin,
    port: actualPort,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(() => resolve(undefined)); }),
  };
}

export function configFromEnv(environment = process.env) {
  const port = Number(environment.HOSTED_OPS_VIEWER_PORT ?? 8790);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('HOSTED_OPS_VIEWER_PORT 无效');
  return {
    port,
    token: environment.HOSTED_OPS_TOKEN ?? '',
    apiOrigin: environment.HOSTED_OPS_API_ORIGIN ?? 'http://127.0.0.1:8788',
    staticDir: path.resolve(root, environment.HOSTED_OPS_STATIC_DIR ?? 'dist-ops'),
  };
}

async function main() {
  if (!process.env.HOSTED_OPS_TOKEN) throw new Error('HOSTED_OPS_TOKEN 必须由服务端环境提供；不要放在命令行、URL 或页面中');
  const config = configFromEnv();
  const viewer = await startViewer(config);
  console.info(`Hosted ops viewer listening on ${viewer.origin} (loopback only); token loaded from environment and not printed.`);
  const stop = () => { void viewer.close().then(() => process.exit(0)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`运营查看器启动失败: ${error.message}`); process.exit(1); });
}
