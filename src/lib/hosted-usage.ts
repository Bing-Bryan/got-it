import {HOSTED} from './runtime-mode';
import {FEATURE_KEYS} from './hosted-feature-keys';
import {IMPORT_OPERATION_MAX, type ImportOperation} from './web-import-observability';
export {FEATURE_KEYS} from './hosted-feature-keys';
export type FeatureKey = typeof FEATURE_KEYS[number];

export const USAGE_CHANNELS = ['direct', 'xiaohongshu', 'x', 'wechat', 'other'] as const;
export const USAGE_MATERIALS = ['sample', 'markdown', 'pdf', 'web', 'x', 'none'] as const;
export const USAGE_COUNTS = ['import_started', 'import_success', 'import_existing', 'import_failed', 'import_cancelled', 'translation_started', 'translation_batch_success', 'translation_complete', 'translation_partial', 'translation_failed', 'translation_cancelled', 'answer_complete', 'result_saved', 'bookmark_saved'] as const;
export const USAGE_FUNNEL = ['visit_started', 'material_opened', 'ai_started', 'ai_completed', 'result_saved'] as const;
export type UsageChannel = typeof USAGE_CHANNELS[number];
export type UsageMaterial = typeof USAGE_MATERIALS[number];
export type UsageCount = typeof USAGE_COUNTS[number];
export type UsageStage = typeof USAGE_FUNNEL[number];
type Counts = Record<UsageCount, number>;
type Stages = Record<UsageStage, 0 | 1>;
type Batch = {id: string; createdAt: string; channel: UsageChannel; material: UsageMaterial; counts: Counts; reach: Stages; funnel: Stages; importOperations: ImportOperation[]; discarded: number; delivery?: {attempts:number;nextAt:number}};
type Visit = {id: string; tab: string; channel: UsageChannel; day: string; last: number; material: UsageMaterial; reach: Record<UsageStage, boolean>; funnel: Record<UsageStage, boolean>; ai?: string; completedAi?: string};
type Preference = {enabled: boolean; first?: string; days?: Record<string, {sent?: boolean; counts?: Record<string, number>; sources?: string[]}>};

const PREFERENCE = 'got-it.usage.v1';
const VISIT = 'got-it.usage.visit.v2';
const DB = 'got-it-usage';
const STORE = 'batches';
const MAX_BATCHES = 100;
const MAX_BYTES = 256 * 1024;
const IDLE_MS = 30 * 60 * 1000;
const RETAIN_MS = 48 * 60 * 60 * 1000;
const emptyCounts = (): Counts => Object.fromEntries(USAGE_COUNTS.map(key => [key, 0])) as Counts;
const emptyStages = (): Stages => Object.fromEntries(USAGE_FUNNEL.map(key => [key, 0])) as Stages;
const today = () => new Date().toISOString().slice(0, 10);
const preference = (): Preference => { try { const value = JSON.parse(localStorage.getItem(PREFERENCE) ?? 'null'); if (value && typeof value.enabled === 'boolean') return value; } catch { /* unreadable preference stays enabled */ } return {enabled: true}; };
const writePreference = (value: Preference) => { try { localStorage.setItem(PREFERENCE, JSON.stringify({enabled: value.enabled, first: value.first, days: value.days})); } catch { setDegraded(true); } };

