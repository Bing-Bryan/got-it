import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {atomicJson, HostedError, utcDay} from './hosted-budget';
import {FEATURE_KEYS} from '../src/lib/hosted-feature-keys';
import {IMPORT_ATTEMPT_MAX, IMPORT_ERROR_CATEGORIES, IMPORT_OPERATION_MAX, IMPORT_OUTCOMES, type ImportErrorCategory, type ImportOperation, type ImportOutcome} from '../src/lib/web-import-observability';
export {FEATURE_KEYS} from '../src/lib/hosted-feature-keys';

const counts = ['0', '1', '2to5', '6plus'];
const returns = ['first', 'days1to3', 'days4to7', 'days8plus'];
const sources = ['sample', 'markdown', 'pdf'];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
export const USAGE_CHANNELS = ['direct', 'xiaohongshu', 'x', 'wechat', 'other'] as const;
export const USAGE_MATERIALS = ['sample', 'markdown', 'pdf', 'web', 'x', 'none'] as const;
export const USAGE_COUNTS = ['import_started', 'import_success', 'import_existing', 'import_failed', 'import_cancelled', 'translation_started', 'translation_batch_success', 'translation_complete', 'translation_partial', 'translation_failed', 'translation_cancelled', 'answer_complete', 'result_saved', 'bookmark_saved'] as const;
export const USAGE_FUNNEL = ['visit_started', 'material_opened', 'ai_started', 'ai_completed', 'result_saved'] as const;
export const USAGE_RECEIPT_MS = 48 * 60 * 60 * 1000;
export const USAGE_RECEIPT_MAX = 50_000;
export const IMPORT_OPERATION_RECEIPT_MAX = 50_000;
const BATCH_KEYS = ['schemaVersion', 'batchId', 'createdAt', 'channel', 'material', 'counts', 'reach', 'funnel', 'discarded'] as const;
const V3_BATCH_KEYS = [...BATCH_KEYS, 'importOperations'] as const;
const OPERATION_KEYS = ['operationId', 'startedAt', 'outcome', 'attempts', 'recovered', 'errorCategory'] as const;

export interface DailySummary { date: string; returnBucket: string; sources: string[]; features: Record<string, {count: string; onReturnDay: boolean}>; }
export function parseSummary(v: unknown, now = Date.now()): DailySummary {
  const invalid = () => { throw new HostedError('统计摘要格式无效'); };
  if (!object(v) || !exact(v, ['date', 'returnBucket', 'sources', 'features'])) return invalid();
  if (typeof v.date !== 'string' || ![utcDay(now), utcDay(now - 86400000)].includes(v.date) || !returns.includes(String(v.returnBucket))) return invalid();
  if (!Array.isArray(v.sources) || v.sources.length > 3 || new Set(v.sources).size !== v.sources.length || v.sources.some(s => !sources.includes(s))) return invalid();
  if (!object(v.features) || !exact(v.features, FEATURE_KEYS)) return invalid();
  for (const entry of Object.values(v.features)) if (!object(entry) || !exact(entry, ['count', 'onReturnDay']) || !counts.includes(String(entry.count)) || typeof entry.onReturnDay !== 'boolean' || (entry.onReturnDay && (entry.count === '0' || v.returnBucket === 'first'))) return invalid();
  return v as unknown as DailySummary;
}

