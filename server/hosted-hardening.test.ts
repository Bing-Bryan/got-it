import {randomUUID} from 'node:crypto';
const transportIds=new Map<string,string>();
function transportId(body:unknown){const key=JSON.stringify(body && typeof body==='object' ? [(body as any).operationId,(body as any).requestId] : body);let id=transportIds.get(key);if(!id){id=`${Date.now()}_${randomUUID()}`;transportIds.set(key,id);}return id;}
// @vitest-environment node
import {createServer} from 'node:http';
import {afterEach,describe,expect,it} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {AddressInfo} from 'node:net';
import {HostedAdmission} from './hosted-admission';
import {HostedAlerts} from './hosted-alerts';
import {HostedBudget,initializeBudget,MAX_REQUEST_USD} from './hosted-budget';
import {createHostedApp} from './hosted-api';
import {HostedStatistics,USAGE_COUNTS,USAGE_FUNNEL} from './hosted-statistics';
import {HostedTranslations,type HostedTranslationModel} from './hosted-translations';
import {HostedWebImports} from './hosted-web-imports';
import {HostedResourceTickets} from './hosted-resource-tickets';
import {WEB_URL} from './test-support/web-fixture';
import {TRANSLATION_QUALITY_VERSION} from '../src/lib/web-translation';

const origin = 'https://gotit.bingbryan.com';
const generation = '22222222-2222-4222-8222-222222222222';
const ids = ['12345678-1234-4123-8123-123456789012', '12345678-1234-4123-8123-123456789013', '12345678-1234-4123-8123-123456789014', '12345678-1234-4123-8123-123456789015'];
const token = 'a'.repeat(64);
const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });

function files() {
  const dir = mkdtempSync(join(tmpdir(), 'got-it-harden-'));
  cleanup.push(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, 'budget.json');
  initializeBudget(path);
  return {dir, path};
}

function translationBody(operationId: string, text = 'A useful phrase.') {
  return {qualityVersion: TRANSLATION_QUALITY_VERSION, operationId, roundId: 'round', translationId: 'translation', sourceVersion: 'f'.repeat(64), units: [{id: 'unit', blockId: 'block', text}]};
}