let degraded = false;
function setDegraded(value: boolean) { if (degraded === value) return; degraded = value; if (typeof window !== 'undefined') window.dispatchEvent(new Event('got-it-usage-status')); }
let visit: Visit | undefined;
let pending = new Map<string, Batch>();
const accumulating = new Map<string, string>();
const REPORTED_OPERATION_MAX = 1000;
const reportedImportOperations = new Set<string>();
const reportedOperationOrder: string[] = [];
function rememberReportedOperation(id: string) {
  if (reportedImportOperations.has(id)) return false;
  reportedImportOperations.add(id);
  reportedOperationOrder.push(id);
  while (reportedOperationOrder.length > REPORTED_OPERATION_MAX) {
    const oldest = reportedOperationOrder.shift();
    if (oldest) reportedImportOperations.delete(oldest);
  }
  return true;
}
function clearReportedOperations() {
  reportedImportOperations.clear();
  reportedOperationOrder.length = 0;
}
let storageWork: Promise<void> = Promise.resolve();
const persist = (work: () => Promise<void>) => { storageWork = storageWork.then(work).catch(() => { setDegraded(true); }); return storageWork; };
function saveVisit() { try { if (visit) sessionStorage.setItem(VISIT, JSON.stringify(visit)); else sessionStorage.removeItem(VISIT); } catch { setDegraded(true); } }
let discarded = 0;
let events = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let sending = false;
const retries=new Map<string,{attempts:number;nextAt:number}>();
const RETRY_SECONDS=[1,5,30,120,300];
const deferRetry=(id:string)=>{const attempts=(retries.get(id)?.attempts??0)+1;const seconds=RETRY_SECONDS[Math.min(attempts-1,RETRY_SECONDS.length-1)];const delivery={attempts,nextAt:Date.now()+Math.round(seconds*1000*(.8+Math.random()*.4))};retries.set(id,delivery);const batch=pending.get(id);if(batch){batch.delivery=delivery;void remember(batch);}};
const expectedSaves = new Set<string>();

export function usageEnabled() { return preference().enabled; }
export function usageDegraded() { return degraded; }
export function setUsageEnabled(enabled: boolean) {
  const current = preference();
  current.enabled = enabled;
  if (!enabled) { current.days = {}; pending.clear(); accumulating.clear(); clearReportedOperations(); retries.clear(); discarded = 0; visit = undefined; saveVisit(); expectedSaves.clear(); void persist(clearStore); }
  writePreference(current);
}

function channelFromLocation(): UsageChannel {
  try {
    const value = new URLSearchParams(location.search).get('from');
    return USAGE_CHANNELS.includes(value as UsageChannel) ? value as UsageChannel : value ? 'other' : 'direct';
  } catch { return 'direct'; }
}

function blankVisit(tab: string): Visit {
  return {id: crypto.randomUUID(), tab, channel: channelFromLocation(), day: today(), last: Date.now(), material: 'none', reach: {visit_started: false, material_opened: false, ai_started: false, ai_completed: false, result_saved: false}, funnel: {visit_started: false, material_opened: false, ai_started: false, ai_completed: false, result_saved: false}};
}

