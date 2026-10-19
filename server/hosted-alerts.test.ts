// @vitest-environment node
import {createHmac} from 'node:crypto';
import {createServer, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {mkdtempSync, readFileSync, writeFileSync, rmSync, renameSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {HostedBudget, initializeBudget, ALERT_DELAYS_MS, ALERT_RETAIN_MS} from './hosted-budget';
import {HostedAlerts} from './hosted-alerts';
import {createHostedApp} from './hosted-api';

const cleanup: Array<() => unknown> = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); vi.restoreAllMocks(); });
const day = '2026-10-19';
const start = Date.parse(`${day}T04:00:00Z`);
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gotit-alerts-'));
  cleanup.push(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, 'budget.json'); initializeBudget(path);
  return {dir, path};
}
async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const reserve = (budget: HostedBudget) => budget.reserve('private-reader', '192.0.2.44', 0, {input: 30000, output: 100});

describe('durable alert dispatch', () => {
  it('persists all crossed thresholds and cost before invoking even a synchronous dispatcher', () => {
    const f = fixture(); const budget = new HostedBudget(f.path, .01, () => start); cleanup.push(() => budget.close());
    const observed: unknown[] = [];
    budget.bindAlerts(() => {
      observed.push(JSON.parse(readFileSync(f.path, 'utf8')));
      // A callback failure is not a failed reservation: the fee is already durable.
      throw new Error('dispatcher unavailable');
    });
    reserve(budget)();
    expect(observed).toHaveLength(2);
    for (const saved of observed as any[]) {
      expect(saved.alerts.map((a: any) => a.threshold)).toEqual([50, 80]);
      expect(saved.days[day].reserved).toBeCloseTo(.00912);
    }
    expect(budget.status('private-reader', '192.0.2.44').remaining).toBe(29);
  });

  it('uses a real loopback HTTP receiver for timeout, ACK loss, restart and exactly eight consumed attempts', async () => {
    const f = fixture(); let now = start; let received = 0;
    const requests: any[] = []; const logs: unknown[] = [];
    vi.spyOn(console, 'info').mockImplementation(value => { logs.push(value); });
    const url = await listen(createServer((req, res) => {
      let body = ''; req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        requests.push(JSON.parse(body)); received++;
        if (received % 2 === 0) req.socket.destroy(); // Accepted body, lost ACK.
        else { /* Receiver accepts the event but never sends headers: bounded timeout. */ }
      });
    }));
    let budget = new HostedBudget(f.path, .01, () => now);
    // Create one event via an unaffordable request (no model/network work).
    expect(() => budget.reserve('private-reader', '192.0.2.44', .01)).toThrow();
    const id = budget.alerts()[0].id;
    for (let attempt = 0; attempt < 8; attempt++) {
      const alerts = new HostedAlerts(budget, {url, authorization: 'Bearer local-test-credential', clock: () => now, timeoutMs: 25});
      now = start + ALERT_DELAYS_MS[attempt];
      await alerts.pump(now);
      expect(budget.alerts()[0].attempts).toBe(attempt + 1);
      budget.close();
      budget = new HostedBudget(f.path, .01, () => now);
      expect(budget.alerts()[0].id).toBe(id);
    }
    cleanup.push(() => budget.close());
    expect(received).toBe(8);
    expect(budget.alerts()[0]).toMatchObject({status: 'exhausted', attempts: 8});
    await new HostedAlerts(budget, {url, clock: () => now}).pump(now + 86_400_000);
    expect(received).toBe(8);
    expect(new Set(requests.map(item => item.eventId))).toEqual(new Set([id]));
    const safe = JSON.stringify({requests, logs, ledger: JSON.parse(readFileSync(f.path, 'utf8'))});
    for (const forbidden of ['local-test-credential', 'private-reader', '192.0.2.44', url]) expect(safe).not.toContain(forbidden);
    expect(Object.keys(requests[0]).sort()).toEqual(['budget', 'confirmed', 'date', 'eventId', 'reason', 'reserved', 'threshold']);
  });

  it('durably consumes a crash-before-ACK attempt and refuses concurrent manual retry', async () => {
    const f = fixture(); let budget = new HostedBudget(f.path, .01, () => start);
    expect(() => budget.reserve('reader', 'ip', .01)).toThrow();
    const id = budget.alerts()[0].id;
    budget.beginAlertAttempt(id, start);
    expect(() => budget.retryAlert(id)).toThrow('告警正在发送');
    budget.close(); // Simulated process death between persisted attempt and ACK.
    budget = new HostedBudget(f.path, .01, () => start);
    cleanup.push(() => budget.close());
    const send = vi.fn(async () => new Response(null, {status: 204}));
    const alerts = new HostedAlerts(budget, {url: 'http://127.0.0.1/hook', fetchImpl: send});
    await alerts.pump(start); expect(send).not.toHaveBeenCalled();
    await alerts.pump(start + 60_000);
    expect(budget.alerts()[0]).toMatchObject({id, attempts: 2, status: 'delivered'});
  });

  it('does not send on pre-send disk failure and handles unconfigured background failure', async () => {
    const f = fixture(); const budget = new HostedBudget(f.path, .01, () => start); cleanup.push(() => budget.close());
    expect(() => budget.reserve('reader', 'ip', .01)).toThrow();
    const fetchImpl = vi.fn();
    const alerts = new HostedAlerts(budget, {url: 'http://127.0.0.1/hook', fetchImpl});
    renameSync(f.path, `${f.path}.backup`); mkdirSync(f.path);
    await alerts.pump(start); expect(fetchImpl).not.toHaveBeenCalled();
    expect(budget.summary().blocked).toBe(true);
    const absent = new HostedAlerts(budget); absent.start();
    await new Promise(resolve => setTimeout(resolve, 20)); absent.stop();
  });

  it('requires Feishu business ACK and sends the official envelope and optional signature', async () => {
    const f = fixture(); let now = start; const bodies: any[] = []; let code = 19021;
    const url = await listen(createServer((req, res) => {
      let body = ''; req.on('data', chunk => { body += chunk; });
      req.on('end', () => { bodies.push(JSON.parse(body)); res.writeHead(200, {'Content-Type': 'application/json'}).end(JSON.stringify({code, msg: 'safe local mock'})); });
    }));
    const budget = new HostedBudget(f.path, .01, () => now); cleanup.push(() => budget.close());
    expect(() => budget.reserve('reader', 'ip', .01)).toThrow();
    const alerts = new HostedAlerts(budget, {url, format: 'feishu', signingSecret: 'local-signature-test', clock: () => now});
    await alerts.pump(now);
    expect(budget.alerts()[0]).toMatchObject({status: 'pending', attempts: 1});
    expect(bodies[0].msg_type).toBe('text');
    expect(bodies[0].content.text).toContain(budget.alerts()[0].id);
    expect(bodies[0].sign).toBe(createHmac('sha256', `${Math.floor(now / 1000)}\nlocal-signature-test`).update('').digest('base64'));
    expect(JSON.stringify(bodies)).not.toContain('local-signature-test');
    code = 0; now += 60_000; await alerts.pump(now);
    expect(budget.alerts()[0]).toMatchObject({status: 'delivered', attempts: 2});
    expect(new HostedAlerts(budget, {url, format: 'unsupported'}).configured()).toBe(false);
  });

  it('retries the original unconfigured event when configuration appears and prunes persisted events after 14 days', async () => {
    const f = fixture(); let now = start; const budget = new HostedBudget(f.path, .01, () => now); cleanup.push(() => budget.close());
    const alerts = new HostedAlerts(budget);
    expect(() => budget.reserve('reader', 'ip', .01)).toThrow();
    await alerts.pump(); const id = budget.alerts()[0].id;
    expect(budget.alerts()[0].status).toBe('unconfigured');
    const send = vi.fn(async () => new Response(null, {status: 204}));
    await new HostedAlerts(budget, {url: 'http://127.0.0.1/hook', fetchImpl: send}).pump(now);
    expect(budget.alerts()[0]).toMatchObject({id, status: 'delivered'});
    now += ALERT_RETAIN_MS + 1;
    expect(budget.alerts()).toEqual([]);
    expect(JSON.parse(readFileSync(f.path, 'utf8')).alerts).toEqual([]);
  });

  it('keeps operations output authenticated and free of receiver credentials and reading content', async () => {
    const f = fixture(); const budget = new HostedBudget(f.path, .01, () => start); cleanup.push(() => budget.close());
    const alerts = new HostedAlerts(budget, {url: 'http://127.0.0.1/private-endpoint', authorization: 'Bearer receiver-private', signingSecret: 'signature-private', format: 'feishu'});
    // Do not trigger the configured dispatcher; inject fee via a separate budget, then reopen.
    budget.bindAlerts(() => {});
    expect(() => budget.reserve('reader-private', '192.0.2.44', .01)).toThrow();
    const app = createHostedApp({origin: 'https://example.test', budget, alerts, opsToken: 'ops-private'});
    const url = await listen(createServer(app));
    expect((await fetch(`${url}/api/hosted/ops`)).status).toBe(404);
    const response = await fetch(`${url}/api/hosted/ops`, {headers: {'x-gotit-ops-token': 'ops-private'}});
    expect(response.status).toBe(200); const body = await response.text();
    for (const forbidden of ['private-endpoint', 'receiver-private', 'signature-private', 'ops-private', 'reader-private', '192.0.2.44']) expect(body).not.toContain(forbidden);
    expect(JSON.parse(body).budget.scope).toBe('model-and-search-only');
  });
});
