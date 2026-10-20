import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createServer, request as httpRequest} from 'node:http';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startViewer} from './hosted-ops-viewer.mjs';

const token = 'ops-viewer-secret-token';
const cleanups = [];
afterEach(async () => { for (const fn of cleanups.splice(0).reverse()) await fn(); });

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gotit-ops-viewer-'));
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>');
  writeFileSync(path.join(dir, 'assets/app.js'), 'console.log("ops");');
  writeFileSync(path.join(dir, 'assets/app.css'), 'body{color:#17181b}');
  cleanups.push(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
}

async function upstream(handler = (_req, res) => { res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({schemaVersion: 1, generatedAt: new Date().toISOString(), admission: {}, budget: {}, statistics: null, health: null})); }) {
  const seen = [];
  const server = createServer((req, res) => { seen.push({url: req.url, headers: req.headers}); handler(req, res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return {origin: `http://127.0.0.1:${server.address().port}`, seen};
}

async function viewer(apiOrigin, timeoutMs = 500) {
  const started = await startViewer({port: 0, token, apiOrigin, staticDir: fixture(), timeoutMs});
  cleanups.push(() => started.close());
  return started;
}

function rawRequest(origin, pathname, {method = 'GET', headers = {}} = {}) {
  const url = new URL(pathname, origin);
  return new Promise((resolve, reject) => {
    const req = httpRequest({hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers}, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8')}));
    });
    req.on('error', reject);
    req.end();
  });
}

function request(url, {method = 'GET', headers = {}} = {}) {
  return new Promise((resolve, reject) => {
    const req = globalThis.fetch(url, {method, headers, redirect: 'manual'});
    req.then(response => response.text().then(body => resolve({status: response.status, headers: response.headers, body}))).catch(reject);
  });
}

test('serves only the fixed local page and proxies one fixed GET summary with the server token', async () => {
  const fake = await upstream((req, res) => { res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({schemaVersion: 1, generatedAt: new Date().toISOString(), admission: {slots: {global: 0}}, budget: {scope: 'model-and-search-only'}, statistics: null, health: null})); });
  const app = await viewer(fake.origin);
  const page = await request(`${app.origin}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.headers.get('access-control-allow-origin'), null);
  assert.equal(page.body.includes(token), false);
  const asset = await request(`${app.origin}/assets/app.js`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8');
  const summary = await request(`${app.origin}/api/ops/summary?from=2026-10-14&to=2026-10-20&channel=direct&material=all`);
  assert.equal(summary.status, 200);
  assert.deepEqual(JSON.parse(summary.body).budget, {scope: 'model-and-search-only'});
  assert.equal(fake.seen.length, 1);
  assert.equal(fake.seen[0].url, '/api/hosted/ops?from=2026-10-14&to=2026-10-20&channel=direct&material=all');
  assert.equal(fake.seen[0].headers['x-gotit-ops-token'], token);
  assert.equal(summary.body.includes(token), false);
});

test('rejects wrong Host, cross-site origin, proxy headers, writes, unknown paths and query injection', async () => {
  const fake = await upstream();
  const app = await viewer(fake.origin);
  assert.equal((await rawRequest(app.origin, '/', {headers: {host: 'gotit.example.com'}})).status, 421);
  assert.equal((await request(`${app.origin}/api/ops/summary`, {headers: {origin: 'https://evil.example'}})).status, 403);
  assert.equal((await request(`${app.origin}/api/ops/summary`, {headers: {'sec-fetch-site': 'cross-site'}})).status, 403);
  assert.equal((await request(`${app.origin}/api/ops/summary`, {headers: {'x-forwarded-for': '203.0.113.9'}})).status, 421);
  assert.equal((await request(`${app.origin}/api/ops/summary`, {method: 'POST'})).status, 405);
  assert.equal((await request(`${app.origin}/api/ops/alerts/1/retry`, {method: 'POST'})).status, 405);
  assert.equal((await request(`${app.origin}/api/ops/anything`)).status, 404);
  assert.equal((await request(`${app.origin}/api/ops/summary?url=https%3A%2F%2Fevil.example`)).status, 400);
  assert.equal((await request(`${app.origin}/api/ops/summary?from=../private`)).status, 400);
  assert.equal(fake.seen.length, 0);
});

test('aborts the upstream request when the local client disconnects', async () => {
  let closed = false;
  let release;
  const closedOnce = new Promise(resolve => { release = resolve; });
  const fake = await upstream((req) => { req.on('close', () => { closed = true; release(); }); });
  const app = await viewer(fake.origin, 5_000);
  const controller = new AbortController();
  const pending = fetch(`${app.origin}/api/ops/summary`, {signal: controller.signal}).catch(() => undefined);
  await new Promise(resolve => setTimeout(resolve, 30));
  controller.abort();
  await Promise.race([closedOnce, new Promise(resolve => setTimeout(resolve, 500))]);
  assert.equal(closed, true);
  await pending;
});

test('does not follow redirects or expose upstream errors, and bounds slow responses', async () => {
  const redirect = await upstream((_req, res) => { res.writeHead(302, {Location: 'https://evil.example'}); res.end(); });
  const redirectApp = await viewer(redirect.origin);
  assert.equal((await request(`${redirectApp.origin}/api/ops/summary`)).status, 502);

  const broken = await upstream((_req, res) => { res.writeHead(500, {'Content-Type': 'text/plain'}); res.end('private upstream detail'); });
  const brokenApp = await viewer(broken.origin);
  const failure = await request(`${brokenApp.origin}/api/ops/summary`);
  assert.equal(failure.status, 502);
  assert.equal(failure.body.includes('private upstream detail'), false);

  const slow = await upstream((_req, _res) => { /* never responds */ });
  const slowApp = await viewer(slow.origin, 40);
  assert.equal((await request(`${slowApp.origin}/api/ops/summary`)).status, 502);
});
