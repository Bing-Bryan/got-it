// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {cpuPercentFrom, diskFromStat, HEALTH_MAX_SAMPLES, HostedHealth, parseMeminfo, parseProcStat, readHostSample} from './hosted-health';

const stat = (user: number, system: number, idle: number) => `cpu  ${user} 0 ${system} ${idle} 0 0 0 0 0 0\ncpu0 1 2 3 4 5 6 7 8 9 10\n`;
const meminfo = 'MemTotal: 2048000 kB\nMemFree: 100000 kB\nMemAvailable: 1536000 kB\nBuffers: 1000 kB\n';
const fakeStatfs = (_path: string) => ({bsize: 4096, blocks: 1000, bfree: 400, bavail: 300});

describe('Linux host source parsing', () => {
  it('computes whole-machine CPU from consecutive /proc/stat counters', () => {
    const first = parseProcStat(stat(100, 50, 850));
    const second = parseProcStat(stat(200, 100, 1700));
    expect(first).toEqual({total: 1000, idle: 850});
    expect(second).toEqual({total: 2000, idle: 1700});
    expect(cpuPercentFrom(first!, second!)).toBe(15);
    expect(cpuPercentFrom(second!, first!)).toBeNull();
  });

  it('reads MemAvailable rather than MemFree and rejects incomplete memory data', () => {
    expect(parseMeminfo(meminfo)).toEqual({totalBytes: 2048000 * 1024, availableBytes: 1536000 * 1024});
    expect(parseMeminfo('MemTotal: 2048000 kB\nMemFree: 1024 kB\n')).toBeNull();
    expect(parseMeminfo('MemAvailable: 2048001 kB\nMemTotal: 2048000 kB\n')).toBeNull();
  });

  it('reads the data mount and reports usage without exposing its path', () => {
    expect(diskFromStat({bsize: 4096, blocks: 1000, bfree: 400, bavail: 300})).toEqual({totalBytes: 4096000, availableBytes: 1228800, usedPercent: 60});
    expect(diskFromStat({bsize: 0, blocks: 0, bfree: 0, bavail: 0})).toBeNull();
  });

  it('keeps a readable source independent when another Linux source is unavailable', () => {
    let calls = 0;
    const first = readHostSample('/data', () => 1_000, null, {
      platform: 'linux', container: true,
      readText: path => {
        calls += 1;
        if (path === '/proc/stat') return stat(100, 50, 850);
        if (path === '/proc/meminfo') return meminfo;
        throw new Error('unexpected path');
      },
      statfs: fakeStatfs,
    });
    expect(first.read).toMatchObject({cpuStatus: 'waiting', memoryStatus: 'ok', diskStatus: 'ok', visibility: 'container-visible'});
    const second = readHostSample('/data', () => 61_000, first.cpuRaw, {
      platform: 'linux', container: false,
      readText: path => {
        if (path === '/proc/stat') return stat(200, 100, 1700);
        if (path === '/proc/meminfo') throw new Error('denied');
        return '';
      },
      statfs: fakeStatfs,
    });
    expect(second.read).toMatchObject({cpuStatus: 'ok', cpuPercent: 15, memoryStatus: 'unavailable', diskStatus: 'ok', visibility: 'host-or-vm'});
    expect(second.sample.memoryAvailableBytes).toBeNull();
    expect(second.sample.diskUsedPercent).toBe(60);
    expect(calls).toBe(2);
  });

  it('marks non-Linux as unsupported instead of inventing host values', () => {
    const result = readHostSample('/data', () => 1_000, null, {platform: 'darwin', readText: () => { throw new Error('must not read /proc'); }, statfs: fakeStatfs});
    expect(result.read).toMatchObject({cpuStatus: 'unsupported', memoryStatus: 'unsupported', diskStatus: 'unsupported', visibility: 'unsupported'});
    expect(result.sample).toMatchObject({cpuPercent: null, memoryAvailableBytes: null, diskAvailableBytes: null});
  });
});

