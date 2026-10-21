// @vitest-environment node
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {HostedStatistics, USAGE_COUNTS, USAGE_FUNNEL} from './hosted-statistics';

const now = Date.parse('2026-10-20T12:00:00.000Z');
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true}); });
let batchNumber = 0;
const empty = (keys: readonly string[]) => Object.fromEntries(keys.map(key => [key, 0]));
function operation(overrides: Record<string, unknown> = {}) {
  return {
    operationId: `12345678-1234-4123-8123-${String(++batchNumber).padStart(12, '0')}`,
    startedAt: '2026-10-20T11:30:00.000Z',
    outcome: 'success',
    attempts: 1,
    recovered: false,
    errorCategory: null,
    ...overrides,
  };
}
function batch(operations: Record<string, unknown>[] = [], overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 3,
    batchId: `22345678-1234-4123-8123-${String(++batchNumber).padStart(12, '0')}`,
    createdAt: '2026-10-20T11:45:00.000Z',
    channel: 'direct',
    material: 'web',
    counts: {...empty(USAGE_COUNTS), import_started: 1},
    reach: empty(USAGE_FUNNEL),
    funnel: empty(USAGE_FUNNEL),
    discarded: 0,
    importOperations: operations,
    ...overrides,
  };
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gotit-import-ops-'));
  dirs.push(dir);
  return {dir, path: join(dir, 'stats.json')};
}