function currentVisit() {
  if (!usageEnabled()) return undefined;
  const now = Date.now();
  if (!visit) { try { const stored = JSON.parse(sessionStorage.getItem(VISIT) ?? 'null'); if (stored?.id && stored?.tab && USAGE_CHANNELS.includes(stored.channel) && USAGE_MATERIALS.includes(stored.material) && stored.reach && stored.funnel && Number.isFinite(stored.last)) visit = stored; } catch { setDegraded(true); } }
  if (!visit || visit.day !== today() || now - visit.last > IDLE_MS) { const material=visit?.material??'none'; visit = {...blankVisit(visit?.tab || crypto.randomUUID()),material}; }
  visit.last = now;
  saveVisit();
  return visit;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, {keyPath: 'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStore() {
  if (typeof indexedDB === 'undefined') { setDegraded(true); return; }
  try {
    const db = await openDb();
    const rows = await new Promise<Batch[]>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result as Batch[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!usageEnabled()) return;
    for (const row of rows) if (!pending.has(row.id)) {const normalized={...row, importOperations: Array.isArray(row.importOperations) ? row.importOperations : []}; pending.set(row.id, normalized);if(row.delivery)retries.set(row.id,row.delivery);}
  } catch { setDegraded(true); }
}

async function writeStore(batch: Batch) {
  if (typeof indexedDB === 'undefined') { setDegraded(true); return; }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(batch);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function deleteStored(id: string) {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function clearStore() {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { setDegraded(true); }
}

function batchFor(material: UsageMaterial, channel: UsageChannel) {
  const key = `${visit?.id}:${material}:${channel}:${today()}`;
  let batch = pending.get(accumulating.get(key) ?? '');
  if (!batch) {
    batch = {id: crypto.randomUUID(), createdAt: new Date().toISOString(), channel, material, counts: emptyCounts(), reach: emptyStages(), funnel: emptyStages(), importOperations: [], discarded: 0};
    pending.set(batch.id, batch);
    accumulating.set(key, batch.id);
  }
  return batch;
}

function trim() {
  const rows = [...pending.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  while (rows.length > MAX_BATCHES || JSON.stringify(rows).length > MAX_BYTES) {
    const oldest = rows.shift();
    if (!oldest) break;
    pending.delete(oldest.id);retries.delete(oldest.id);
    discarded += 1;
    void persist(() => deleteStored(oldest.id));
  }
}

async function remember(batch: Batch) {
  trim();
  if (!pending.has(batch.id)) return;
  const snapshot = structuredClone(batch);
  await persist(async () => { if (usageEnabled() && pending.has(snapshot.id)) await writeStore(snapshot); });
}

function stage(name: UsageStage, operation?: string) {
  const current = currentVisit();
  if (!current || !HOSTED) return;
  if (name !== 'visit_started' && !current.reach.visit_started) stage('visit_started');
  const ordered = USAGE_FUNNEL.slice(0, USAGE_FUNNEL.indexOf(name) + 1);
  const sameAi = name === 'visit_started' || name === 'material_opened' || (operation && current.ai === operation);
  const matchingCompletion = name !== 'result_saved' || current.completedAi === operation;
  const addFunnel = !current.funnel[name] && sameAi && matchingCompletion && ordered.slice(0, -1).every(item => current.funnel[item]);
  if (current.reach[name] && !addFunnel) { if (name === 'ai_completed' && sameAi) current.completedAi = operation; saveVisit(); return; }
  const batch = batchFor(current.material, current.channel);
  let changed = false;
  if (!current.reach[name]) { current.reach[name] = true; batch.reach[name] = 1; changed = true; }
  if (addFunnel) {
    current.funnel[name] = true; batch.funnel[name] = 1; changed = true;
  }
  if (name === 'ai_completed' && sameAi) current.completedAi = operation;
  saveVisit();
  if (changed) void remember(batch);
}

export function noteMaterial(material: UsageMaterial) {
  const current = currentVisit();
  if (!current) return;
  current.material = material;
  saveVisit();
  stage('material_opened');
}

export function noteAiStarted(operationId: string) {
  const current = currentVisit();
  if (!current) return;
  current.ai = operationId;
  current.completedAi = undefined;
  saveVisit();
  if (current.material !== 'none') stage('material_opened');
  stage('ai_started', operationId);
}

export function noteAnswerComplete(operationId: string) {
  expectedSaves.add(operationId);
  stage('ai_completed', operationId);
  noteCount('answer_complete');
}

export function noteResultSaved(operationId: string) {
  if (!expectedSaves.has(operationId)) return;
  expectedSaves.delete(operationId);
  stage('result_saved', operationId);
  noteCount('result_saved');
}

export function confirmSavedAnswers(requestIds: string[]) {
  for (const id of requestIds) noteResultSaved(id);
}

export function noteImportOperation(operation: ImportOperation, material: UsageMaterial = 'web') {
  if (!HOSTED) return;
  const current = currentVisit();
  if (!current || material !== 'web' || reportedImportOperations.has(operation.operationId)) return;
  const key = `${current.id}:${material}:${current.channel}:${today()}`;
  let batch = pending.get(accumulating.get(key) ?? '');
  if (batch && batch.importOperations.length >= IMPORT_OPERATION_MAX) { accumulating.delete(key); batch = undefined; }
  if (!batch) batch = batchFor(material, current.channel);
  if (!rememberReportedOperation(operation.operationId)) return;
  batch.importOperations.push(operation);
  void remember(batch);
}

export function noteCount(key: UsageCount, material?: UsageMaterial) {
  const current = currentVisit();
  if (!current || !USAGE_COUNTS.includes(key)) return;
  if (!current.reach.visit_started) stage('visit_started');
  const batch = batchFor(material??current.material, current.channel);
  batch.counts[key] += 1;
  if (discarded) { batch.discarded += discarded; discarded = 0; }
  events += 1;
  void remember(batch);
  if (events >= 20) void flushUsage(true);
}

export function markMaterial(source: UsageMaterial) { if (HOSTED) noteMaterial(source); }
export function track(key: FeatureKey) {
  if (!HOSTED || !FEATURE_KEYS.includes(key)) return;
  if (key === 'bookmark-save') noteCount('bookmark_saved');
}

async function send(batch: Batch) {
  const {id, delivery: _delivery, importOperations, ...rest} = batch;
  const payload = importOperations.length ? {schemaVersion: 3, batchId: id, ...rest, importOperations} : {schemaVersion: 2, batchId: id, ...rest};
  const response = await fetch('/api/hosted/usage', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload), keepalive: true});
  if (response.status === 204) { retries.delete(batch.id); pending.delete(batch.id); await persist(() => deleteStored(batch.id)); return; }
  if (response.status === 400) {
    const body = await response.json().catch(() => ({}));
    if (body.code === 'batch_expired') { retries.delete(batch.id); pending.delete(batch.id); await persist(() => deleteStored(batch.id)); return; }
  }
  deferRetry(batch.id);
}

export async function flushUsage(respectBackoff=false) {
  if (!HOSTED || !usageEnabled() || sending) return;
  sending = true;
  // Seal before yielding: a request's ID, creation time and payload never change.
  accumulating.clear();
  const batches = [...pending.values()].map(batch => structuredClone(batch));
  try {
    await storageWork;
    await legacyFlush();
    const now = Date.now();
    for (const batch of batches) {
      if (!usageEnabled()) break;
      if (respectBackoff && (retries.get(batch.id)?.nextAt??0)>now) continue;
      if (now - Date.parse(batch.createdAt) > RETAIN_MS) { pending.delete(batch.id); await persist(() => deleteStored(batch.id)); discarded += 1; continue; }
      try { await send(batch); } catch { deferRetry(batch.id); setDegraded(true); }
    }
  } finally { sending = false; events = 0; }
}

async function legacyFlush() {
  const stored = preference();
  if (!stored.days) return;
  for (const [date, day] of Object.entries(stored.days)) {
    if (!usageEnabled()) return;
    if (day.sent) continue;
    const age = Math.max(0, Math.floor((Date.parse(date)-Date.parse(stored.first??date))/86400000));
    const summary = {date, returnBucket: age===0?'first':age<=3?'days1to3':age<=7?'days4to7':'days8plus', sources: day.sources ?? [], features: Object.fromEntries(FEATURE_KEYS.map(key => { const n=day.counts?.[key]??0;return [key,{count:n===0?'0':n===1?'1':n<=5?'2to5':'6plus',onReturnDay:age>0&&n>0}];}))};
    try {
      const response = await fetch('/api/hosted/usage', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(summary), keepalive: true});
      if (response.status === 204) day.sent = true;
    } catch { /* v1 stays unsent; it is never copied into v2 */ }
  }
  if (usageEnabled()) writePreference({...stored, enabled: preference().enabled});
}

export function installUsage() {
  if (!HOSTED) return () => undefined;
  const tab = currentVisit()?.tab || crypto.randomUUID();
  try { sessionStorage.setItem('got-it.tab', tab); } catch { setDegraded(true); }
  stage('visit_started');
  let bus: BroadcastChannel | undefined;
  if (typeof BroadcastChannel !== 'undefined') {
    bus = new BroadcastChannel('got-it-visit');
    bus.onmessage = event => { if (event.data?.type === 'ping' && event.data.tab === tab) bus!.postMessage({type: 'pong', tab}); if (event.data?.type === 'pong' && event.data.tab === tab) { visit = blankVisit(crypto.randomUUID()); sessionStorage.setItem('got-it.tab', visit.tab); saveVisit(); stage('visit_started'); } };
    bus.postMessage({type: 'ping', tab});
  }
  void persist(readStore).then(() => flushUsage(true));
  let lastFlush=Date.now();
  timer = setInterval(() => { const now=Date.now();if(now-lastFlush>=30_000||[...retries.values()].some(r=>r.nextAt<=now)){lastFlush=now;void flushUsage(true);} }, 1000);
  const close = () => { void flushUsage(true); };
  window.addEventListener('pagehide', close);
  window.addEventListener('online', close);
  return () => { bus?.close(); if (timer) clearInterval(timer); window.removeEventListener('pagehide', close); window.removeEventListener('online', close); };
}

export function pendingBatches() { return [...pending.values()]; }