describe('bounded health aggregation', () => {
  it('shows waiting and no p95 with zero samples, then approximate bucket-bound p95 and overflow', () => {
    let now = 1_000;
    const health = new HostedHealth({clock: () => now, platform: 'darwin', monitor: null});
    expect(health.snapshot().requests.terminal.inquiry.durations.p95).toBeNull();
    expect(health.snapshot().requests.terminal.inquiry.durations.samples).toBe(0);
    for (let i = 0; i < 20; i += 1) {
      const finish = health.observeRequest('inquiry', now);
      now += 200;
      finish('success');
    }
    const report = health.snapshot().requests.terminal.inquiry;
    expect(report.terminal.success).toBe(20);
    expect(report.durations.samples).toBe(20);
    expect(report.durations.p95).toEqual({approximate: true, label: '≤500ms', upperBoundMs: 500, over90Seconds: false});
    const slowStart = now;
    const slow = health.observeRequest('capture', slowStart);
    now += 100_000;
    slow('timedOut');
    expect(health.snapshot().requests.terminal.capture).toMatchObject({terminal: {timedOut: 1}, durations: {p95: {label: '>90s', upperBoundMs: null, over90Seconds: true}}});
  });

  it('is idempotent, keeps categories separate, and starts a fresh process window', () => {
    let now = 10_000;
    const health = new HostedHealth({clock: () => now, platform: 'darwin', monitor: null});
    const finish = health.observeRequest('translation', now);
    now += 1_200;
    finish('cancelled');
    finish('success');
    expect(health.snapshot().requests.terminal.translation.terminal).toEqual({success: 0, failed: 0, cancelled: 1, timedOut: 0});
    expect(health.snapshot().requests.terminal.inquiry.terminal).toEqual({success: 0, failed: 0, cancelled: 0, timedOut: 0});
    expect(health.snapshot().startedAt).toBe(10_000);
  });

  it('starts a new process window without inheriting old samples or a fake CPU value', () => {
    let now = 50_000;
    const first = new HostedHealth({clock: () => now, platform: 'darwin', monitor: null});
    expect(first.snapshot().startedAt).toBe(50_000);
    expect(first.snapshot().process).toMatchObject({historyCount: 1, status: {cpu: 'waiting'}});
    expect(first.snapshot().process.latest?.cpuPercent).toBeNull();
    first.close();
    now += 60_000;
    const restarted = new HostedHealth({clock: () => now, platform: 'darwin', monitor: null});
    expect(restarted.snapshot().startedAt).toBe(110_000);
    expect(restarted.snapshot().process).toMatchObject({historyCount: 1, status: {cpu: 'waiting'}});
    expect(restarted.snapshot().process.latest?.observedAt).toBe(110_000);
    restarted.close();
  });

  it('bounds process and host history to 60 samples and marks old samples stale without refreshing them', () => {
    let now = 20_000;
    const hostSampler = () => ({
      sample: {observedAt: now, cpuPercent: 12.5, memoryAvailableBytes: 100, memoryTotalBytes: 200, diskAvailableBytes: 300, diskTotalBytes: 400, diskUsedPercent: 25},
      read: {cpuPercent: 12.5, cpuStatus: 'ok' as const, memoryAvailableBytes: 100, memoryTotalBytes: 200, memoryStatus: 'ok' as const, diskAvailableBytes: 300, diskTotalBytes: 400, diskUsedPercent: 25, diskStatus: 'ok' as const, visibility: 'host-or-vm' as const},
      cpuRaw: {total: 1, idle: 1},
    });
    const health = new HostedHealth({clock: () => now, platform: 'linux', monitor: null, hostSampler});
    for (let i = 0; i < 70; i += 1) { now += 60_000; health.sampleNow(); }
    expect(health.snapshot().process.historyCount).toBe(HEALTH_MAX_SAMPLES);
    expect(health.snapshot().host.historyCount).toBe(HEALTH_MAX_SAMPLES);
    expect(health.snapshot().host.stale).toBe(false);
    now += 120_001;
    expect(health.snapshot().host).toMatchObject({stale: true, ageMs: 120_001, latest: {cpuPercent: 12.5}});
    expect(health.snapshot().process.stale).toBe(true);
  });

  it('treats a non-finite event-loop monitor value as waiting instead of rendering NaN', () => {
    let now = 40_000;
    const monitor = {mean: Number.NaN, max: Number.NaN, reset: () => undefined};
    const health = new HostedHealth({clock: () => now, platform: 'darwin', monitor: monitor as never});
    now += 5_000;
    health.sampleNow();
    const latest = health.snapshot().process.latest;
    expect(latest?.eventLoopDelayMeanMs).toBeNull();
    expect(latest?.eventLoopDelayMaxMs).toBeNull();
    expect(health.snapshot().process.status.eventLoop).toBe('waiting');
  });

  it('marks an unavailable host sampler without throwing or changing process health', () => {
    let now = 30_000;
    const health = new HostedHealth({
      clock: () => now,
      platform: 'linux',
      monitor: null,
      hostSampler: () => { throw new Error('permission denied'); },
    });
    const snapshot = health.snapshot();
    expect(snapshot.process.latest).not.toBeNull();
    expect(snapshot.host.status).toEqual({cpu: 'unavailable', memory: 'unavailable', disk: 'unavailable'});
    expect(snapshot.host.latest).toBeNull();
    expect(snapshot.host.stale).toBe(true);
  });
});
