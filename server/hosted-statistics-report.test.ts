// @vitest-environment node
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {HostedStatistics, USAGE_COUNTS, USAGE_FUNNEL} from './hosted-statistics';

const now = Date.parse('2026-10-20T12:00:00.000Z');
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true}); });

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gotit-report-'));
  dirs.push(dir);
  return {dir, path: join(dir, 'stats.json')};
}
let batchNumber = 0;
function batch(overrides: {createdAt?: string; channel?: string; material?: string; counts?: Record<string, number>; reach?: Record<string, number>; funnel?: Record<string, number>} = {}) {
  batchNumber += 1;
  const counts = Object.fromEntries(USAGE_COUNTS.map(key => [key, overrides.counts?.[key] ?? 0]));
  const reach = Object.fromEntries(USAGE_FUNNEL.map(key => [key, overrides.reach?.[key] ?? 0]));
  const funnel = Object.fromEntries(USAGE_FUNNEL.map(key => [key, overrides.funnel?.[key] ?? 0]));
  return {
    schemaVersion: 2,
    batchId: `12345678-1234-4123-8123-${String(batchNumber).padStart(12, '0')}`,
    createdAt: overrides.createdAt ?? '2026-10-20T11:00:00.000Z',
    channel: overrides.channel ?? 'direct',
    material: overrides.material ?? 'markdown',
    counts, reach, funnel, discarded: 0,
  };
}

describe('bounded v2 statistics report', () => {
  it('aggregates the default UTC window and keeps material-filtered funnels and conversions unavailable', () => {
    const f = fixture();
    const stats = new HostedStatistics(f.path, () => now);
    stats.acceptBatch(batch({counts: {answer_complete: 1, result_saved: 1}, reach: {visit_started: 1, material_opened: 1, ai_started: 1, ai_completed: 1, result_saved: 1}, funnel: {visit_started: 1, material_opened: 1, ai_started: 1, ai_completed: 1, result_saved: 1}}));
    stats.acceptBatch(batch({channel: 'xiaohongshu', material: 'pdf', createdAt: '2026-10-19T10:00:00.000Z', counts: {answer_complete: 2, import_success: 1}, reach: {visit_started: 1, material_opened: 1}, funnel: {visit_started: 1}}));
    const report = stats.report();
    expect(report.range).toEqual({from: '2026-10-14', to: '2026-10-20', days: 7, daysWithData: 2});
    expect(report.filters).toEqual({channel: 'all', material: 'all'});
    expect(report.hasData).toBe(true);
    expect(report.counts).toMatchObject({answer_complete: 3, result_saved: 1, import_success: 1});
    expect(report.conversions).toBeNull();
    expect(report.conversionsAvailable).toBe(false);
    const pdf = stats.report({from: '2026-10-14', to: '2026-10-20', channel: 'xiaohongshu', material: 'pdf'});
    expect(pdf.counts.answer_complete).toBe(2);
    expect(pdf.funnel).toBeNull();
    expect(pdf.conversions).toBeNull();
    expect(pdf.conversionsNote).toContain('材料筛选');
    expect(stats.report({channel: 'direct'}).conversions).not.toBeNull();
    const direct = stats.report({channel: 'direct'});
    expect(direct.conversions?.[0]).toEqual({from: 'visit_started', to: 'material_opened', count: 1, denominator: 1, rate: 100});
    expect(direct.conversionsNote).toContain('不是同一批人的精确转换');
  });

  it('returns a real empty window, a zero denominator, and bounded invalid ranges', () => {
    const f = fixture();
    const stats = new HostedStatistics(f.path, () => now);
    const empty = stats.report({from: '2026-10-01', to: '2026-10-02'});
    expect(empty).toMatchObject({hasData: false, range: {days: 2, daysWithData: 0}});
    expect(empty.counts.answer_complete).toBe(0);
    expect(empty.funnel).toEqual(Object.fromEntries(USAGE_FUNNEL.map(key => [key, 0])));
    stats.acceptBatch(batch({counts: {answer_complete: 1}, reach: {visit_started: 1}, funnel: {visit_started: 1}}));
    const zero = stats.report({channel: 'direct'});
    expect(zero.conversions?.[0]).toEqual({from: 'visit_started', to: 'material_opened', count: 0, denominator: 1, rate: 0});
    expect(zero.conversions?.[1]).toMatchObject({from: 'material_opened', to: 'ai_started', denominator: 0, rate: null});
    expect(() => stats.report({from: '2026-09-01', to: '2026-10-20'})).toThrow('31个UTC日');
    expect(() => stats.report({from: '2026-10-21', to: '2026-10-22'})).toThrow('31个UTC日');
    expect(() => stats.report({from: '2026-10-20', to: '2026-10-19'})).toThrow('31个UTC日');
    expect(() => stats.report({channel: 'newsletter'})).toThrow('筛选无效');
    expect(() => stats.report({material: 'epub'})).toThrow('筛选无效');
  });

  it('fails closed on a corrupt v2 count instead of presenting a real-looking zero', () => {
    const f = fixture();
    writeFileSync(f.path + '.v2', JSON.stringify({version: 2, days: {'2026-10-20': {'direct:none:answer_complete': 'broken', 'direct:none:reach:visit_started': 1}}, receipts: []}));
    const stats = new HostedStatistics(f.path, () => now);
    expect(() => stats.report()).toThrow(expect.objectContaining({code: 'statistics_corrupt'}));
    expect(() => stats.acceptBatch(batch())).toThrow(expect.objectContaining({code: 'statistics_corrupt'}));
  });

  it('keeps v1 separate, deduplicates ACKs, and emits no identity or content', () => {
    const f = fixture();
    writeFileSync(f.path, JSON.stringify({version: 1, days: {'2026-10-01': {summaries: 2}, '2026-10-02': {summaries: 1}}}));
    const stats = new HostedStatistics(f.path, () => now);
    const value = batch({counts: {answer_complete: 1, bookmark_saved: 1}});
    expect(stats.acceptBatch(value)).toEqual({accepted: true, duplicate: false});
    expect(stats.acceptBatch(value)).toEqual({accepted: true, duplicate: true});
    const report = stats.report();
    expect(report.v1).toMatchObject({present: true, days: 2});
    expect(report.counts.answer_complete).toBe(1);
    expect(report.counts.bookmark_saved).toBe(1);
    expect(JSON.stringify(report)).not.toContain(value.batchId);
    expect(JSON.stringify(report)).not.toContain('private');
    expect((report.counts as Record<string, number>).summaries).toBeUndefined();
  });
});
