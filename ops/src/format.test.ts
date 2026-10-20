import {describe, expect, it} from 'vitest';
import {defaultQuery, formatAge, formatBytes, formatPercent, formatUsd, p95Text, queryValid, statusLabel, terminalTotal} from './format';

describe('operations dashboard formatting and query bounds', () => {
  it('defaults to seven inclusive UTC days and enforces the 31-day window', () => {
    const now = Date.parse('2026-10-20T12:00:00.000Z');
    expect(defaultQuery(now)).toEqual({from: '2026-10-14', to: '2026-10-20', channel: 'all', material: 'all'});
    expect(queryValid(defaultQuery(now))).toBeNull();
    expect(queryValid({from: '2026-09-19', to: '2026-10-20', channel: 'all', material: 'all'})).toContain('31');
    expect(queryValid({from: '2026-10-21', to: '2026-10-22', channel: 'all', material: 'all'})).toContain('今天');
    expect(queryValid({from: '2026-10-20', to: '2026-10-01', channel: 'all', material: 'all'})).toContain('不能晚于');
  });

  it('renders missing values as unavailable instead of zero', () => {
    expect(formatBytes(null)).toBe('不可用');
    expect(formatPercent(null)).toBe('不可用');
    expect(formatUsd(null)).toBe('不可用');
    expect(formatAge(null)).toBe('无样本');
    expect(p95Text(null)).toBe('无样本');
    expect(statusLabel('waiting')).toBe('等待样本');
    expect(statusLabel('ok', true)).toBe('采样过期');
    expect(statusLabel('unavailable')).toBe('读取失败');
  });

  it('uses readable units and terminal totals', () => {
    expect(formatBytes(1024)).toBe('1.0 KiB');
    expect(formatBytes(8 * 1024 ** 3)).toBe('8.0 GiB');
    expect(formatPercent(12.34)).toBe('12.3%');
    expect(formatUsd(.0042)).toBe('$0.0042');
    expect(formatAge(61_000)).toBe('1 分钟前');
    expect(terminalTotal({success: 1, failed: 2, cancelled: 3, timedOut: 4})).toBe(10);
  });
});