describe('hosted import operation statistics', () => {
  it('keeps v2 event counts separate and aggregates final operation outcomes', () => {
    const f = fixture();
    const stats = new HostedStatistics(f.path, () => now);
    const result = stats.acceptBatch(batch([
      operation({outcome: 'success'}),
      operation({outcome: 'failed', errorCategory: 'timeout'}),
      operation({outcome: 'cancelled'}),
      operation({outcome: 'expired'}),
      operation({outcome: 'success', attempts: 2, recovered: true, errorCategory: 'network'}),
    ]));
    expect(result).toEqual({accepted: true, duplicate: false});
    const report = stats.report({from: '2026-10-20', to: '2026-10-20', channel: 'direct', material: 'web'});
    expect(report.counts.import_started).toBe(1);
    expect(report.importOperations).toMatchObject({
      schemaVersion: 1,
      hasData: true,
      daysWithData: 1,
      totals: {success: 2, existing: 0, failed: 1, cancelled: 1, expired: 1, recovered: 1, retried: 1},
      errors: {timeout: 1, network: 1},
    });
    expect(JSON.stringify(report)).not.toContain('12345678-1234-4123-8123');
  });

  it('drops only an aged operation while accepting the batch and its other events', () => {
    const f = fixture();
    const stats = new HostedStatistics(f.path, () => now);
    const stale = operation({startedAt: new Date(now - 48 * 60 * 60 * 1000 - 1).toISOString(), outcome: 'failed', errorCategory: 'timeout'});
    const fresh = operation({outcome: 'success'});
    const value = batch([stale, fresh], {createdAt: new Date(now - 60_000).toISOString(), counts: {...empty(USAGE_COUNTS), answer_complete: 1}});
    expect(stats.acceptBatch(value)).toEqual({accepted: true, duplicate: false});
    expect(stats.acceptBatch(value)).toEqual({accepted: true, duplicate: true});
    const report = stats.report({from: '2026-10-20', to: '2026-10-20'});
    expect(report.counts.answer_complete).toBe(1);
    expect(report.importOperations.totals.failed).toBe(0);
    expect(report.importOperations.totals.success).toBe(1);
  });

  it('does not delete or recompute historical v2 event counts when v3 operations arrive', () => {
    const f = fixture();
    const {writeFileSync} = require('node:fs');
    writeFileSync(f.path + '.v2', JSON.stringify({version: 2, days: {'2026-10-19': {'direct:web:import_failed': 12, 'direct:web:import_started': 15}}, receipts: [], operations: {}, operationReceipts: []}));
    const stats = new HostedStatistics(f.path, () => now);
    stats.acceptBatch(batch([operation({outcome: 'success'})]));
    const report = stats.report({from: '2026-10-14', to: '2026-10-20'});
    expect(report.counts.import_failed).toBe(12);
    expect(report.counts.import_started).toBe(16);
    expect(report.importOperations.totals.success).toBe(1);
    expect(report.importOperations.totals.failed).toBe(0);
  });

  it('deduplicates the same operation across different acknowledged batches', () => {
    const f = fixture();
    const stats = new HostedStatistics(f.path, () => now);
    const op = operation({outcome: 'failed', errorCategory: 'network'});
    stats.acceptBatch(batch([op], {batchId: '32345678-1234-4123-8123-000000000001'}));
    stats.acceptBatch(batch([op], {batchId: '32345678-1234-4123-8123-000000000002'}));
    const report = stats.report({from: '2026-10-20', to: '2026-10-20'});
    expect(report.importOperations.totals.failed).toBe(1);
    expect(report.importOperations.errors.network).toBe(1);
    expect(report.counts.import_started).toBe(2);
  });

  it('retains the first terminal result if a duplicate operation changes outcome', () => {
    const f = fixture();
    const stats = new HostedStatistics(f.path, () => now);
    const op = operation({outcome: 'failed', errorCategory: 'timeout'});
    stats.acceptBatch(batch([op], {batchId: '42345678-1234-4123-8123-000000000001'}));
    stats.acceptBatch(batch([{...op, outcome: 'success', attempts: 2, recovered: true, errorCategory: 'timeout'}], {batchId: '42345678-1234-4123-8123-000000000002'}));
    const report = stats.report({from: '2026-10-20', to: '2026-10-20'});
    expect(report.importOperations.totals.failed).toBe(1);
    expect(report.importOperations.totals.success).toBe(0);
  });

  it('deduplicates ACK retries without changing the wire batch idempotency', () => {
    const f = fixture();
    const stats = new HostedStatistics(f.path, () => now);
    const value = batch([operation()]);
    expect(stats.acceptBatch(value)).toEqual({accepted: true, duplicate: false});
    expect(stats.acceptBatch(value)).toEqual({accepted: true, duplicate: true});
    expect(stats.report({from: '2026-10-20', to: '2026-10-20'}).importOperations.totals.success).toBe(1);
  });

  it('attributes a cross-day operation to its UTC start day', () => {
    const f = fixture();
    const stats = new HostedStatistics(f.path, () => now);
    stats.acceptBatch(batch([operation({startedAt: '2026-10-19T23:59:00.000Z', outcome: 'success'})], {createdAt: '2026-10-20T00:01:00.000Z'}));
    const raw = JSON.parse(readFileSync(f.path + '.v2', 'utf8'));
    expect(raw.operations['2026-10-19']['direct:web:final:success']).toBe(1);
    expect(raw.operations['2026-10-20']).toBeUndefined();
  });

  it('rejects unknown fields, unknown categories and non-web operation batches without mutating v2 counts', () => {
    const f = fixture();
    const stats = new HostedStatistics(f.path, () => now);
    expect(() => stats.acceptBatch({...batch([operation()]), secret: 'x'})).toThrow('统计批次格式无效');
    expect(() => stats.acceptBatch(batch([operation({errorCategory: 'raw error text'})]))).toThrow('统计批次格式无效');
    expect(() => stats.acceptBatch(batch([operation()], {material: 'markdown'}))).toThrow('统计批次格式无效');
    expect(stats.report({from: '2026-10-20', to: '2026-10-20'}).counts.import_started).toBe(0);
  });

  it('fails closed if stored operation counts are corrupt', () => {
    const f = fixture();
    statsFile(f.path);
    const stats = new HostedStatistics(f.path, () => now);
    expect(() => stats.report()).toThrow(expect.objectContaining({code: 'statistics_corrupt'}));
    function statsFile(path: string) {
      const base = batch();
      const file = {version: 2, days: {}, receipts: [], operations: {'2026-10-20': {'direct:web:final:success': 'broken'}}, operationReceipts: []};
      // write a structurally valid v2 file; constructor marks only numeric corruption in days, report catches operations
      require('node:fs').writeFileSync(path + '.v2', JSON.stringify(file));
      void base;
    }
  });
});
