import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {OperationsDashboard} from './OperationsDashboard';
import type {OpsPayload} from './types';

const payload = (channel = 'all', material = 'all'): OpsPayload => ({
  schemaVersion: 1,
  generatedAt: '2026-10-20T12:00:00.000Z',
  admission: {
    generation: 'g', conservativeDefaults: true, measuredCapacity: false,
    slots: {global: 0, inquiry: 0, nonInquiry: 0, translation: 0, capture: 0, limits: {global: 6, nonInquiry: 5, perId: 1, translation: 5, capture: 2}},
    counts: {accepted: 1, busy: 0, rateLimited: 0, acceptedByCategory: {inquiry: 1, translation: 0, capture: 0}, busyByCategory: {inquiry: 0, translation: 0, capture: 0}, rateLimitedByCategory: {inquiry: 0, translation: 0, capture: 0}},
    activeOperations: 0, tombstones: 0, rounds: 0,
  },
  budget: {day: '2026-10-20', budget: 3, confirmed: .1, reserved: .2, blocked: false, scope: 'model-and-search-only', excludes: ['aws'], alerts: []},
  statistics: {
    schemaVersion: 2, generatedAt: '2026-10-20T12:00:00.000Z', range: {from: '2026-10-14', to: '2026-10-20', days: 7, daysWithData: 1},
    filters: {channel, material}, hasData: true,
    counts: {answer_complete: 7, result_saved: 3, bookmark_saved: 2},
    reach: {visit_started: 10, material_opened: 9, ai_started: 8, ai_completed: 7, result_saved: 3},
    funnel: {visit_started: 10, material_opened: 9, ai_started: 8, ai_completed: 7, result_saved: 3},
    conversions: [{from: 'ai_started', to: 'ai_completed', count: 7, denominator: 8, rate: 87.5}],
    conversionsAvailable: true, conversionsNote: 'note', discarded: 0,
    v1: {present: true, days: 2, note: 'v1 note'}, note: 'v2 note',
  },
  budgetError: null, statisticsError: null,
  health: {
    schemaVersion: 1, startedAt: Date.parse('2026-10-20T12:00:00Z'), windowMs: 60000, maxSamples: 60, staleAfterMs: 120000,
    process: {source: 'node', latest: {observedAt: Date.parse('2026-10-20T12:00:00Z'), uptimeSeconds: 60, rssBytes: 100 * 1024 ** 2, heapUsedBytes: 20 * 1024 ** 2, heapTotalBytes: 30 * 1024 ** 2, cpuPercent: 3.2, eventLoopDelayMeanMs: 1.2, eventLoopDelayMaxMs: 4}, historyCount: 1, ageMs: 0, stale: false, status: {cpu: 'ok', memory: 'ok', eventLoop: 'ok'}},
    host: {platform: 'linux', supported: true, visibility: 'host-or-vm', latest: {observedAt: Date.parse('2026-10-20T12:00:00Z'), cpuPercent: 12.3, memoryAvailableBytes: 8 * 1024 ** 3, memoryTotalBytes: 16 * 1024 ** 3, diskAvailableBytes: 50 * 1024 ** 3, diskTotalBytes: 100 * 1024 ** 3, diskUsedPercent: 50}, historyCount: 1, ageMs: 0, stale: false, status: {cpu: 'ok', memory: 'ok', disk: 'ok'}, note: 'host note'},
    requests: {
      terminal: {
        inquiry: {terminal: {success: 2, failed: 0, cancelled: 0, timedOut: 0}, durations: {samples: 2, buckets: [], p95: {approximate: true, label: '≤500ms', upperBoundMs: 500, over90Seconds: false}}},
        translation: {terminal: {success: 0, failed: 0, cancelled: 0, timedOut: 0}, durations: {samples: 0, buckets: [], p95: null}},
        capture: {terminal: {success: 0, failed: 0, cancelled: 0, timedOut: 0}, durations: {samples: 0, buckets: [], p95: null}},
      },
      sinceStartedAt: Date.parse('2026-10-20T12:00:00Z'), note: 'request note',
    },
  },
});