type Aggregates = {version: 1; days: Record<string, Record<string, number>>};
type Receipt = {hash: string; expires: number};
type V2 = {version: 2; days: Record<string, Record<string, number>>; receipts: Receipt[]; operations?: Record<string, Record<string, number>>; operationReceipts?: Receipt[]};
type ParsedBatch = {schemaVersion: 2 | 3; batchId: string; createdAt: string; channel: typeof USAGE_CHANNELS[number]; material: typeof USAGE_MATERIALS[number]; counts: Record<typeof USAGE_COUNTS[number], number>; reach: Record<typeof USAGE_FUNNEL[number], 0 | 1>; funnel: Record<typeof USAGE_FUNNEL[number], 0 | 1>; discarded: number; importOperations: ImportOperation[]};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseBatch(v: unknown, now = Date.now()): ParsedBatch {
  const invalid = () => { throw new HostedError('统计批次格式无效'); };
  if (!object(v) || (v.schemaVersion !== 2 && v.schemaVersion !== 3)) return invalid();
  const schemaVersion = v.schemaVersion;
  if (!exact(v, schemaVersion === 3 ? V3_BATCH_KEYS : BATCH_KEYS)) return invalid();
  if (typeof v.batchId !== 'string' || !uuid.test(v.batchId) || typeof v.createdAt !== 'string' || !Number.isFinite(Date.parse(v.createdAt))) return invalid();
  const created = Date.parse(v.createdAt);
  if (created > now) throw new HostedError('统计批次创建时间尚未到达', 400, 'batch_future');
  if (now - created >= USAGE_RECEIPT_MS) throw new HostedError('统计批次已过期', 400, 'batch_expired');
  if (!USAGE_CHANNELS.includes(v.channel as typeof USAGE_CHANNELS[number]) || !USAGE_MATERIALS.includes(v.material as typeof USAGE_MATERIALS[number])) return invalid();
  if (!object(v.counts) || !exact(v.counts, USAGE_COUNTS) || !object(v.reach) || !exact(v.reach, USAGE_FUNNEL) || !object(v.funnel) || !exact(v.funnel, USAGE_FUNNEL)) return invalid();
  for (const value of Object.values(v.counts)) if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 1000) return invalid();
  for (const value of [...Object.values(v.reach), ...Object.values(v.funnel)]) if (value !== 0 && value !== 1) return invalid();
  if (!Number.isSafeInteger(v.discarded) || Number(v.discarded) < 0 || Number(v.discarded) > 10_000) return invalid();
  let importOperations: ImportOperation[] = [];
  if (schemaVersion === 3) {
    if (!Array.isArray(v.importOperations) || v.importOperations.length > IMPORT_OPERATION_MAX) return invalid();
    for (const item of v.importOperations) {
      if (!object(item) || !exact(item, OPERATION_KEYS)) return invalid();
      if (typeof item.operationId !== 'string' || !uuid.test(item.operationId) || typeof item.startedAt !== 'string' || !Number.isFinite(Date.parse(item.startedAt))) return invalid();
      const started = Date.parse(item.startedAt);
      if (started > now + 5 * 60_000) return invalid();
      if (!IMPORT_OUTCOMES.includes(item.outcome as ImportOutcome)) return invalid();
      if (!Number.isSafeInteger(item.attempts) || Number(item.attempts) < 1 || Number(item.attempts) > IMPORT_ATTEMPT_MAX || typeof item.recovered !== 'boolean') return invalid();
      const outcome = item.outcome as ImportOutcome;
      const category = item.errorCategory === null ? null : IMPORT_ERROR_CATEGORIES.includes(item.errorCategory as ImportErrorCategory) ? item.errorCategory as ImportErrorCategory : undefined;
      if (category === undefined) return invalid();
      if (outcome === 'failed' && !category) return invalid();
      if ((outcome === 'cancelled' || outcome === 'expired') && (item.recovered || category)) return invalid();
      if (item.recovered && (!['success', 'existing'].includes(outcome) || Number(item.attempts) < 2 || !category)) return invalid();
      if (!item.recovered && category && outcome !== 'failed') return invalid();
      importOperations.push({operationId: item.operationId, startedAt: new Date(started).toISOString(), outcome, attempts: Number(item.attempts), recovered: item.recovered, errorCategory: category});
    }
    if (importOperations.length && v.material !== 'web') return invalid();
  }
  return {schemaVersion, batchId: v.batchId, createdAt: v.createdAt, channel: v.channel as ParsedBatch['channel'], material: v.material as ParsedBatch['material'], counts: v.counts as ParsedBatch['counts'], reach: v.reach as ParsedBatch['reach'], funnel: v.funnel as ParsedBatch['funnel'], discarded: Number(v.discarded), importOperations};
}

