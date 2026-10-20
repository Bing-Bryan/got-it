import {dirname} from 'node:path';
import { syncDirectory } from './private-storage';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';

import {HOSTED_INPUT_LIMIT} from '../src/lib/hosted-prompt';
export const MAX_INPUT_TOKENS = HOSTED_INPUT_LIMIT;
export const MAX_OUTPUT_TOKENS = 1500;
// Highest published tariff, cache misses; reserve before sending any model request.
export const MAX_REQUEST_USD = (MAX_INPUT_TOKENS * .30 + MAX_OUTPUT_TOKENS * 1.20) / 1_000_000;
export const ALERT_DELAYS_MS = [0, 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000, 120 * 60_000, 240 * 60_000];
export const ALERT_RETAIN_MS = 14 * 86_400_000;
export const ALERT_MAX = 42;

export type AlertThreshold = 50 | 80 | 100;
export type BudgetAlert = {
  id: string;
  day: string;
  threshold: AlertThreshold;
  budget: number;
  confirmed: number;
  reserved: number;
  reason: 'threshold_crossed' | 'request_unaffordable';
  createdAt: string;
  attempts: number;
  nextAttemptAt: number;
  status: 'pending' | 'delivered' | 'exhausted' | 'unconfigured';
};
type DayLedger = {confirmed: number; reserved: number; blocked?: boolean; thresholds?: Partial<Record<AlertThreshold, string>>};
export type BudgetState = {version: 2; days: Record<string, DayLedger>; alerts: BudgetAlert[]};
type LegacyState = {version: 1; days: Record<string, {charged: number; blocked?: boolean}>};
export class HostedError extends Error { constructor(message: string, public status = 400, public code = 'invalid_request', public retryAfter?: number) { super(message); } }
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export function atomicJson(path: string, data: unknown) {
  const temp = `${path}.tmp`;
  const fd = openSync(temp, 'w', 0o600);
  try { writeFileSync(fd, JSON.stringify(data)); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, path);
  syncDirectory(dirname(path));
}
export function initializeBudget(path: string) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify({version: 2, days: {}, alerts: []})); fsyncSync(fd); } finally { closeSync(fd); }
}
function processAlive(pid: number) { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; } }
function acquireLock(path: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const fd = openSync(path, 'wx', 0o600); try { writeFileSync(fd, String(process.pid)); fsyncSync(fd); } finally { closeSync(fd); } return; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const owner = readFileSync(path, 'utf8').trim();
    if (!/^\d+$/.test(owner)) throw new Error(`Hosted budget lock ${path} has no owner PID (left by an older version); confirm no hosted API process is running, then remove it`);
    if (Number(owner) !== process.pid && !processAlive(Number(owner))) { unlinkSync(path); continue; }
    throw new Error(`Hosted budget is locked by running process ${owner}`);
  }
  throw new Error('Hosted budget lock could not be acquired');
}
const dayOk = (day: string, value: DayLedger) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !!value && Number.isFinite(value.confirmed) && value.confirmed >= 0 && Number.isFinite(value.reserved) && value.reserved >= 0 && (value.blocked === undefined || typeof value.blocked === 'boolean');
function migrate(value: LegacyState): BudgetState {
  const days: BudgetState['days'] = {};
  for (const [day, entry] of Object.entries(value.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !entry || !Number.isFinite(entry.charged) || entry.charged < 0 || (entry.blocked !== undefined && typeof entry.blocked !== 'boolean')) throw new Error('Invalid hosted budget ledger');
    days[day] = {confirmed: 0, reserved: entry.charged, ...(entry.blocked ? {blocked: true} : {})};
  }
  return {version: 2, days, alerts: []};
}
export class HostedBudget {
  private state: BudgetState;
  private failed = false;
  private lock: string;
  private identities = new Map<string, number>();
  private ips = new Map<string, number>();
  private memoryDay = '';
  private delivering = new Set<string>();
  private onAlert?: (alert: BudgetAlert) => void;
  constructor(public path: string, private limit = 3, private now = Date.now) {
    if (!Number.isFinite(limit) || limit <= 0 || limit > 3) throw new Error('Invalid hosted daily limit');
    this.lock = `${path}.lock`;
    acquireLock(this.lock);
    try {
      const value = JSON.parse(readFileSync(path, 'utf8')) as BudgetState | LegacyState;
      if (value.version === 1) this.state = migrate(value as LegacyState);
      else if (value.version === 2 && value.days && typeof value.days === 'object' && !Array.isArray(value.days) && Array.isArray(value.alerts) && Object.entries(value.days).every(([day, entry]) => dayOk(day, entry)) && value.alerts.every(alert => this.validAlert(alert))) this.state = value;
      else throw new Error('Invalid hosted budget ledger');
      if (value.version === 1) this.persist();
    } catch { unlinkSync(this.lock); throw new Error('Hosted budget missing or unreadable; initialization/recovery required'); }
  }
  bindAlerts(hook: (alert: BudgetAlert) => void) { this.onAlert = hook; }
  close() { if (existsSync(this.lock) && readFileSync(this.lock, 'utf8').trim() === String(process.pid)) unlinkSync(this.lock); }
  private day() { const day = utcDay(this.now()); if (this.memoryDay !== day) { this.identities.clear(); this.ips.clear(); this.memoryDay = day; } return day; }
  private ledger(day: string) { return this.state.days[day] ?? {confirmed: 0, reserved: 0}; }
  occupancy(day = this.day()) { const entry = this.ledger(day); return entry.confirmed + entry.reserved; }
  status(id: string, ip: string) {
    const day = this.day(); const entry = this.ledger(day);
    return {remaining: Math.max(0, Math.min(30 - (this.identities.get(id) || 0), 60 - (this.ips.get(ip) || 0))), browserLimit: 30, ipLimit: 60, resetAt: new Date(`${day}T00:00:00Z`).getTime() + 86400000, globalExhausted: this.failed || entry.blocked === true || entry.confirmed + entry.reserved + MAX_REQUEST_USD > this.limit, confirmed: entry.confirmed, reserved: entry.reserved, budget: this.limit};
  }
  reserve(id: string, ip: string, searchCostUsd = 0, limits = {input: MAX_INPUT_TOKENS, output: MAX_OUTPUT_TOKENS}) {
    if (!Number.isSafeInteger(limits.input) || !Number.isSafeInteger(limits.output) || limits.input < 1 || limits.input > 48000 || limits.output < 1 || limits.output > 8000) throw new HostedError('模型预算参数无效');
    const modelReservation = (limits.input * .30 + limits.output * 1.20) / 1_000_000;
    if (!Number.isFinite(searchCostUsd) || searchCostUsd < 0 || searchCostUsd > this.limit) throw new HostedError('搜索费用未确认，查证暂不可用', 503, 'search_price_unavailable');
    const reservation = modelReservation + searchCostUsd;
    const day = this.day();
    const status = this.status(id, ip);
    if (this.failed || this.state.days[day]?.blocked === true) throw new HostedError('今日体验额度已用完', 429, 'global_quota_exhausted');
    if (this.occupancy(day) + reservation > this.limit) { this.noteUnaffordable(day); throw new HostedError('今日体验额度已用完', 429, 'global_quota_exhausted'); }
    if (status.remaining <= 0) throw new HostedError('今日体验次数已用完', 429, 'quota_exhausted');
    const before = this.occupancy(day);
    this.state.days[day] ??= {confirmed: 0, reserved: 0};
    this.state.days[day].reserved += reservation;
    try { this.noteThresholds(day, before); this.persist(); this.notifyAlerts(); }
    catch (error) { this.state.days[day].reserved = Math.max(0, this.state.days[day].reserved - reservation); throw error; }
    this.identities.set(id, (this.identities.get(id) || 0) + 1); this.ips.set(ip, (this.ips.get(ip) || 0) + 1);
    let settled = false;
    return (usage?: {prompt_tokens: number; completion_tokens: number}) => {
      if (settled) return; settled = true;
      if (!usage) return;
      const {prompt_tokens: input, completion_tokens: output} = usage;
      if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input < 0 || output < 0 || input > limits.input || output > limits.output) { this.failed = true; this.state.days[day].blocked = true; this.persist(); throw new HostedError('模型用量异常，体验服务已暂停', 503, 'usage_invalid'); }
      const previous = this.occupancy(day);
      this.state.days[day].reserved = Math.max(0, this.state.days[day].reserved - reservation);
      this.state.days[day].confirmed += (input * .30 + output * 1.20) / 1_000_000 + searchCostUsd;
      this.noteThresholds(day, previous);
      this.persist();
      this.notifyAlerts();
    };
  }
  private ratio(day: string) { return this.limit === 0 ? 1 : this.occupancy(day) / this.limit; }
  private ensureAlert(day: string, threshold: AlertThreshold, reason: BudgetAlert['reason']) {
    const entry = this.state.days[day] ??= {confirmed: 0, reserved: 0};
    entry.thresholds ??= {};
    if (entry.thresholds[threshold]) return;
    this.pruneAlerts();
    if (this.state.alerts.length >= ALERT_MAX) throw new HostedError('费用告警无法保存，体验服务已暂停', 503, 'budget_unavailable');
    const alert: BudgetAlert = {id: `${day}:${threshold}`, day, threshold, budget: this.limit, confirmed: entry.confirmed, reserved: entry.reserved, reason, createdAt: new Date(this.now()).toISOString(), attempts: 0, nextAttemptAt: this.now(), status: 'pending'};
    entry.thresholds[threshold] = alert.id;
    this.state.alerts.push(alert);
  }
  private noteThresholds(day: string, before: number) {
    const previous = before / this.limit, next = this.ratio(day);
    for (const threshold of [50, 80, 100] as const) if (previous < threshold / 100 && next >= threshold / 100) this.ensureAlert(day, threshold, 'threshold_crossed');
  }
  private noteUnaffordable(day: string) { this.ensureAlert(day, 100, 'request_unaffordable'); this.persist(); this.notifyAlerts(); }
  private notifyAlerts() {
    // Dispatcher hooks only observe the complete, durable fee + event transaction.
    // A notification failure cannot turn a successful reservation into an uncharged request.
    for (const alert of this.state.alerts) if (alert.status === 'pending') { try { this.onAlert?.({...alert}); } catch { /* Polling retries the durable event. */ } }
  }
  private pruneAlerts() {
    const cutoff = this.now() - ALERT_RETAIN_MS;
    const before = this.state.alerts.length;
    this.state.alerts = this.state.alerts.filter(alert => Date.parse(alert.createdAt) >= cutoff);
    return before !== this.state.alerts.length;
  }
  alerts() { if (this.pruneAlerts()) this.persist(); return this.state.alerts.map(alert => ({...alert})); }
  markAlert(id: string, patch: Pick<BudgetAlert, 'attempts' | 'nextAttemptAt' | 'status'>) {
    const alert = this.state.alerts.find(item => item.id === id);
    if (!alert) return;
    alert.attempts = patch.attempts; alert.nextAttemptAt = patch.nextAttemptAt; alert.status = patch.status;
    this.persist();
  }
  beginAlertAttempt(id: string, now: number) {
    const alert = this.state.alerts.find(item => item.id === id);
    if (!alert || this.delivering.has(id) || alert.attempts >= ALERT_DELAYS_MS.length) return;
    this.delivering.add(id);
    try {
      // Persist the consumed attempt BEFORE any network effect. A crash may lose
      // a notification attempt, but cannot create an unbounded ninth send.
      this.markAlert(id, {attempts: alert.attempts + 1, nextAttemptAt: Math.max(now, Date.parse(alert.createdAt) + (ALERT_DELAYS_MS[alert.attempts + 1] ?? 0)), status: alert.attempts + 1 >= ALERT_DELAYS_MS.length ? 'exhausted' : 'pending'});
      return {...alert};
    } catch (error) { this.delivering.delete(id); throw error; }
  }
  endAlertAttempt(id: string) { this.delivering.delete(id); }
  retryAlert(id: string) {
    if (this.delivering.has(id)) throw new HostedError('告警正在发送，请稍后重试', 409, 'alert_in_flight');
    const alert = this.state.alerts.find(item => item.id === id);
    if (!alert) throw new HostedError('告警事件不存在', 404, 'alert_missing');
    alert.attempts = 0; alert.status = 'pending'; alert.nextAttemptAt = this.now();
    this.persist();
    this.notifyAlerts();
    return {...alert};
  }
  summary() {
    const day = this.day(); const entry = this.ledger(day);
    return {day, budget: this.limit, confirmed: entry.confirmed, reserved: entry.reserved, blocked: this.failed || entry.blocked === true, scope: 'model-and-search-only', excludes: ['aws', 'other-keys'], alerts: this.alerts().map(({id, day: alertDay, threshold, reason, status, attempts}) => ({id, day: alertDay, threshold, reason, status, attempts}))};
  }
  private validAlert(alert: BudgetAlert) {
    return !!alert && Object.keys(alert).every(key => ['id', 'day', 'threshold', 'budget', 'confirmed', 'reserved', 'reason', 'createdAt', 'attempts', 'nextAttemptAt', 'status'].includes(key)) && /^\d{4}-\d{2}-\d{2}$/.test(alert.day) && alert.id === `${alert.day}:${alert.threshold}` && Number.isFinite(alert.budget) && alert.budget > 0 && alert.budget <= 3 && Number.isFinite(Date.parse(alert.createdAt)) && Number.isFinite(alert.nextAttemptAt) && alert.nextAttemptAt >= 0 && alert.confirmed >= 0 && alert.reserved >= 0 && typeof alert.id === 'string' && /^\d{4}-\d{2}-\d{2}:(50|80|100)$/.test(alert.id) && [50, 80, 100].includes(alert.threshold) && Number.isFinite(alert.confirmed) && Number.isFinite(alert.reserved) && (alert.reason === 'threshold_crossed' || alert.reason === 'request_unaffordable') && ['pending', 'delivered', 'exhausted', 'unconfigured'].includes(alert.status) && Number.isSafeInteger(alert.attempts) && alert.attempts >= 0 && alert.attempts <= 8;
  }
  private persist() { try { atomicJson(this.path, this.state); } catch { this.failed = true; throw new HostedError('额度存储不可用，体验服务已暂停', 503, 'budget_unavailable'); } }
}

