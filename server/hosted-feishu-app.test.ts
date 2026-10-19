// @vitest-environment node
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {HostedAlerts} from './hosted-alerts';
import {HostedBudget, initializeBudget, ALERT_DELAYS_MS, type BudgetAlert} from './hosted-budget';
import {HostedFeishuApp} from './hosted-feishu-app';

const options = {appId: 'cli_fixture', appSecret: 'fixture-secret', recipientOpenId: 'ou_fixture'};
const start = Date.parse('2026-10-19T04:00:00Z');
const cleanup: Array<() => unknown> = [];
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn(); vi.restoreAllMocks(); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status});
const token = () => json({code: 0, access_token: 'fixture-token', expires_in: 7200, token_type: 'Bearer'});
const message = () => json({code: 0, data: {message_id: 'om_fixture'}});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gotit-app-alert-')); cleanup.push(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, 'budget'); initializeBudget(path);
  const budget = new HostedBudget(path, .008, () => start); cleanup.push(() => budget.close());
  budget.reserve('private-reader', '192.0.2.44');
  return {budget, path, alert: budget.alerts()[0]};
}

describe('Feishu app alert transport', () => {
  it('uses fixed official tenant-token and IM endpoints, validates ACK, and keeps configuration out of disk/logs', async () => {
    const f = fixture(); const logs: unknown[] = []; vi.spyOn(console, 'info').mockImplementation(value => { logs.push(value); });
    const calls: Array<{url: string; init: RequestInit}> = [];
    const fetchImpl = vi.fn(async (url, init) => { calls.push({url: String(url), init: init!}); return calls.length === 1 ? token() : message(); }) as typeof fetch;
    const alerts = new HostedAlerts(f.budget, {...options, format: 'feishu-app-bot', fetchImpl, clock: () => start});
    expect(alerts.configured()).toBe(true); await alerts.pump(start);
    expect(calls.map(c => c.url)).toEqual(['https://accounts.feishu.cn/oauth/v3/token', 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id']);
    expect(calls.every(call => call.init.redirect === 'error')).toBe(true);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({grant_type: 'client_credentials', client_id: options.appId, client_secret: options.appSecret});
    const body = JSON.parse(String(calls[1].init.body));
    expect(body.receive_id).toBe(options.recipientOpenId); expect(body.msg_type).toBe('text');
    expect(JSON.parse(body.content).text).toContain(f.alert.id); expect(body.uuid).toMatch(/^[0-9a-f]{48}$/);
    expect(f.budget.alerts()[0]).toMatchObject({attempts: 1, status: 'delivered'});
    const safe = JSON.stringify({logs, summary: f.budget.summary(), ledger: readFileSync(f.path, 'utf8')});
    for (const forbidden of [options.appId, options.appSecret, options.recipientOpenId, 'fixture-token', 'om_fixture', 'private-reader', '192.0.2.44']) expect(safe).not.toContain(forbidden);
    expect(new HostedAlerts(f.budget, {...options, format: 'feishu-app-bot', url: 'https://example.test'}).configured()).toBe(false);
  });

  it.each([
    ['auth business error', () => json({code: 20002}), false],
    ['invalid token response', () => json({code: 0, access_token: 'fixture-token', expires_in: 7200}), false],
    ['auth redirect', () => json({}, 302), false],
    ['message permission error', () => json({code: 230035, msg: 'fixture'}), true],
    ['message success missing ID', () => json({code: 0, data: {}}), true],
    ['message unknown ACK', () => json({data: {message_id: 'om_fixture'}}), true],
    ['message redirect', () => json({code: 0, data: {message_id: 'om_fixture'}}, 302), true],
  ] as const)('keeps %s pending and consumes one durable attempt', async (_name, response, authOk) => {
    const f = fixture(); let calls = 0;
    const fetchImpl = vi.fn(async () => { calls++; return authOk && calls === 1 ? token() : response(); }) as typeof fetch;
    const alerts = new HostedAlerts(f.budget, {...options, format: 'feishu-app-bot', fetchImpl});
    await alerts.pump(start);
    expect(f.budget.alerts()[0]).toMatchObject({attempts: 1, status: 'pending'});
    expect(calls).toBe(authOk ? 2 : 1);
  });

  it('shares refresh concurrently, caches until early expiry, and uses stable UUID across restart and manual retry', async () => {
    const f = fixture(); let now = start; const messages: any[] = []; let authCalls = 0;
    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).includes('/oauth/')) { authCalls++; await Promise.resolve(); return token(); }
      messages.push(JSON.parse(String(init?.body))); return message();
    }) as typeof fetch;
    const app = new HostedFeishuApp({...options, clock: () => now, fetchImpl});
    await Promise.all([app.send(f.alert, 'safe', new AbortController().signal), app.send(f.alert, 'safe', new AbortController().signal)]);
    expect(authCalls).toBe(1); expect(messages[0].uuid).toBe(messages[1].uuid);
    now += 7_139_999; await app.send(f.alert, 'safe', new AbortController().signal); expect(authCalls).toBe(1);
    now += 1; await app.send(f.alert, 'safe', new AbortController().signal); expect(authCalls).toBe(2);
    const restarted = new HostedFeishuApp({...options, fetchImpl});
    await restarted.send(f.alert, 'safe', new AbortController().signal);
    expect(messages.at(-1).uuid).toBe(messages[0].uuid);
    await restarted.send({...f.alert, attempts: 0}, 'safe', new AbortController().signal);
    expect(messages.at(-1).uuid).toBe(messages[0].uuid);
    await restarted.send({...f.alert, createdAt: new Date(start + 1).toISOString()}, 'safe', new AbortController().signal);
    expect(messages.at(-1).uuid).not.toBe(messages[0].uuid);
  });

  it('invalidates rejected authentication, never bypasses the eight-attempt outbox, and permits no hidden message retry', async () => {
    const f = fixture(); let now = start; let authCalls = 0; let messageCalls = 0;
    const fetchImpl = vi.fn(async url => {
      if (String(url).includes('/oauth/')) {authCalls++; return token();}
      messageCalls++; return json({code: 99991663}, 401);
    }) as typeof fetch;
    const alerts = new HostedAlerts(f.budget, {...options, format: 'feishu-app-bot', fetchImpl, clock: () => now});
    for (const delay of ALERT_DELAYS_MS) {now = start + delay; await alerts.pump(now);}
    await alerts.pump(now + 60_000);
    expect(authCalls).toBe(8); expect(messageCalls).toBe(8);
    expect(f.budget.alerts()[0]).toMatchObject({attempts: 8, status: 'exhausted'});
  });

  it('bounds oversized ACKs and ends a waiting attempt without sending a message after late authentication', async () => {
    const f = fixture(); let release!: (response: Response) => void; let calls = 0;
    const fetchImpl = vi.fn(async () => {calls++; return new Promise<Response>(resolve => { release = resolve; });}) as typeof fetch;
    const alerts = new HostedAlerts(f.budget, {...options, format: 'feishu-app-bot', fetchImpl, timeoutMs: 10});
    await alerts.pump(start); expect(calls).toBe(1);
    expect(f.budget.alerts()[0]).toMatchObject({attempts: 1, status: 'pending'});
    release(token()); await new Promise(resolve => setTimeout(resolve, 5)); expect(calls).toBe(1);
    const tooBig = new HostedFeishuApp({...options, fetchImpl: async () => new Response('x'.repeat(20_000))});
    await expect(tooBig.send(f.alert, 'safe', new AbortController().signal)).rejects.toThrow();
  });
});