const response = (value: OpsPayload) => ({ok: true, status: 200, headers: {get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null}, json: async () => value}) as unknown as Response;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('operations dashboard interaction states', () => {
  it('renders connected product and health values with units and read-only wording', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(payload())));
    await act(async () => { root.render(<OperationsDashboard />); await Promise.resolve(); await Promise.resolve(); });
    expect(host.textContent).toContain('已连接 · 只读');
    expect(host.textContent).toContain('回答完成');
    expect(host.textContent).toContain('7');
    expect(host.textContent).toContain('$0.1000');
    expect(host.textContent).toContain('16.0 GiB');
    expect(host.textContent).toContain('8.0 GiB');
    expect(host.textContent).toContain('总槽 6');
    expect(host.textContent).toContain('不显示为正常或 0');
  });

  it('keeps the last successful values when a scheduled refresh fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(payload()))
      .mockRejectedValueOnce(new Error('tunnel closed'));
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => { root.render(<OperationsDashboard />); await Promise.resolve(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(16_000); await Promise.resolve(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('tunnel closed');
    expect(host.textContent).toContain('回答完成');
    expect(host.textContent).toContain('7');
  });

  it('pauses queued refresh while hidden and resumes on visibility after the window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    let visible: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible);
    const fetchMock = vi.fn(async () => response(payload()));
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => { root.render(<OperationsDashboard />); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    visible = 'hidden';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    visible = 'visible';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still waits for the 15-second window when returning to the foreground early', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    let visible: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible);
    const fetchMock = vi.fn(async () => response(payload()));
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => { root.render(<OperationsDashboard />); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    visible = 'hidden';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    visible = 'visible';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(14_000); await Promise.resolve(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not send a queued auto refresh for an invalid date range', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    const fetchMock = vi.fn(async () => response(payload()));
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => { root.render(<OperationsDashboard />); await Promise.resolve(); await Promise.resolve(); });
    const from = host.querySelector('#from-date') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setValue.call(from, '2026-12-31'); from.dispatchEvent(new Event('input', {bubbles: true})); from.dispatchEvent(new Event('change', {bubbles: true})); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('开始日期不能晚于结束日期');
    await act(async () => { await vi.advanceTimersByTimeAsync(16_000); await Promise.resolve(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('routes the recent 7-day shortcut through the same refresh limiter', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    const fetchMock = vi.fn(async () => response(payload()));
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => { root.render(<OperationsDashboard />); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { (host.querySelector('.ops-quiet') as HTMLButtonElement).click(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(16_000); await Promise.resolve(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('queues filter changes, sends the latest after the window, and discards the late old response', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    let resolveDirect: (value: Response) => void = () => undefined;
    const directPending = new Promise<Response>(resolve => { resolveDirect = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(payload('all')))
      .mockReturnValueOnce(directPending)
      .mockResolvedValueOnce(response(payload('direct', 'pdf')));
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => { root.render(<OperationsDashboard />); await Promise.resolve(); await Promise.resolve(); });
    const channel = host.querySelectorAll('select')[0] as HTMLSelectElement;
    await act(async () => { channel.value = 'direct'; channel.dispatchEvent(new Event('change', {bubbles: true})); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(16_000); await Promise.resolve(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const material = host.querySelectorAll('select')[1] as HTMLSelectElement;
    await act(async () => { material.value = 'pdf'; material.dispatchEvent(new Event('change', {bubbles: true})); await Promise.resolve(); });
    await act(async () => { resolveDirect(response(payload('direct'))); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(16_000); await Promise.resolve(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(host.textContent).toContain('直接访问 / PDF');
    expect(host.textContent).not.toContain('直接访问 / 全部材料');
  });
});
