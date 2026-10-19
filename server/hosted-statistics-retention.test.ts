// @vitest-environment node
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {HostedStatistics, USAGE_COUNTS, USAGE_FUNNEL, USAGE_RECEIPT_MS} from './hosted-statistics';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.useRealTimers(); });
const start = Date.parse('2026-10-19T04:00:00Z');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gotit-receipts-'));
  cleanups.push(() => rmSync(dir, {recursive: true, force: true}));
  return {dir, path: join(dir, 'stats'), v2: join(dir, 'stats.v2')};
}
function batch() {
  return {schemaVersion: 2, batchId: '12345678-1234-4123-8123-123456789012', createdAt: new Date(Date.now()).toISOString(), channel: 'direct', material: 'markdown', counts: Object.fromEntries(USAGE_COUNTS.map(key => [key, key === 'answer_complete' ? 1 : 0])), reach: Object.fromEntries(USAGE_FUNNEL.map(key => [key, 0])), funnel: Object.fromEntries(USAGE_FUNNEL.map(key => [key, 0])), discarded: 0};
}
function saved(path: string) { return JSON.parse(readFileSync(path, 'utf8')); }

describe('statistics receipt on-disk retention', () => {
  it('purges expired receipts on startup, preserves aggregates and schedules remaining expiry', () => {
    vi.useFakeTimers(); vi.setSystemTime(start); const f = fixture();
    writeFileSync(f.v2, JSON.stringify({version: 2, days: {'2026-10-18': {safe: 3}}, receipts: [{hash: hash('expired'), expires: start}, {hash: hash('live'), expires: start + 1000}]}));
    const stats = new HostedStatistics(f.path); cleanups.push(() => stats.close());
    expect(saved(f.v2).receipts).toEqual([{hash: hash('live'), expires: start + 1000}]);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(saved(f.v2)).toEqual({version: 2, days: {'2026-10-18': {safe: 3}}, receipts: []});
    expect(vi.getTimerCount()).toBe(0);
  });

  it('deletes credentials after 48 idle hours without receiving any new batch or summary', () => {
    vi.useFakeTimers(); vi.setSystemTime(start); const f = fixture();
    const stats = new HostedStatistics(f.path); cleanups.push(() => stats.close());
    stats.acceptBatch(batch());
    expect(saved(f.v2).receipts).toHaveLength(1);
    vi.advanceTimersByTime(USAGE_RECEIPT_MS - 1);
    expect(saved(f.v2).receipts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(saved(f.v2).receipts).toEqual([]);
    expect(saved(f.v2).days['2026-10-19']['direct:markdown:answer_complete']).toBe(1);
  });

  it.each(['summary', 'duplicate'] as const)('persists expiration before the %s path even if timer execution was delayed', path => {
    vi.useFakeTimers(); vi.setSystemTime(start); const f = fixture();
    const b = batch();
    writeFileSync(f.v2, JSON.stringify({version: 2, days: {}, receipts: [{hash: hash('expires-soon'), expires: start + 1}, {hash: hash(b.batchId), expires: start + USAGE_RECEIPT_MS}]}));
    const stats = new HostedStatistics(f.path); cleanups.push(() => stats.close());
    vi.setSystemTime(start + 2); // Change clock without running a timer.
    if (path === 'summary') expect(stats.summary().receipts).toBe(1);
    else expect(stats.acceptBatch(b)).toEqual({accepted: true, duplicate: true});
    expect(saved(f.v2).receipts).toEqual([{hash: hash(b.batchId), expires: start + USAGE_RECEIPT_MS}]);
  });

  it('stops timers on close and does not resurrect them on summary', () => {
    vi.useFakeTimers(); vi.setSystemTime(start); const f = fixture();
    const stats = new HostedStatistics(f.path); stats.acceptBatch(batch());
    expect(vi.getTimerCount()).toBe(1); stats.close();
    expect(vi.getTimerCount()).toBe(0); stats.summary(); expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds cleanup retries after disk failure and persists deletion when storage recovers', () => {
    vi.useFakeTimers(); vi.setSystemTime(start); const f = fixture();
    const stats = new HostedStatistics(f.path); cleanups.push(() => stats.close());
    stats.acceptBatch(batch());
    renameSync(f.v2, `${f.v2}.original`); mkdirSync(f.v2);
    expect(() => vi.advanceTimersByTime(USAGE_RECEIPT_MS)).not.toThrow();
    expect(vi.getTimerCount()).toBe(1);
    expect(() => stats.summary()).toThrow('统计暂不可用');
    rmSync(f.v2, {recursive: true}); renameSync(`${f.v2}.original`, f.v2);
    vi.advanceTimersByTime(60_000);
    expect(saved(f.v2).receipts).toEqual([]); expect(vi.getTimerCount()).toBe(0);
  });
});

it('rejects the same batch at exactly 48 hours after receipt expiration',()=>{
 vi.useFakeTimers();vi.setSystemTime(start);const f=fixture();const stats=new HostedStatistics(f.path);cleanups.push(()=>stats.close());const b=batch();stats.acceptBatch(b);vi.advanceTimersByTime(USAGE_RECEIPT_MS);
 expect(()=>stats.acceptBatch(b)).toThrow('统计批次已过期');expect(saved(f.v2).days['2026-10-19']['direct:markdown:answer_complete']).toBe(1);
});
it('rejects future timestamps until the original immutable creation time arrives',()=>{
 vi.useFakeTimers();vi.setSystemTime(start);const f=fixture();const stats=new HostedStatistics(f.path);cleanups.push(()=>stats.close());const b={...batch(),createdAt:new Date(start+60000).toISOString()};
 expect(()=>stats.acceptBatch(b)).toThrow('统计批次创建时间尚未到达');vi.advanceTimersByTime(60000);expect(stats.acceptBatch(b)).toEqual({accepted:true,duplicate:false});
});

it('refuses a new receipt at 50000 without dropping dedupe state or changing aggregates',()=>{
 vi.useFakeTimers();vi.setSystemTime(start);const f=fixture();const receipts=Array.from({length:50000},(_,n)=>({hash:n.toString(16).padStart(64,'0'),expires:start+USAGE_RECEIPT_MS}));writeFileSync(f.v2,JSON.stringify({version:2,days:{},receipts}));const stats=new HostedStatistics(f.path);cleanups.push(()=>stats.close());expect(()=>stats.acceptBatch(batch())).toThrow('统计接收已满');expect(stats.summary().receipts).toBe(50000);expect(saved(f.v2).days).toEqual({});
});

it('keeps the receipt and exact aggregate across a server restart with a lost ACK',()=>{
 vi.useFakeTimers();vi.setSystemTime(start);const f=fixture();const b=batch();const first=new HostedStatistics(f.path);first.acceptBatch(b);first.close();const restarted=new HostedStatistics(f.path);cleanups.push(()=>restarted.close());expect(restarted.acceptBatch(b)).toEqual({accepted:true,duplicate:true});expect(saved(f.v2).days['2026-10-19']['direct:markdown:answer_complete']).toBe(1);
});