export interface StatisticsReportQuery {from?:string;to?:string;channel?:string;material?:string;}
const DAY_MS = 86_400_000;
const utcDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
const all = (value: string | undefined, allowed: readonly string[]) => value === undefined || value === '' || value === 'all' || allowed.includes(value);

export class HostedStatistics {
  private state: Aggregates = {version: 1, days: {}};
  private v2: V2 = {version: 2, days: {}, receipts: []};
  private v2Corrupt = false;
  private receiptTimer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private day = '';
  private ids = new Set<string>();
  private ips = new Map<string, number>();
  constructor(private path: string, private now = Date.now, private v2Path = `${path}.v2`) {
    if (existsSync(path)) {
      const v = JSON.parse(readFileSync(path, 'utf8')) as Aggregates;
      if (v.version !== 1 || !object(v.days) || Object.values(v.days).some(day => !object(day) || Object.values(day).some(n => !Number.isSafeInteger(n) || n < 0))) throw new Error('Invalid hosted statistics aggregate');
      this.state = v;
    }
    if (existsSync(v2Path)) {
      const v = JSON.parse(readFileSync(v2Path, 'utf8')) as V2;
      if (v.version !== 2 || !object(v.days) || !Array.isArray(v.receipts) || v.receipts.length > USAGE_RECEIPT_MAX || v.receipts.some(item => !item || !/^[0-9a-f]{64}$/.test(item.hash) || !Number.isFinite(item.expires))) throw new Error('Invalid hosted statistics v2 aggregate');
      const operations = v.operations ?? {};
      const operationReceipts = v.operationReceipts ?? [];
      if (!object(operations) || !Array.isArray(operationReceipts) || operationReceipts.length > IMPORT_OPERATION_RECEIPT_MAX || operationReceipts.some(item => !item || !/^[0-9a-f]{64}$/.test(item.hash) || !Number.isFinite(item.expires))) throw new Error('Invalid hosted statistics operation aggregate');
      this.v2Corrupt = Object.values(v.days).some(day => !object(day) || Object.values(day).some(value => !Number.isSafeInteger(value) || value < 0)) || Object.values(operations).some(day => !object(day) || Object.values(day).some(value => !Number.isSafeInteger(value) || value < 0));
      this.v2 = {...v};
    }
    this.pruneReceipts();
  }
  close() { this.closed = true; if (this.receiptTimer) clearTimeout(this.receiptTimer); this.receiptTimer = undefined; }
  private scheduleReceipts(retryMs?: number) {
    if (this.receiptTimer) clearTimeout(this.receiptTimer);
    this.receiptTimer = undefined;
    if (this.closed || (!this.v2.receipts.length && !(this.v2.operationReceipts?.length ?? 0))) return;
    const nextExpiry = [...this.v2.receipts, ...(this.v2.operationReceipts ?? [])].reduce((expiry, receipt) => Math.min(expiry, receipt.expires), Infinity);
    const delay = retryMs ?? Math.max(1, Math.min(USAGE_RECEIPT_MS, nextExpiry - this.now()));
    this.receiptTimer = setTimeout(() => {
      this.receiptTimer = undefined;
      try { this.pruneReceipts(); } catch { this.scheduleReceipts(60_000); }
    }, delay);
    this.receiptTimer.unref?.();
  }
  private pruneReceipts(now = this.now()) {
    const receipts = this.v2.receipts.filter(item => item.expires > now);
    const operationReceipts = (this.v2.operationReceipts ?? []).filter(item => item.expires > now);
    if (receipts.length !== this.v2.receipts.length || operationReceipts.length !== (this.v2.operationReceipts ?? []).length) {
      const next = {...this.v2, receipts, ...(this.v2.operationReceipts ? {operationReceipts} : {})};
      try { atomicJson(this.v2Path, next); } catch { this.scheduleReceipts(60_000); throw new HostedError('统计暂不可用', 503); }
      this.v2 = next;
    }
    this.scheduleReceipts();
  }
  record(input: unknown, id: string, ip: string) {
    const now = this.now(), day = utcDay(now), summary = parseSummary(input, now);
    if (this.day !== day) { this.ids.clear(); this.ips.clear(); this.day = day; }
    const key = `${summary.date}:${id}`;
    if (this.ids.has(key)) return;
    if ((this.ips.get(ip) || 0) >= 60) throw new HostedError('统计上报已达上限', 429);
    const aggregate = {...(this.state.days[summary.date] || {})};
    const add = (name: string) => { aggregate[name] = (aggregate[name] || 0) + 1; };
    add('summaries'); add(`return:${summary.returnBucket}`);
    for (const source of summary.sources) add(`source:${source}`);
    for (const feature of FEATURE_KEYS) {
      const entry = summary.features[feature]; add(`feature:${feature}:count:${entry.count}`); if (entry.onReturnDay) add(`feature:${feature}:return`);
      for (const source of summary.sources) if (entry.count !== '0') add(`source:${source}:feature:${feature}:reach`);
    }
    const next = {version: 1 as const, days: {...this.state.days, [summary.date]: aggregate}};
    try { atomicJson(this.path, next); } catch { throw new HostedError('统计暂不可用', 503); }
    this.state = next; this.ids.add(key); this.ips.set(ip, (this.ips.get(ip) || 0) + 1);
  }
  acceptBatch(input: unknown) {
    if (this.v2Corrupt) throw new HostedError('统计账本损坏，统计暂不可用', 503, 'statistics_corrupt');
    const now = this.now();
    this.pruneReceipts(now);
    const batch = parseBatch(input, now);
    const hash = createHash('sha256').update(batch.batchId).digest('hex');
    if (this.v2.receipts.find(item => item.hash === hash)) return {accepted: true, duplicate: true};
    if (this.v2.receipts.length >= USAGE_RECEIPT_MAX) throw new HostedError('统计接收已满，请稍后重试', 503, 'statistics_capacity');
    const day = batch.createdAt.slice(0, 10);
    const aggregate = {...(this.v2.days[day] || {})};
    const prefix = `${batch.channel}:${batch.material}`;
    const add = (name: string, amount: number) => { if (amount) aggregate[`${prefix}:${name}`] = (aggregate[`${prefix}:${name}`] || 0) + amount; };
    for (const key of USAGE_COUNTS) add(key, batch.counts[key]);
    for (const key of USAGE_FUNNEL) { add(`reach:${key}`, batch.reach[key]); add(`funnel:${key}`, batch.funnel[key]); }
    add('discarded', batch.discarded);
    const operations = {...(this.v2.operations ?? {})};
    const operationReceipts = [...(this.v2.operationReceipts ?? [])];
    const seen = new Set(operationReceipts.map(item => item.hash));
    const fresh: {operation: ImportOperation; hash: string}[] = [];
    for (const operation of batch.importOperations) {
      // An operation can cross the retention boundary before its batch is sent.
      // Drop only that observation; the batch and unrelated events remain accepted.
      if (now - Date.parse(operation.startedAt) >= USAGE_RECEIPT_MS) continue;
      const operationHash = createHash('sha256').update(operation.operationId).digest('hex');
      if (seen.has(operationHash)) continue;
      if (operationReceipts.length + fresh.length >= IMPORT_OPERATION_RECEIPT_MAX) throw new HostedError('操作统计接收已满，请稍后重试', 503, 'statistics_capacity');
      seen.add(operationHash);
      fresh.push({operation, hash: operationHash});
    }
    for (const {operation} of fresh) {
      const operationDay = operation.startedAt.slice(0, 10);
      const operationAggregate = {...(operations[operationDay] || {})};
      const operationPrefix = `${batch.channel}:${batch.material}`;
      const addOperation = (name: string) => { operationAggregate[`${operationPrefix}:${name}`] = (operationAggregate[`${operationPrefix}:${name}`] || 0) + 1; };
      addOperation(`final:${operation.outcome}`);
      addOperation(`attempts:${operation.attempts <= 1 ? '1' : operation.attempts <= 3 ? '2to3' : '4plus'}`);
      if (operation.recovered) addOperation('recovered');
      if (operation.attempts > 1) addOperation('retried');
      if (operation.errorCategory) addOperation(`error:${operation.errorCategory}`);
      operations[operationDay] = operationAggregate;
    }
    for (const item of fresh) operationReceipts.push({hash: item.hash, expires: now + USAGE_RECEIPT_MS});
    const next: V2 = {...this.v2, days: {...this.v2.days, [day]: aggregate}, receipts: [...this.v2.receipts, {hash, expires: now + USAGE_RECEIPT_MS}], ...(batch.schemaVersion === 3 ? {operations, operationReceipts} : {})};
    try { atomicJson(this.v2Path, next); } catch { throw new HostedError('统计暂不可用', 503); }
    this.v2 = next;
    this.scheduleReceipts();
    return {accepted: true, duplicate: false};
  }

