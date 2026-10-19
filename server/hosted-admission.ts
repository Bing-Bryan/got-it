import {randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import type {Request} from 'express';
import {HostedError} from './hosted-budget';

/** Conservative defaults pending the isolated load check. Not a measured capacity. */
export const ADMISSION_LIMITS = {
  globalSlots: 3,
  perIdSlots: 1,
  translationSlots: 2,
  captureSlots: 2,
  expensive: {global: 30, ip: 10, id: 3, windowMs: 60_000},
  statistics: {global: 120, ip: 30, windowMs: 60_000},
  control: {global: 120, ip: 60, windowMs: 60_000},
  maxKeys: 10_000,
  tombstoneMs: 10 * 60_000,
  tombstoneMax: 1024,
  roundMs: 10 * 60_000,
  roundMax: 256,
  busyRetryAfter: 5,
} as const;

export type AdmissionCategory = 'inquiry' | 'translation' | 'capture';
const CLIENT_IP_HEADER = 'x-gotit-client-ip';

interface Bucket { tokens: number; updated: number }
interface Tombstone { hash: string; expires: number; category: AdmissionCategory }
interface RoundToken { owner: string; expires: number; busy: boolean }

export interface AdmissionLease {
  track<T>(work: Promise<T>): Promise<T>;
  hasWork(): boolean;
  releaseNow(): void;
  settle(): Promise<void>;
}

export interface AdmissionOptions {
  generation?: string;
  clock?: () => number;
  /** Process start uses 1 token. Tests of unrelated behavior may start at capacity. */
  initialTokens?: number | 'capacity';
  trustedProxy?: boolean;
}

function loopback(address: string | undefined) {
  if (!address) return false;
  const host = address.replace(/^::ffff:/, '');
  return host === '127.0.0.1' || host === '::1';
}

function singleIp(value: string) {
  if (!value || /[\s,]/.test(value) || value.length > 64) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return value.split('.').every(part => Number(part) <= 255);
  return /^[0-9a-f:]+$/i.test(value) && value.includes(':');
}

export class HostedAdmission {
  readonly generation: string;
  private clock: () => number;
  private initial: number | 'capacity';
  readonly trustedProxy: boolean;
  private globalSlots = 0;
  private translationSlots = 0;
  private captureSlots = 0;
  private idSlots = new Map<string, number>();
  private expensiveGlobal: Bucket;
  private statisticsGlobal: Bucket;
  private controlGlobal: Bucket;
  private expensiveIp = new Map<string, Bucket>();
  private expensiveId = new Map<string, Bucket>();
  private statisticsIp = new Map<string, Bucket>();
  private controlIp = new Map<string, Bucket>();
  private active = new Map<string, {hash: string; category: AdmissionCategory}>();
  private tombstones = new Map<string, Tombstone>();
  private rounds = new Map<string, RoundToken>();
  private counts = {accepted: 0, busy: 0, rateLimited: 0, trustedIp: 0, upgradeRequired: 0, stale: 0, expired: 0, conflict: 0, inProgress: 0, capacity: 0, cancelled: 0, timedOut: 0};

  constructor(private options: AdmissionOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.generation = options.generation ?? randomUUID();
    this.initial = options.initialTokens ?? 1;
    this.trustedProxy = options.trustedProxy === true;
    const now = this.clock();
    this.expensiveGlobal = this.fresh(ADMISSION_LIMITS.expensive.global, now);
    this.statisticsGlobal = this.fresh(ADMISSION_LIMITS.statistics.global, now);
    this.controlGlobal = {tokens: ADMISSION_LIMITS.control.global, updated: now};
  }

  private fresh(capacity: number, now: number): Bucket {
    const tokens = this.initial === 'capacity' ? capacity : Math.min(capacity, this.initial);
    return {tokens, updated: now};
  }

  private refill(bucket: Bucket, capacity: number, windowMs: number, now: number) {
    const gained = (now - bucket.updated) * (capacity / windowMs);
    bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, gained));
    bucket.updated = now;
  }

  private sweep(map: Map<string, Bucket>, windowMs: number, now: number) {
    for (const [key, bucket] of map) if (now - bucket.updated >= windowMs) map.delete(key);
  }

  private take(bucket: Bucket, capacity: number, windowMs: number, now: number) {
    this.refill(bucket, capacity, windowMs, now);
    if (bucket.tokens >= 1) { bucket.tokens -= 1; return 0; }
    return Math.max(1, Math.ceil((1 - bucket.tokens) * (windowMs / capacity) / 1000));
  }

  private keyed(map: Map<string, Bucket>, key: string, capacity: number, windowMs: number, now: number) {
    this.sweep(map, windowMs, now);
    let bucket = map.get(key);
    if (!bucket) {
      if (map.size >= ADMISSION_LIMITS.maxKeys) throw new HostedError('短时请求过多，请稍后再试', 429, 'rate_limited', 60);
      bucket = this.fresh(capacity, now);
      map.set(key, bucket);
    }
    return this.take(bucket, capacity, windowMs, now);
  }

  private limited(retryAfter: number) {
    this.counts.rateLimited += 1;
    throw new HostedError('操作过于频繁，请稍后再试', 429, 'rate_limited', retryAfter);
  }

  clientIp(req: Request, required: boolean, operation: 'import'|'model' = 'model') {
    const header = req.get(CLIENT_IP_HEADER);
    const forged = req.get('x-forwarded-for');
    if (!this.trustedProxy) {
      this.counts.trustedIp += 1;
      if (required) throw new HostedError(operation==='import'?'体验入口未配置可信代理，暂时无法导入材料':'体验入口未配置可信代理，暂时无法执行模型请求', 503, 'trusted_proxy_unconfigured');
      return forged ? undefined : 'untrusted';
    }
    if (!loopback(req.socket.remoteAddress)) {
      this.counts.trustedIp += 1;
      if (required || forged || header) throw new HostedError('直连请求不能伪造转发地址', 403, 'untrusted_client');
      return undefined;
    }
    // X-Forwarded-For is never an identity, even when a client changes it.
    if (header === undefined || header === '' || !singleIp(header)) {
      this.counts.trustedIp += 1;
      if (required) throw new HostedError('缺少可信客户端地址', 403, 'trusted_ip_required');
      return 'untrusted';
    }
    return header.replace(/^::ffff:/, '');
  }

  private wait(bucket: Bucket, capacity: number, windowMs: number, now: number) {
    this.refill(bucket, capacity, windowMs, now);
    if (bucket.tokens >= 1) return 0;
    return Math.max(1, Math.ceil((1 - bucket.tokens) * (windowMs / capacity) / 1000));
  }

  private bucketFor(map: Map<string, Bucket>, key: string, capacity: number, windowMs: number, now: number, start = this.initial === 'capacity' ? capacity : Math.min(capacity, this.initial)) {
    this.sweep(map, windowMs, now);
    let bucket = map.get(key);
    if (!bucket) {
      if (map.size >= ADMISSION_LIMITS.maxKeys) throw new HostedError('短时请求过多，请稍后再试', 429, 'rate_limited', 60);
      bucket = {tokens: start, updated: now};
      map.set(key, bucket);
    }
    return bucket;
  }

  private consume(bucket: Bucket) { bucket.tokens -= 1; }

  takeExpensive(id: string, ip: string, exemptId = false) {
    const now = this.clock();
    const global = this.expensiveGlobal;
    const ipBucket = this.bucketFor(this.expensiveIp, ip, ADMISSION_LIMITS.expensive.ip, ADMISSION_LIMITS.expensive.windowMs, now);
    const idBucket = exemptId ? undefined : this.bucketFor(this.expensiveId, id, ADMISSION_LIMITS.expensive.id, ADMISSION_LIMITS.expensive.windowMs, now);
    const retry = this.wait(global, ADMISSION_LIMITS.expensive.global, ADMISSION_LIMITS.expensive.windowMs, now)
      || this.wait(ipBucket, ADMISSION_LIMITS.expensive.ip, ADMISSION_LIMITS.expensive.windowMs, now)
      || (idBucket ? this.wait(idBucket, ADMISSION_LIMITS.expensive.id, ADMISSION_LIMITS.expensive.windowMs, now) : 0);
    if (retry) this.limited(retry);
    this.consume(global);
    this.consume(ipBucket);
    if (idBucket) this.consume(idBucket);
  }

  takeStatistics(ip: string) {
    const now = this.clock();
    const global = this.take(this.statisticsGlobal, ADMISSION_LIMITS.statistics.global, ADMISSION_LIMITS.statistics.windowMs, now);
    if (global) this.limited(global);
    const ipWait = this.keyed(this.statisticsIp, ip, ADMISSION_LIMITS.statistics.ip, ADMISSION_LIMITS.statistics.windowMs, now);
    if (ipWait) this.limited(ipWait);
  }

  takeControl(ip: string) {
    const now = this.clock();
    const ipBucket = this.bucketFor(this.controlIp, ip, ADMISSION_LIMITS.control.ip, ADMISSION_LIMITS.control.windowMs, now, ADMISSION_LIMITS.control.ip);
    const retry = this.wait(this.controlGlobal, ADMISSION_LIMITS.control.global, ADMISSION_LIMITS.control.windowMs, now)
      || this.wait(ipBucket, ADMISSION_LIMITS.control.ip, ADMISSION_LIMITS.control.windowMs, now);
    if (retry) this.limited(retry);
    this.consume(this.controlGlobal);
    this.consume(ipBucket);
  }

  requireGeneration(header: string | undefined) {
    if (!header) { this.counts.upgradeRequired += 1; throw new HostedError('请刷新页面后再继续。已有内容和草稿仍保留，不会自动重发。', 409, 'upgrade_required'); }
    if (header !== this.generation) { this.counts.stale += 1; throw new HostedError('服务已重启，上次操作结果未知。请刷新后主动重试，不会自动重新发送。', 409, 'operation_stale'); }
  }

  private busy() {
    this.counts.busy += 1;
    throw new HostedError('当前体验请求较多，请稍后重试。已有内容仍可阅读。', 429, 'busy', ADMISSION_LIMITS.busyRetryAfter);
  }

  private fits(category: AdmissionCategory, id: string) {
    if (this.globalSlots >= ADMISSION_LIMITS.globalSlots) return false;
    if ((this.idSlots.get(id) || 0) >= ADMISSION_LIMITS.perIdSlots) return false;
    if (category === 'translation' && this.translationSlots >= ADMISSION_LIMITS.translationSlots) return false;
    if (category === 'capture' && this.captureSlots >= ADMISSION_LIMITS.captureSlots) return false;
    return true;
  }

  preflight(category: AdmissionCategory, id: string) { if (!this.fits(category, id)) this.busy(); }

  acquire(category: AdmissionCategory, id: string): AdmissionLease {
    if (!this.fits(category, id)) this.busy();
    this.globalSlots += 1;
    this.idSlots.set(id, (this.idSlots.get(id) || 0) + 1);
    if (category === 'translation') this.translationSlots += 1;
    if (category === 'capture') this.captureSlots += 1;
    this.counts.accepted += 1;
    const pending = new Set<Promise<unknown>>();
    let settled = false;
    const release = () => {
      if (settled) return;
      settled = true;
      this.globalSlots -= 1;
      const left = (this.idSlots.get(id) || 1) - 1;
      if (left <= 0) this.idSlots.delete(id); else this.idSlots.set(id, left);
      if (category === 'translation') this.translationSlots -= 1;
      if (category === 'capture') this.captureSlots -= 1;
    };
    return {
      track: <T>(work: Promise<T>) => { pending.add(work.then(() => {}, () => {})); return work; },
      hasWork: () => pending.size > 0,
      releaseNow: release,
      settle: async () => { await Promise.allSettled([...pending]); release(); },
    };
  }

  noteCancelled() { this.counts.cancelled += 1; }
  noteTimedOut() { this.counts.timedOut += 1; }

  beginOperation(id: string, hash: string, category: AdmissionCategory) {
    this.sweepTombstones();
    const current = this.active.get(id);
    if (current) {
      this.counts.inProgress += 1;
      throw new HostedError(current.hash === hash ? '已有相同操作正在处理，不会再次发送' : '操作标识已用于其他内容', 409, current.hash === hash ? 'operation_in_progress' : 'operation_conflict');
    }
    const done = this.tombstones.get(id);
    if (done) {
      this.counts.expired += 1;
      throw new HostedError('操作已过期，结果未知。请主动重新发起，不会自动重新发送。', 409, 'operation_expired');
    }
    if (this.tombstones.size + this.active.size >= ADMISSION_LIMITS.tombstoneMax) {
      this.counts.capacity += 1;
      throw new HostedError('操作记录已满，请稍后重试', 429, 'operation_capacity');
    }
    this.active.set(id, {hash, category});
  }

  abandonOperation(id: string) { this.active.delete(id); }

  finishOperation(id: string, hash: string, category: AdmissionCategory) {
    this.active.delete(id);
    if (this.tombstones.size >= ADMISSION_LIMITS.tombstoneMax && !this.tombstones.has(id)) return;
    this.tombstones.set(id, {hash, category, expires: this.clock() + ADMISSION_LIMITS.tombstoneMs});
  }

  operationState(id: string) {
    this.sweepTombstones();
    if (this.active.has(id)) return 'active' as const;
    const done = this.tombstones.get(id);
    if (!done) return 'new' as const;
    return this.clock() < done.expires ? 'recent' as const : 'expired' as const;
  }

  private sweepTombstones() {
    const now = this.clock();
    for (const [id, done] of this.tombstones) if (done.expires <= now) this.tombstones.delete(id);
  }

  validateTransportId(value: string | undefined) {
    if (!value || !/^\d{13}_[0-9a-f-]{36}$/i.test(value)) throw new HostedError('请刷新页面后再继续。已有内容和草稿仍保留，不会自动重发。',409,'upgrade_required');
    const created = Number(value.slice(0,13));
    if (created > this.clock() + 60_000 || this.clock() - created >= ADMISSION_LIMITS.tombstoneMs) throw new HostedError('操作已过期，结果未知。请主动重新发起，不会自动重新发送。',409,'operation_expired');
    return value;
  }

  claimRound(owner: string, token: string) {
    this.sweepRounds();
    const round = this.rounds.get(token);
    if (!round || round.owner !== owner || round.expires <= this.clock() || round.busy) return false;
    round.busy = true;
    return true;
  }

  releaseRound(token: string) { const round = this.rounds.get(token); if (round) round.busy = false; }

  issueRound(owner: string) {
    this.sweepRounds();
    if (this.rounds.size >= ADMISSION_LIMITS.roundMax) throw new HostedError('翻译轮次已满，请稍后重试', 429, 'round_capacity');
    const token = randomBytes(32).toString('hex');
    this.rounds.set(token, {owner, expires: this.clock() + ADMISSION_LIMITS.roundMs, busy: false});
    return token;
  }

  private sweepRounds() { const now = this.clock(); for (const [token, round] of this.rounds) if (round.expires <= now && !round.busy) this.rounds.delete(token); }

  snapshot() {
    return {
      generation: this.generation,
      conservativeDefaults: true,
      measuredCapacity: false,
      slots: {global: this.globalSlots, translation: this.translationSlots, capture: this.captureSlots, limits: {global: ADMISSION_LIMITS.globalSlots, perId: ADMISSION_LIMITS.perIdSlots, translation: ADMISSION_LIMITS.translationSlots, capture: ADMISSION_LIMITS.captureSlots}},
      activeOperations: this.active.size,
      tombstones: this.tombstones.size,
      rounds: this.rounds.size,
      rateKeys: {expensiveIp: this.expensiveIp.size, expensiveId: this.expensiveId.size, statisticsIp: this.statisticsIp.size},
      counts: {...this.counts},
    };
  }
}

export function sameSecret(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