async function listen(app: ReturnType<typeof createHostedApp>) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  cleanup.push(() => new Promise(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function post(base: string, path: string, body: unknown, id = ids[0], extra: Record<string, string> = {}) {
  return fetch(base + path, {method: 'POST', headers: {origin, 'content-type': 'application/json', 'x-trial-id': id, 'x-hosted-generation': generation, 'x-hosted-operation-id':transportId(body), 'x-gotit-client-ip': '203.0.113.10', ...extra}, body: JSON.stringify(body)});
}

describe('expensive admission', () => {
  it('rejects a sixth non-inquiry at the reservation cap, before outbound, charge or daily count, while inquiry still enters', async () => {
    const f = files();
    const budget = new HostedBudget(f.path);
    cleanup.push(() => budget.close());
    let calls = 0;
    const model: HostedTranslationModel = () => { calls += 1; return new Promise(() => {}); };
    const translations = new HostedTranslations(budget, model);
    const imports = new HostedWebImports(new HostedResourceTickets(join(f.dir, 'state')), {extractor: () => { calls += 1; return new Promise(() => {}); }});
    const admission = new HostedAdmission({generation, trustedProxy: true, initialTokens: 'capacity'});
    const base = await listen(createHostedApp({origin, budget, admission, trustedProxy: true, translations, webImports: imports, runner: async () => ({response: {answer: 'entered', sources: [], evidenceStatus: 'not-applicable', mode: 'live', providerId: 'deepseek', providerName: '体验版默认模型', model: 'deepseek-flash'}})}));
    const held = [
      post(base, '/api/hosted/translation-batches', translationBody('batch-a'), ids[0], {'x-hosted-operation-token': token}),
      post(base, '/api/hosted/translation-batches', translationBody('batch-b'), ids[1], {'x-hosted-operation-token': token}),
      post(base, '/api/hosted/translation-batches', translationBody('batch-c'), ids[2], {'x-hosted-operation-token': token}),
    ];
    const firstImport = await post(base, '/api/hosted/web-imports', {url: WEB_URL, operationId: 'import-a'}, ids[3], {'x-hosted-operation-token': token});
    expect(firstImport.status).toBe(200);
    const fifth = '12345678-1234-4123-8123-123456789016';
    const secondImport = await post(base, '/api/hosted/web-imports', {url: WEB_URL, operationId: 'import-b'}, fifth, {'x-hosted-operation-token': token});
    expect(secondImport.status).toBe(200);
    for (let i = 0; i < 50 && admission.snapshot().slots.nonInquiry < 5; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
    expect(admission.snapshot().slots).toMatchObject({global: 5, nonInquiry: 5, translation: 3, capture: 2});
    const before = readFileSync(f.path, 'utf8');
    const denied = await post(base, '/api/hosted/translation-batches', translationBody('batch-six'), '12345678-1234-4123-8123-123456789017', {'x-hosted-operation-token': token});
    expect(denied.status).toBe(429);
    expect(denied.headers.get('retry-after')).toBeTruthy();
    expect((await denied.json()).code).toBe('busy');
    // Malformed near-limit JSON must be rejected by the slot preflight, before JSON parsing.
    const unparsed=await fetch(base+'/api/hosted/translation-batches',{method:'POST',headers:{origin,'content-type':'application/json','x-trial-id':'12345678-1234-4123-8123-123456789018','x-hosted-generation':generation,'x-hosted-operation-id':transportId('unparsed'),'x-gotit-client-ip':'203.0.113.10','x-hosted-operation-token':token},body:'!'.repeat(35000)});
    expect(unparsed.status).toBe(429);expect((await unparsed.json()).code).toBe('busy');
    expect(calls).toBe(5);
    for (const request of held) void request.catch(() => undefined);
    expect(readFileSync(f.path, 'utf8')).toBe(before);
    expect(budget.status('12345678-1234-4123-8123-123456789017', '203.0.113.10').remaining).toBe(30);
    const inquiry = await post(base, '/api/hosted/inquiry/stream', {requestId: 'ask-1', intent: 'ask', quote: 'A sample quotation.', context: 'Nearby.', question: 'What does it mean?', history: []}, '12345678-1234-4123-8123-123456789019');
    expect(inquiry.status).toBe(200);
    expect(await inquiry.text()).toContain('entered');
    expect(admission.snapshot().slots).toMatchObject({global: 5, nonInquiry: 5});
    expect(admission.snapshot().counts.busyByCategory.translation).toBe(2);
  });

  it('admits five different-ID translation batches and one inquiry together, then rejects the seventh request', async () => {
    const f = files();
    const budget = new HostedBudget(f.path);
    cleanup.push(() => budget.close());
    let calls = 0;
    const model: HostedTranslationModel = () => { calls += 1; return new Promise(() => {}); };
    const translations = new HostedTranslations(budget, model);
    const admission = new HostedAdmission({generation, trustedProxy: true, initialTokens: 'capacity'});
    let inquiryCalls = 0, releaseInquiry!: () => void;
    const inquiryPending = new Promise<{response: {answer: string; sources: []; evidenceStatus: 'not-applicable'; mode: 'live'; providerId: 'deepseek'; providerName: string; model: string}}>(resolve => { releaseInquiry = () => resolve({response: {answer: 'entered', sources: [], evidenceStatus: 'not-applicable', mode: 'live', providerId: 'deepseek', providerName: '体验版默认模型', model: 'deepseek-flash'}}); });
    const base = await listen(createHostedApp({origin, budget, admission, trustedProxy: true, translations, runner: async () => { inquiryCalls += 1; return inquiryPending; }}));
    const idsFive = [ids[0], ids[1], ids[2], ids[3], '12345678-1234-4123-8123-123456789016'];
    const held = idsFive.map((id, index) => post(base, '/api/hosted/translation-batches', translationBody('batch-' + index, 'Phrase ' + index), id, {'x-hosted-operation-token': token}));
    for (let i = 0; i < 50 && admission.snapshot().slots.translation < 5; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
    expect(admission.snapshot().slots).toMatchObject({global: 5, nonInquiry: 5, translation: 5, inquiry: 0});
    const inquiry = await post(base, '/api/hosted/inquiry/stream', {requestId: 'ask-five-plus-one', intent: 'ask', quote: 'A sample quotation.', context: 'Nearby.', question: 'What does it mean?', history: []}, '12345678-1234-4123-8123-123456789017');
    for (let i = 0; i < 50 && admission.snapshot().slots.global < 6; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
    expect(admission.snapshot().slots).toMatchObject({global: 6, nonInquiry: 5, inquiry: 1});
    expect(inquiryCalls).toBe(1);
    expect(calls).toBe(5);
    const seventh = await post(base, '/api/hosted/inquiry/stream', {requestId: 'ask-seven', intent: 'ask', quote: 'A sample quotation.', context: 'Nearby.', question: 'What?', history: []}, '12345678-1234-4123-8123-123456789018');
    expect(seventh.status).toBe(429); expect((await seventh.json()).code).toBe('busy');
    releaseInquiry();
    expect(inquiry.status).toBe(200); expect(await inquiry.text()).toContain('entered');
    for (let i = 0; i < 50 && admission.snapshot().slots.global < 5; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
    expect(admission.snapshot().slots).toMatchObject({global: 5, nonInquiry: 5, inquiry: 0, translation: 5});
    for (const request of held) void request.catch(() => undefined);
  });

  it('does not treat six admission slots as a fee guarantee when the worst-case reservation is unaffordable', async () => {
    const f = files();
    const budget = new HostedBudget(f.path, MAX_REQUEST_USD + .00001);
    cleanup.push(() => budget.close());
    let calls = 0, release!: () => void;
    const pending = new Promise<{response: {answer: string; sources: []; evidenceStatus: 'not-applicable'; mode: 'live'; providerId: 'deepseek'; providerName: string; model: string}}>(resolve => { release = () => resolve({response: {answer: 'paid', sources: [], evidenceStatus: 'not-applicable', mode: 'live', providerId: 'deepseek', providerName: '体验版默认模型', model: 'deepseek-flash'}}); });
    const admission = new HostedAdmission({generation, trustedProxy: true, initialTokens: 'capacity'});
    const base = await listen(createHostedApp({origin, budget, admission, trustedProxy: true, runner: async () => { calls += 1; return pending; }}));
    const idsSix = [ids[0], ids[1], ids[2], ids[3], '12345678-1234-4123-8123-123456789016', '12345678-1234-4123-8123-123456789017'];
    const first = await post(base, '/api/hosted/inquiry/stream', {requestId: 'paid-one', intent: 'ask', quote: 'A sample quotation.', context: 'Nearby.', question: 'What?', history: []}, idsSix[0]);
    expect(first.status).toBe(200);
    for (let i = 0; i < 50 && admission.snapshot().slots.global < 1; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
    for (let index = 1; index < idsSix.length; index += 1) {
      const denied = await post(base, '/api/hosted/inquiry/stream', {requestId: 'paid-' + index, intent: 'ask', quote: 'A sample quotation.', context: 'Nearby.', question: 'What?', history: []}, idsSix[index]);
      expect(denied.status).toBe(429);
      expect((await denied.json()).code).toBe('global_quota_exhausted');
    }
    expect(calls).toBe(1);
    expect(admission.snapshot().slots).toMatchObject({global: 1, nonInquiry: 0, inquiry: 1});
    const ledger = JSON.parse(readFileSync(f.path, 'utf8')).days;
    const day = Object.values(ledger as Record<string, {confirmed: number; reserved: number; blocked?: boolean}>)[0];
    expect(day.confirmed + day.reserved).toBeCloseTo(MAX_REQUEST_USD, 6);
    expect(day.confirmed + day.reserved).toBeLessThanOrEqual(MAX_REQUEST_USD + .00001);
    release();
    await first.text();
    for (let i = 0; i < 50 && admission.snapshot().slots.global > 0; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
    expect(admission.snapshot().slots.global).toBe(0);
  });

  it('keeps the slot until an abort-ignoring adapter settles and discards the late result', async () => {
    const f = files();
    const budget = new HostedBudget(f.path, MAX_REQUEST_USD + .00001);
    cleanup.push(() => budget.close());
    let release!: () => void;
    const pending = new Promise<{response: {answer: string; sources: []; evidenceStatus: 'not-applicable'; mode: 'live'; providerId: 'deepseek'; providerName: string; model: string}}>(resolve => { release = () => resolve({response: {answer: 'late', sources: [], evidenceStatus: 'not-applicable', mode: 'live', providerId: 'deepseek', providerName: '体验版默认模型', model: 'deepseek-flash'}}); });
    const admission = new HostedAdmission({generation, trustedProxy: true, initialTokens: 'capacity'});
    const base = await listen(createHostedApp({origin, budget, admission, trustedProxy: true, runner: async () => pending}));
    const controller = new AbortController();
    const first = await fetch(base + '/api/hosted/inquiry/stream', {method: 'POST', headers: {origin, 'content-type': 'application/json', 'x-trial-id': ids[0], 'x-hosted-generation': generation, 'x-hosted-operation-id':transportId('ask-late'), 'x-gotit-client-ip': '203.0.113.10'}, body: JSON.stringify({requestId: 'ask-late', intent: 'ask', quote: 'A sample quotation.', context: 'Nearby.', question: 'What?', history: []}), signal: controller.signal});
    await first.body!.getReader().read();
    controller.abort();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(admission.snapshot().slots.global).toBe(1);
    const again = await post(base, '/api/hosted/inquiry/stream', {requestId: 'ask-next', intent: 'ask', quote: 'A sample quotation.', context: 'Nearby.', question: 'What?', history: []});
    expect(again.status).toBe(429);
    expect((await again.json()).code).toBe('busy');
    release();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(admission.snapshot().slots.global).toBe(0);
    expect(budget.status(ids[1], 'other').globalExhausted).toBe(true);
  });

  it('holds the translation slot after stop until the adapter settles, rejects the next batch, then recovers', async () => {
    const f = files();
    const budget = new HostedBudget(f.path);
    cleanup.push(() => budget.close());
    let calls = 0, releaseLate!: () => void;
    const late = new Promise<{data: {translations: Record<string, string>}; usage: {prompt_tokens: number; completion_tokens: number}}>(resolve => { releaseLate = () => resolve({data: {translations: {unit: '迟到的译文'}}, usage: {prompt_tokens: 10, completion_tokens: 5}}); });
    const model: HostedTranslationModel = async () => {
      calls += 1;
      if (calls === 1) return late;
      return {data: {translations: {unit: '恢复后的译文'}}, usage: {prompt_tokens: 10, completion_tokens: 5}};
    };
    const translations = new HostedTranslations(budget, model);
    const admission = new HostedAdmission({generation, trustedProxy: true, initialTokens: 'capacity'});
    const base = await listen(createHostedApp({origin, budget, admission, trustedProxy: true, translations}));
    const first = post(base, '/api/hosted/translation-batches', translationBody('cancel-me'), ids[0], {'x-hosted-operation-token': token});
    for (let i = 0; i < 50 && admission.snapshot().slots.global < 1; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
    expect(admission.snapshot().slots).toMatchObject({global: 1, translation: 1});
    const cancel = await fetch(base + '/api/hosted/translation-batches/cancel-me/cancel', {method: 'POST', headers: {origin, 'content-type': 'application/json', 'x-trial-id': ids[0], 'x-hosted-operation-token': token}, body: '{}'});
    expect(cancel.status).toBe(200);
    const stopped = await first;
    expect(stopped.status).toBe(408);
    expect(admission.snapshot().slots).toMatchObject({global: 1, translation: 1});
    const next = await post(base, '/api/hosted/translation-batches', translationBody('next-after-stop', 'Next phrase.'), ids[0], {'x-hosted-operation-token': token});
    expect(next.status).toBe(429);
    expect((await next.json()).code).toBe('busy');
    expect(calls).toBe(1);
    releaseLate();
    for (let i = 0; i < 50 && admission.snapshot().slots.global > 0; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
    expect(admission.snapshot().slots.global).toBe(0);
    const recovered = await post(base, '/api/hosted/translation-batches', translationBody('after-settled', 'Recovered phrase.'), ids[0], {'x-hosted-operation-token': token});
    expect(recovered.status).toBe(200);
    expect((await recovered.json()).units.unit).toBe('恢复后的译文');
    expect(calls).toBe(2);
    expect(admission.snapshot().slots.global).toBe(0);
    expect(admission.snapshot().counts.acceptedByCategory.translation).toBe(2);
  });

  it('does not let a forged forwarding header change the trusted IP, and keeps cancel available when the expensive window is full', async () => {
    let now = Date.now();
    const admission = new HostedAdmission({generation, trustedProxy: true, clock: () => now});
    const f = files();
    const budget = new HostedBudget(f.path);
    cleanup.push(() => budget.close());
    const base = await listen(createHostedApp({origin, budget, admission, trustedProxy: true, translations: new HostedTranslations(budget, async () => ({data: {translations: {unit: '译文'}}, usage: {prompt_tokens: 1, completion_tokens: 1}}))}));
    const first = await post(base, '/api/hosted/translation-batches', translationBody('batch-1'), ids[0], {'x-hosted-operation-token': token, 'x-forwarded-for': '198.51.100.8'});
    expect(first.status).toBe(200);
    const forged = await post(base, '/api/hosted/translation-batches', translationBody('batch-2'), ids[0], {'x-hosted-operation-token': token, 'x-forwarded-for': '198.51.100.9', 'x-gotit-client-ip': '203.0.113.10'});
    expect(forged.status).toBe(429);
    expect((await forged.json()).code).toBe('rate_limited');
    const missing = await fetch(base + '/api/hosted/translation-batches', {method: 'POST', headers: {origin, 'content-type': 'application/json', 'x-trial-id': ids[1], 'x-hosted-generation': generation, 'x-hosted-operation-id':transportId('missing'), 'x-forwarded-for': '203.0.113.50'}, body: JSON.stringify(translationBody('batch-3'))});
    expect(missing.status).toBe(403);
    const cancel = await fetch(base + '/api/hosted/translation-batches/batch-1/cancel', {method: 'POST', headers: {origin, 'content-type': 'application/json', 'x-trial-id': ids[0], 'x-hosted-operation-token': token}, body: '{}'});
    expect(cancel.status).toBe(200);
    now += 61_000;
    const after = await post(base, '/api/hosted/translation-batches', translationBody('batch-4'), ids[0], {'x-hosted-operation-token': token});
    expect(after.status).toBe(200);
  });

  it('lets five serial translation batches share one ID window token', async () => {
    let now = Date.now();
    const admission = new HostedAdmission({generation, trustedProxy: true, clock: () => now});
    const f = files();
    const budget = new HostedBudget(f.path);
    cleanup.push(() => budget.close());
    const base = await listen(createHostedApp({origin, budget, admission, trustedProxy: true, translations: new HostedTranslations(budget, async () => ({data: {translations: {unit: '连续译文'}}, usage: {prompt_tokens: 1, completion_tokens: 1}}))}));
    let round = '';
    const first = await post(base, '/api/hosted/translation-batches', translationBody('batch-1', 'Phrase 1'), ids[0], {'x-hosted-operation-token': token});
    expect(first.status).toBe(200);
    round = first.headers.get('x-hosted-round-token') || '';
    now += 6_100;
    const forged = await post(base, '/api/hosted/translation-batches', translationBody('batch-forged'), ids[0], {'x-hosted-operation-token': token, 'x-hosted-round-token': 'b'.repeat(64)});
    expect(forged.status).toBe(429);
    expect((await forged.json()).code).toBe('rate_limited');
    for (let batch = 2; batch <= 5; batch += 1) {
      const response = await post(base, '/api/hosted/translation-batches', translationBody('batch-' + batch, 'Phrase ' + batch), ids[0], {'x-hosted-operation-token': token, 'x-hosted-round-token': round});
      expect(response.status, await response.clone().text()).toBe(200);
      now += 6_100;
    }
    expect(round).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('operation generation and tombstones', () => {
  it('rejects a page without a generation and an expired operation without charging', async () => {
    let now = Date.now();
    const admission = new HostedAdmission({generation, trustedProxy: true, clock: () => now});
    const f = files();
    const budget = new HostedBudget(f.path, MAX_REQUEST_USD + .00001);
    cleanup.push(() => budget.close());
    let calls = 0;
    const base = await listen(createHostedApp({origin, budget, admission, trustedProxy: true, runner: async () => { calls += 1; return {response: {answer: 'ok', sources: [], evidenceStatus: 'not-applicable', mode: 'live', providerId: 'deepseek', providerName: '体验版默认模型', model: 'deepseek-flash'}}; }}));
    const body = {requestId: 'old-op', intent: 'ask', quote: 'A sample quotation.', context: 'Nearby.', question: 'What?', history: []};
    const old = await fetch(base + '/api/hosted/inquiry/stream', {method: 'POST', headers: {origin, 'content-type': 'application/json', 'x-trial-id': ids[0], 'x-gotit-client-ip': '203.0.113.10'}, body: JSON.stringify(body)});
    expect(old.status).toBe(409);
    expect((await old.json()).code).toBe('upgrade_required');
    const stale = await post(base, '/api/hosted/inquiry/stream', body, ids[0], {'x-hosted-generation': '33333333-3333-4333-8333-333333333333'});
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe('operation_stale');
    expect((await post(base, '/api/hosted/inquiry/stream', body)).status).toBe(200);
    now += 11 * 60_000;
    const expired = await post(base, '/api/hosted/inquiry/stream', {...body, question: 'Again?'});
    expect(expired.status).toBe(409);
    expect((await expired.json()).code).toBe('operation_expired');
    expect(calls).toBe(1);
    expect(budget.status(ids[1], 'fresh').remaining).toBe(30);
  });
});

describe('budget ledger and alerts', () => {
  it('migrates old charged as unconfirmed occupancy and does not lower it', () => {
    const f = files();
    writeFileSync(f.path, JSON.stringify({version: 1, days: {'2026-10-19': {charged: 2.9999}}}));
    const budget = new HostedBudget(f.path, 3, () => Date.UTC(2026, 9, 19, 3));
    cleanup.push(() => budget.close());
    const saved = JSON.parse(readFileSync(f.path, 'utf8'));
    expect(saved.version).toBe(2);
    expect(saved.days['2026-10-19']).toMatchObject({confirmed: 0, reserved: 2.9999});
    expect(() => budget.reserve('person', 'ip', 0, {input: 100, output: 100})).toThrow('今日体验额度已用完');
    expect(JSON.parse(readFileSync(f.path, 'utf8')).days['2026-10-19'].reserved).toBe(2.9999);
  });

  it('creates each threshold once, keeps a cheaper request possible, and retries one webhook id', async () => {
    const f = files();
    let now = Date.UTC(2026, 9, 19, 4);
    const budget = new HostedBudget(f.path, .01, () => now);
    cleanup.push(() => budget.close());
    const received: unknown[] = [];
    let fail = true;
    const webhook = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => { received.push(JSON.parse(Buffer.concat(chunks).toString())); if (fail) res.writeHead(504).end('no'); else res.writeHead(204).end(); });
    });
    await new Promise<void>(resolve => webhook.listen(0, '127.0.0.1', resolve));
    cleanup.push(() => new Promise(resolve => webhook.close(() => resolve())));
    const alerts = new HostedAlerts(budget, {url: `http://127.0.0.1:${(webhook.address() as AddressInfo).port}/hook`, authorization: 'Bearer secret-token', clock: () => now, timeoutMs: 200});
    budget.reserve('person', 'ip', 0, {input: 20000, output: 100})();
    budget.reserve('person', 'ip', 0, {input: 6000, output: 100})();
    await alerts.pump(now);
    expect(budget.alerts().map(alert => alert.threshold).sort()).toEqual([50, 80]);
    const first = budget.alerts()[0];
    now += 60_000;
    await alerts.pump(now);
    expect(budget.alerts().filter(alert => alert.threshold === 50 || alert.threshold === 80).length).toBeGreaterThan(0);
    expect(new Set(budget.alerts().map(alert => alert.id)).size).toBe(budget.alerts().length);
    fail = false;
    budget.retryAlert(first.id);
    await new Promise(resolve => setTimeout(resolve, 30));
    await alerts.pump(now);
    expect(budget.alerts().find(alert => alert.id === first.id)?.status).toBe('delivered');
    expect(JSON.stringify(received)).not.toContain('secret-token');
    expect(JSON.stringify(received)).not.toContain('person');
    const cheap = budget.reserve('other', 'ip', 0, {input: 10, output: 10});
    cheap({prompt_tokens: 1, completion_tokens: 1});
    expect(budget.alerts().filter(alert => alert.threshold === 50)).toHaveLength(1);
  });
});

describe('statistics v2', () => {
  it('counts a batch once, rejects extra fields, and refuses an expired replay', () => {
    const f = files();
    let now = Date.UTC(2026, 9, 19, 5);
    const stats = new HostedStatistics(join(f.dir, 'stats.json'), () => now);
    const counts = Object.fromEntries(USAGE_COUNTS.map(key => [key, key === 'answer_complete' ? 1 : 0]));
    const stages = Object.fromEntries(USAGE_FUNNEL.map(key => [key, key === 'visit_started' ? 1 : 0]));
    const batch = {schemaVersion: 2, batchId: '12345678-1234-4123-8123-1234567890ab', createdAt: new Date(now).toISOString(), channel: 'xiaohongshu', material: 'markdown', counts, reach: stages, funnel: stages, discarded: 0};
    expect(stats.acceptBatch(batch).duplicate).toBe(false);
    expect(stats.acceptBatch(batch).duplicate).toBe(true);
    expect(stats.summary().v2['2026-10-19']['xiaohongshu:markdown:answer_complete']).toBe(1);
    expect(() => stats.acceptBatch({...batch, filename: 'private.md'})).toThrow('格式无效');
    now += 49 * 60 * 60 * 1000;
    expect(() => stats.acceptBatch({...batch, batchId: '12345678-1234-4123-8123-1234567890ac'})).toThrow(/过期/);
    expect(readFileSync(join(f.dir, 'stats.json.v2'), 'utf8')).not.toContain(batch.batchId);
  });
});

it('recovers tombstone capacity while rejecting the original expired transport id',()=>{
 let now=Date.now();const admission=new HostedAdmission({clock:()=>now});const original=`${now}_11111111-1111-4111-8111-111111111111`;
 expect(admission.validateTransportId(original)).toBe(original);
 admission.beginOperation('active-check','hash','inquiry');expect(()=>admission.beginOperation('active-check','hash','inquiry')).toThrow('相同操作');expect(()=>admission.beginOperation('active-check','different','inquiry')).toThrow('其他内容');admission.abandonOperation('active-check');
 for(let n=0;n<1024;n++){admission.beginOperation(`owner:${now}_${n}`,'hash','inquiry');admission.finishOperation(`owner:${now}_${n}`,'hash','inquiry');}
 expect(()=>admission.beginOperation('new','hash','inquiry')).toThrow('操作记录已满');now+=600001;
 expect(()=>admission.validateTransportId(original)).toThrow('操作已过期');
 admission.beginOperation('fresh','hash','inquiry');expect(admission.snapshot().tombstones).toBe(0);
});

it('starts expensive buckets with one token, refills without a fixed outage and bounds identity keys',()=>{
 let now=Date.now();const cold=new HostedAdmission({clock:()=>now});cold.takeExpensive('a','ip');expect(()=>cold.takeExpensive('b','ip2')).toThrow('频繁');now+=2000;expect(()=>cold.takeExpensive('b','ip2')).not.toThrow();
 const bounded=new HostedAdmission({initialTokens:'capacity',clock:()=>now});
 for(let n=0;n<10000;n++){try{bounded.takeExpensive('identity-'+n,'one-shared-ip');}catch{/* expected throttle; allocations still remain bounded */}}
 expect(bounded.snapshot().rateKeys.expensiveId).toBe(10000);expect(()=>bounded.takeExpensive('one-more','one-shared-ip')).toThrow('短时请求过多');expect(bounded.snapshot().rateKeys.expensiveId).toBe(10000);
 now+=61000;expect(()=>bounded.takeExpensive('after-window','new-ip')).not.toThrow();expect(bounded.snapshot().rateKeys.expensiveId).toBe(1);
});
