// @vitest-environment node
import {createServer, request as httpRequest} from 'node:http';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {AddressInfo} from 'node:net';
import {afterEach, describe, expect, it} from 'vitest';
import {HostedAdmission} from './hosted-admission';
import {HostedBudget, initializeBudget} from './hosted-budget';
import {HostedHealth} from './hosted-health';
import {HostedStatistics, USAGE_COUNTS, USAGE_FUNNEL} from './hosted-statistics';
import {createHostedApp} from './hosted-api';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const token = 'ops-private-token';
const origin = 'https://gotit.example.test';

function request(url: string, {method = 'GET', headers = {}}: {method?: string; headers?: Record<string, string>} = {}) {
  const parsed = new URL(url);
  return new Promise<{status: number; body: string; headers: Record<string, string | string[] | undefined>}>((resolve, reject) => {
    const req = httpRequest({hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method, headers}, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), headers: response.headers}));
    });
    req.on('error', reject);
    req.end();
  });
}

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gotit-ops-api-'));
  cleanups.push(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, 'budget.json');
  initializeBudget(path);
  const budget = new HostedBudget(path);
  cleanups.push(() => budget.close());
  const now = Date.parse('2026-10-20T12:00:00.000Z');
  const stats = new HostedStatistics(join(dir, 'stats.json'), () => now);
  const counts = Object.fromEntries(USAGE_COUNTS.map(key => [key, key === 'answer_complete' ? 1 : 0]));
  const funnel = Object.fromEntries(USAGE_FUNNEL.map(key => [key, 1]));
  stats.acceptBatch({schemaVersion: 2, batchId: '12345678-1234-4123-8123-1234567890ab', createdAt: new Date(now).toISOString(), channel: 'direct', material: 'markdown', counts, reach: funnel, funnel, discarded: 0});
  let clock = now;
  const health = new HostedHealth({
    clock: () => clock,
    platform: 'linux',
    monitor: null,
    hostSampler: () => ({
      sample: {observedAt: clock, cpuPercent: 12.3, memoryAvailableBytes: 8 * 1024 ** 3, memoryTotalBytes: 16 * 1024 ** 3, diskAvailableBytes: 50 * 1024 ** 3, diskTotalBytes: 100 * 1024 ** 3, diskUsedPercent: 50},
      read: {cpuPercent: 12.3, cpuStatus: 'ok', memoryAvailableBytes: 8 * 1024 ** 3, memoryTotalBytes: 16 * 1024 ** 3, memoryStatus: 'ok', diskAvailableBytes: 50 * 1024 ** 3, diskTotalBytes: 100 * 1024 ** 3, diskUsedPercent: 50, diskStatus: 'ok', visibility: 'host-or-vm'},
      cpuRaw: {total: 1, idle: 1},
    }),
  });
  cleanups.push(() => health.close());
  const admission = new HostedAdmission({initialTokens: 'capacity'});
  const app = createHostedApp({origin, budget, statistics: stats, admission, health, opsToken: token});
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {url, stats, health, advance: (ms: number) => { clock += ms; }};
}

describe('private operations summary', () => {
  it('requires a loopback host, no proxy headers, and the exact token', async () => {
    const f = await fixture();
    expect((await request(`${f.url}/api/hosted/ops`)).status).toBe(404);
    expect((await request(`${f.url}/api/hosted/ops`, {headers: {'x-gotit-ops-token': 'wrong'}})).status).toBe(404);
    expect((await request(`${f.url}/api/hosted/ops`, {headers: {'x-gotit-ops-token': token, 'x-forwarded-for': '203.0.113.7'}})).status).toBe(404);
    expect((await request(`${f.url}/api/hosted/ops`, {headers: {'x-gotit-ops-token': token, host: 'gotit.example.test'}})).status).toBe(404);
    expect((await request(`${f.url}/api/hosted/ops`, {headers: {'x-gotit-ops-token': token}})).status).toBe(200);
  });

  it('returns versioned health, report scope, and no identity, content, token, or private paths', async () => {
    const f = await fixture();
    const response = await request(`${f.url}/api/hosted/ops?from=2026-10-14&to=2026-10-20&channel=direct&material=all`, {headers: {'x-gotit-ops-token': token}});
    expect(response.status).toBe(200);
    const text = response.body;
    for (const forbidden of [token, '12345678-1234-4123-8123-1234567890ab', '203.0.113', 'private.md', '/tmp/', 'ops-private']) expect(text).not.toContain(forbidden);
    const body = JSON.parse(text);
    expect(body).toMatchObject({schemaVersion: 1, admission: {slots: {limits: {global: 6, nonInquiry: 5, translation: 5, capture: 2}}}, statistics: {schemaVersion: 2, hasData: true, filters: {channel: 'direct', material: 'all'}}, health: {schemaVersion: 1, host: {status: {cpu: 'ok', memory: 'ok', disk: 'ok'}}}});
    expect(body.statistics.counts.answer_complete).toBe(1);
    expect(body.statistics.conversions).not.toBeNull();
    expect(body.health.process.latest).not.toBeNull();
    expect(body.health.host.latest).toMatchObject({cpuPercent: 12.3, memoryAvailableBytes: 8 * 1024 ** 3, diskAvailableBytes: 50 * 1024 ** 3});
  });

  it('keeps health readable when the statistics query is invalid or the statistics source fails', async () => {
    const f = await fixture();
    const invalid = await request(`${f.url}/api/hosted/ops?from=2026-01-01&to=2026-12-31`, {headers: {'x-gotit-ops-token': token}});
    expect(invalid.status).toBe(200);
    const body = JSON.parse(invalid.body);
    expect(body.statistics).toBeNull();
    expect(body.statisticsError).toMatchObject({code: expect.any(String)});
    expect(body.health.host.status.cpu).toBe('ok');
    const unavailable = await request(`${f.url}/api/hosted/ops?channel=newsletter`, {headers: {'x-gotit-ops-token': token}});
    expect(unavailable.status).toBe(200);
    expect(JSON.parse(unavailable.body).statisticsError).not.toBeNull();
    expect(JSON.parse(unavailable.body).health).not.toBeNull();
  });
});