  report(query: StatisticsReportQuery = {}) {
    if (this.v2Corrupt) throw new HostedError('统计账本损坏，统计暂不可用', 503, 'statistics_corrupt');
    this.pruneReceipts();
    const now = this.now();
    const today = utcDay(now);
    if (!all(query.channel, USAGE_CHANNELS) || !all(query.material, USAGE_MATERIALS)) throw new HostedError('统计筛选无效');
    const from = query.from && query.from !== '' ? query.from : utcDay(now - 6 * DAY_MS);
    const to = query.to && query.to !== '' ? query.to : today;
    if (!utcDate(from) || !utcDate(to)) throw new HostedError('统计日期格式无效');
    const fromMs = Date.parse(`${from}T00:00:00.000Z`), toMs = Date.parse(`${to}T00:00:00.000Z`);
    if (toMs < fromMs || toMs > Date.parse(`${today}T00:00:00.000Z`) || (toMs - fromMs) / DAY_MS + 1 > 31) throw new HostedError('统计日期范围必须在最近31个UTC日内');
    const channel = query.channel && query.channel !== 'all' ? query.channel : 'all';
    const material = query.material && query.material !== 'all' ? query.material : 'all';
    const counts = Object.fromEntries(USAGE_COUNTS.map(key => [key, 0])) as Record<typeof USAGE_COUNTS[number], number>;
    const reach = Object.fromEntries(USAGE_FUNNEL.map(key => [key, 0])) as Record<typeof USAGE_FUNNEL[number], number>;
    const funnel = Object.fromEntries(USAGE_FUNNEL.map(key => [key, 0])) as Record<typeof USAGE_FUNNEL[number], number>;
    let discarded = 0;
    let daysWithData = 0;
    const importTotals = {success: 0, existing: 0, failed: 0, cancelled: 0, expired: 0, recovered: 0, retried: 0};
    const importErrors = Object.fromEntries(IMPORT_ERROR_CATEGORIES.map(category => [category, 0])) as Record<ImportErrorCategory, number>;
    let importDaysWithData = 0;
    for (let cursor = fromMs; cursor <= toMs; cursor += DAY_MS) {
      const day = new Date(cursor).toISOString().slice(0, 10);
      const aggregate = this.v2.days[day];
      if (!aggregate) continue;
      let dayData = false;
      for (const [key, value] of Object.entries(aggregate)) {
        if (!Number.isSafeInteger(value) || value < 0) throw new HostedError('统计账本包含损坏计数，统计暂不可用', 503, 'statistics_corrupt');
        const [entryChannel, entryMaterial, ...rest] = key.split(':');
        const name = rest.join(':');
        if (!USAGE_CHANNELS.includes(entryChannel as typeof USAGE_CHANNELS[number]) || !USAGE_MATERIALS.includes(entryMaterial as typeof USAGE_MATERIALS[number])) continue;
        if (channel !== 'all' && entryChannel !== channel) continue;
        if (material !== 'all' && entryMaterial !== material) continue;
        if (name === 'discarded') { discarded += value; dayData = true; continue; }
        if ((USAGE_COUNTS as readonly string[]).includes(name)) { counts[name as typeof USAGE_COUNTS[number]] += value; dayData = true; continue; }
        if (name.startsWith('reach:') && (USAGE_FUNNEL as readonly string[]).includes(name.slice(6))) { reach[name.slice(6) as typeof USAGE_FUNNEL[number]] += value; dayData = true; continue; }
        if (name.startsWith('funnel:') && (USAGE_FUNNEL as readonly string[]).includes(name.slice(7))) { funnel[name.slice(7) as typeof USAGE_FUNNEL[number]] += value; dayData = true; continue; }
      }
      if (dayData) daysWithData += 1;
    }
    for (let cursor = fromMs; cursor <= toMs; cursor += DAY_MS) {
      const day = new Date(cursor).toISOString().slice(0, 10);
      const aggregate = this.v2.operations?.[day];
      if (!aggregate) continue;
      let operationDay = false;
      for (const [key, value] of Object.entries(aggregate)) {
        if (!Number.isSafeInteger(value) || value < 0) throw new HostedError('统计账本包含损坏计数，统计暂不可用', 503, 'statistics_corrupt');
        const [entryChannel, entryMaterial, ...rest] = key.split(':');
        if (channel !== 'all' && entryChannel !== channel) continue;
        if (material !== 'all' && entryMaterial !== material) continue;
        const name = rest.join(':');
        if (name.startsWith('final:') && (IMPORT_OUTCOMES as readonly string[]).includes(name.slice(6))) { importTotals[name.slice(6) as keyof typeof importTotals] += value; operationDay = true; continue; }
        if (name === 'recovered' || name === 'retried') { importTotals[name] += value; operationDay = true; continue; }
        if (name.startsWith('error:') && (IMPORT_ERROR_CATEGORIES as readonly string[]).includes(name.slice(6))) { importErrors[name.slice(6) as ImportErrorCategory] += value; operationDay = true; continue; }
        if (name.startsWith('attempts:')) { operationDay = true; continue; }
      }
      if (operationDay) importDaysWithData += 1;
    }
    const conversions = material === 'all' && channel !== 'all'
      ? USAGE_FUNNEL.slice(1).map((stage, index) => {
        const previous = USAGE_FUNNEL[index];
        const denominator = funnel[previous];
        return {from: previous, to: stage, count: funnel[stage], denominator, rate: denominator > 0 ? Math.round(funnel[stage] / denominator * 1000) / 10 : null};
      })
      : null;
    return {
      schemaVersion: 2 as const,
      generatedAt: new Date(now).toISOString(),
      range: {from, to, days: (toMs - fromMs) / DAY_MS + 1, daysWithData},
      filters: {channel, material},
      hasData: daysWithData > 0,
      counts,
      reach,
      funnel: material === 'all' ? funnel : null,
      conversions,
      conversionsAvailable: conversions !== null,
      conversionsNote: material !== 'all'
        ? '材料筛选只显示该材料发生的阶段触达与事件计数；访问开始与提问可能归因到不同材料，因此不计算转换率。'
        : channel === 'all'
          ? '转换率只在选定单一渠道、跨材料汇总且分母大于0时显示；当前为多渠道汇总。'
          : '转换率是已送达v2批次中相邻阶段的有序计数比，不是同一批人的精确转换；漏报、48小时内补报和机器人会影响结果。',
      discarded,
      importOperations: {
        schemaVersion: 1 as const,
        hasData: importDaysWithData > 0,
        daysWithData: importDaysWithData,
        totals: importTotals,
        errors: importErrors,
        note: '新口径操作终态；每个 operationId 只计一次，按操作开始UTC日归属。与 v2 import_failed 事件计数不可相加或共用失败率分母。',
      },
      v1: {present: Object.keys(this.state.days).length > 0, days: Object.keys(this.state.days).length, note: 'v1历史只提示存在，不与v2计数或分母合并。'},
      note: 'v2是已送达的匿名访问/事件增量，可能漏报、48小时内补报或包含机器人；访问阶段计数不是UV/PV、跨日留存或全量真实用户。',
    };
  }

  summary() {
    this.pruneReceipts();
    return {v1Days: Object.keys(this.state.days).length, v2: this.v2.days, receipts: this.v2.receipts.length, receiptLimit: USAGE_RECEIPT_MAX};
  }
}
