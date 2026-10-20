import {existsSync, readFileSync, statfsSync} from 'node:fs';
import {monitorEventLoopDelay} from 'node:perf_hooks';

type EventLoopMonitor = ReturnType<typeof monitorEventLoopDelay>;
type StatFs = {bsize: number; blocks: number; bfree: number; bavail: number};

export const HEALTH_SAMPLE_MS = 60_000;
export const HEALTH_MAX_SAMPLES = 60;
export const HEALTH_STALE_MS = 120_000;

export type RequestCategory = 'inquiry' | 'translation' | 'capture';
export type RequestOutcome = 'success' | 'failed' | 'cancelled' | 'timedOut';

export const DURATION_BUCKETS = [
  {upperMs: 100, label: '≤100ms'},
  {upperMs: 500, label: '≤500ms'},
  {upperMs: 1_000, label: '≤1s'},
  {upperMs: 5_000, label: '≤5s'},
  {upperMs: 15_000, label: '≤15s'},
  {upperMs: 30_000, label: '≤30s'},
  {upperMs: 60_000, label: '≤60s'},
  {upperMs: 90_000, label: '≤90s'},
  {upperMs: Number.POSITIVE_INFINITY, label: '>90s'},
] as const;

type TerminalCounts = Record<RequestOutcome, number>;
type RequestDurations = {buckets: number[]; samples: number};
const categories: RequestCategory[] = ['inquiry', 'translation', 'capture'];
const outcomes: RequestOutcome[] = ['success', 'failed', 'cancelled', 'timedOut'];
const emptyCounts = (): TerminalCounts => ({success: 0, failed: 0, cancelled: 0, timedOut: 0});
const emptyDurations = (): RequestDurations => ({buckets: DURATION_BUCKETS.map(() => 0), samples: 0});

export interface ProcessSample {
  observedAt: number;
  uptimeSeconds: number;
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  cpuPercent: number | null;
  eventLoopDelayMeanMs: number | null;
  eventLoopDelayMaxMs: number | null;
}

export interface HostSample {
  observedAt: number;
  cpuPercent: number | null;
  memoryAvailableBytes: number | null;
  memoryTotalBytes: number | null;
  diskAvailableBytes: number | null;
  diskTotalBytes: number | null;
  diskUsedPercent: number | null;
}

export type SourceStatus = 'ok' | 'waiting' | 'unsupported' | 'unavailable';

export interface HostSourceRead {
  cpuPercent: number | null;
  cpuStatus: SourceStatus;
  memoryAvailableBytes: number | null;
  memoryTotalBytes: number | null;
  memoryStatus: SourceStatus;
  diskAvailableBytes: number | null;
  diskTotalBytes: number | null;
  diskUsedPercent: number | null;
  diskStatus: SourceStatus;
  visibility: 'container-visible' | 'host-or-vm' | 'unsupported';
}

/** Parse the aggregate cpu line of /proc/stat. Guest time is included in user/nice. */
export function parseProcStat(text: string): {total: number; idle: number} | null {
  const line = text.split('\n').find(item => /^cpu\s/.test(item));
  if (!line) return null;
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  if (values.length < 8 || values.some(value => !Number.isFinite(value) || value < 0)) return null;
  const [user, nice, system, idle, iowait, irq, softirq, steal] = values;
  const total = user + nice + system + idle + iowait + irq + softirq + steal;
  return total > 0 ? {total, idle: idle + iowait} : null;
}

export function cpuPercentFrom(previous: {total: number; idle: number}, current: {total: number; idle: number}): number | null {
  const total = current.total - previous.total;
  const idle = current.idle - previous.idle;
  if (!(total > 0) || idle < 0 || idle > total) return null;
  return Math.round((1 - idle / total) * 1000) / 10;
}

export function parseMeminfo(text: string): {totalBytes: number; availableBytes: number} | null {
  const read = (key: string) => {
    const match = text.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB$`, 'm'));
    return match ? Number(match[1]) * 1024 : null;
  };
  const total = read('MemTotal');
  const available = read('MemAvailable');
  return total && total > 0 && available !== null && available >= 0 && available <= total ? {totalBytes: total, availableBytes: available} : null;
}

export function diskFromStat(stat: {bsize: number; blocks: number; bfree: number; bavail: number}): {totalBytes: number; availableBytes: number; usedPercent: number} | null {
  const total = stat.bsize * stat.blocks;
  const available = stat.bsize * stat.bavail;
  if (!(total > 0) || available < 0 || available > total) return null;
  const used = total - stat.bsize * stat.bfree;
  return {totalBytes: total, availableBytes: available, usedPercent: Math.round(Math.max(0, Math.min(100, used / total * 100)) * 10) / 10};
}

function containerVisible(): boolean {
  if (existsSync('/.dockerenv') || existsSync('/run/.containerenv')) return true;
  try {
    const cgroup = readFileSync('/proc/self/cgroup', 'utf8');
    return /(?:docker|kubepods|containerd|lxc|podman)/i.test(cgroup);
  } catch { return false; }
}

/**
 * Read only fixed kernel/filesystem sources. No caller-provided path or shell.
 * In a container /proc still describes the visible kernel namespace, not a cgroup
 * quota; the response says so rather than presenting it as dedicated-host capacity.
 */
export interface HostReadDeps {
  platform?: NodeJS.Platform;
  container?: boolean;
  readText?: (path: string) => string;
  statfs?: (path: string) => StatFs;
}

export function readHostSample(dataDir: string | undefined, clock: () => number = Date.now, previousCpu: {total: number; idle: number} | null = null, deps: HostReadDeps = {}): {sample: HostSample; read: HostSourceRead; cpuRaw: {total: number; idle: number} | null} {
  const observedAt = clock();
  const platform = deps.platform ?? process.platform;
  const unsupported = platform !== 'linux';
  const readText = deps.readText ?? ((path: string) => readFileSync(path, 'utf8'));
  const statfs = deps.statfs ?? statfsSync;
  const visibility: HostSourceRead['visibility'] = unsupported ? 'unsupported' : (deps.container ?? containerVisible()) ? 'container-visible' : 'host-or-vm';
  let cpuRaw: {total: number; idle: number} | null = null;
  let cpuPercent: number | null = null;
  let cpuStatus: SourceStatus = unsupported ? 'unsupported' : 'unavailable';
  if (!unsupported) {
    try {
      const current = parseProcStat(readText('/proc/stat'));
      if (current) {
        cpuRaw = current;
        if (previousCpu) {
          cpuPercent = cpuPercentFrom(previousCpu, current);
          cpuStatus = cpuPercent === null ? 'unavailable' : 'ok';
        } else cpuStatus = 'waiting';
      }
    } catch { cpuStatus = 'unavailable'; }
  }
  let memoryAvailableBytes: number | null = null;
  let memoryTotalBytes: number | null = null;
  let memoryStatus: SourceStatus = unsupported ? 'unsupported' : 'unavailable';
  if (!unsupported) {
    try {
      const memory = parseMeminfo(readText('/proc/meminfo'));
      if (memory) {
        memoryAvailableBytes = memory.availableBytes;
        memoryTotalBytes = memory.totalBytes;
        memoryStatus = 'ok';
      }
    } catch { memoryStatus = 'unavailable'; }
  }
  let diskAvailableBytes: number | null = null;
  let diskTotalBytes: number | null = null;
  let diskUsedPercent: number | null = null;
  let diskStatus: SourceStatus = unsupported ? 'unsupported' : 'unavailable';
  if (!unsupported && dataDir) {
    try {
      const disk = diskFromStat(statfs(dataDir));
      if (disk) {
        diskAvailableBytes = disk.availableBytes;
        diskTotalBytes = disk.totalBytes;
        diskUsedPercent = disk.usedPercent;
        diskStatus = 'ok';
      }
    } catch { diskStatus = 'unavailable'; }
  } else if (!unsupported) diskStatus = 'unsupported';
  return {
    sample: {observedAt, cpuPercent, memoryAvailableBytes, memoryTotalBytes, diskAvailableBytes, diskTotalBytes, diskUsedPercent},
    read: {cpuPercent, cpuStatus, memoryAvailableBytes, memoryTotalBytes, memoryStatus, diskAvailableBytes, diskTotalBytes, diskUsedPercent, diskStatus, visibility},
    cpuRaw,
  };
}

function readProcessSample(clock: () => number, previousCpu: NodeJS.CpuUsage | null, previousAt: number | null, monitor: EventLoopMonitor | null, monitorStartedAt: number): ProcessSample {
  const now = clock();
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  let cpuPercent: number | null = null;
  if (previousCpu && previousAt !== null && now > previousAt) {
    const micros = (cpu.user - previousCpu.user) + (cpu.system - previousCpu.system);
    if (micros >= 0) cpuPercent = Math.round((micros / ((now - previousAt) * 1000)) * 1000) / 10;
  }
  let eventLoopDelayMeanMs: number | null = null;
  let eventLoopDelayMaxMs: number | null = null;
  if (monitor && now - monitorStartedAt >= 1_000) {
    // monitorEventLoopDelay reports in nanoseconds and includes its resolution
    // floor; subtracting it avoids presenting the sampling resolution as delay.
    const resolutionMs = 20;
    const mean = monitor.mean / 1e6 - resolutionMs;
    const max = monitor.max / 1e6 - resolutionMs;
    eventLoopDelayMeanMs = Number.isFinite(mean) ? Math.max(0, Math.round(mean * 10) / 10) : null;
    eventLoopDelayMaxMs = Number.isFinite(max) ? Math.max(0, Math.round(max * 10) / 10) : null;
    monitor.reset();
  }
  return {
    observedAt: now,
    uptimeSeconds: Math.round(process.uptime() * 10) / 10,
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal,
    cpuPercent,
    eventLoopDelayMeanMs,
    eventLoopDelayMaxMs,
  };
}

export interface HostedHealthOptions {
  dataDir?: string;
  clock?: () => number;
  sampleMs?: number;
  hostSampler?: typeof readHostSample;
  platform?: NodeJS.Platform;
  monitor?: EventLoopMonitor | null;
}

export class HostedHealth {
  private clock: () => number;
  private sampleMs: number;
  private dataDir?: string;
  private hostSampler: typeof readHostSample;
  private hostPlatform: NodeJS.Platform;
  private startedAt: number;
  private timer?: ReturnType<typeof setInterval>;
  private processHistory: ProcessSample[] = [];
  private hostHistory: HostSample[] = [];
  private hostRead?: HostSourceRead;
  private hostCpuRaw: {total: number; idle: number} | null = null;
  private previousCpu: NodeJS.CpuUsage | null = null;
  private previousProcessAt: number | null = null;
  private monitor: EventLoopMonitor | null;
  private monitorStartedAt: number;
  private counts: Record<RequestCategory, TerminalCounts> = {inquiry: emptyCounts(), translation: emptyCounts(), capture: emptyCounts()};
  private durations: Record<RequestCategory, RequestDurations> = {inquiry: emptyDurations(), translation: emptyDurations(), capture: emptyDurations()};

  constructor(options: HostedHealthOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.sampleMs = options.sampleMs ?? HEALTH_SAMPLE_MS;
    this.dataDir = options.dataDir;
    this.hostSampler = options.hostSampler ?? readHostSample;
    this.hostPlatform = options.platform ?? process.platform;
    this.startedAt = this.clock();
    let monitor: EventLoopMonitor | null = null;
    if (options.monitor !== undefined) monitor = options.monitor;
    else {
      try { monitor = monitorEventLoopDelay({resolution: 20}); monitor.enable(); } catch { monitor = null; }
    }
    this.monitor = monitor;
    this.monitorStartedAt = this.startedAt;
    this.sampleNow();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.sampleNow(), this.sampleMs);
    this.timer.unref?.();
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    try { this.monitor?.disable(); } catch { /* monitor may already be disabled */ }
  }

  /** Record one accepted request through its API terminal state. Idempotent. */
  observeRequest(category: RequestCategory, startedAt = this.clock()) {
    let done = false;
    return (outcome: RequestOutcome, endedAt = this.clock()) => {
      if (done) return;
      done = true;
      this.counts[category][outcome] += 1;
      this.durations[category].samples += 1;
      const elapsed = Math.max(0, endedAt - startedAt);
      const index = DURATION_BUCKETS.findIndex(bucket => elapsed <= bucket.upperMs);
      this.durations[category].buckets[index < 0 ? DURATION_BUCKETS.length - 1 : index] += 1;
    };
  }

  sampleNow() {
    const now = this.clock();
    const processSample = readProcessSample(this.clock, this.previousCpu, this.previousProcessAt, this.monitor, this.monitorStartedAt);
    this.previousCpu = process.cpuUsage();
    this.previousProcessAt = now;
    this.processHistory.push(processSample);
    if (this.processHistory.length > HEALTH_MAX_SAMPLES) this.processHistory.splice(0, this.processHistory.length - HEALTH_MAX_SAMPLES);
    try {
      const read = this.hostSampler(this.dataDir, this.clock, this.hostCpuRaw);
      this.hostCpuRaw = read.cpuRaw;
      this.hostRead = read.read;
      this.hostHistory.push(read.sample);
      if (this.hostHistory.length > HEALTH_MAX_SAMPLES) this.hostHistory.splice(0, this.hostHistory.length - HEALTH_MAX_SAMPLES);
    } catch {
      this.hostRead = {...(this.hostRead ?? {cpuPercent: null, cpuStatus: 'unavailable', memoryAvailableBytes: null, memoryTotalBytes: null, memoryStatus: 'unavailable', diskAvailableBytes: null, diskTotalBytes: null, diskUsedPercent: null, diskStatus: 'unavailable', visibility: process.platform === 'linux' ? 'host-or-vm' : 'unsupported'}), cpuStatus: this.hostRead?.cpuStatus === 'waiting' ? 'waiting' : 'unavailable', memoryStatus: 'unavailable', diskStatus: this.hostRead?.diskStatus === 'unsupported' ? 'unsupported' : 'unavailable'};
    }
  }

  private durationReport(category: RequestCategory) {
    const value = this.durations[category];
    const samples = value.samples;
    if (!samples) return {samples: 0, buckets: DURATION_BUCKETS.map((bucket, index) => ({label: bucket.label, count: value.buckets[index]})), p95: null};
    const cutoff = Math.ceil(samples * .95);
    let cumulative = 0;
    let selected = DURATION_BUCKETS.length - 1;
    for (let index = 0; index < value.buckets.length; index += 1) {
      cumulative += value.buckets[index];
      if (cumulative >= cutoff) { selected = index; break; }
    }
    const bucket = DURATION_BUCKETS[selected];
    return {
      samples,
      buckets: DURATION_BUCKETS.map((item, index) => ({label: item.label, count: value.buckets[index]})),
      p95: Number.isFinite(bucket.upperMs)
        ? {approximate: true, label: bucket.label, upperBoundMs: bucket.upperMs, over90Seconds: false}
        : {approximate: true, label: bucket.label, upperBoundMs: null, over90Seconds: true},
    };
  }

  snapshot() {
    const now = this.clock();
    const latest = this.processHistory.at(-1) ?? null;
    const processAge = latest ? Math.max(0, now - latest.observedAt) : null;
    const hostLatest = this.hostHistory.at(-1) ?? null;
    const hostAge = hostLatest ? Math.max(0, now - hostLatest.observedAt) : null;
    const byCategory = Object.fromEntries(categories.map(category => [category, {
      terminal: {...this.counts[category]},
      durations: this.durationReport(category),
    }])) as Record<RequestCategory, {terminal: TerminalCounts; durations: ReturnType<HostedHealth['durationReport']>}>;
    return {
      schemaVersion: 1 as const,
      startedAt: this.startedAt,
      windowMs: this.sampleMs,
      maxSamples: HEALTH_MAX_SAMPLES,
      staleAfterMs: HEALTH_STALE_MS,
      process: {
        source: 'node-process',
        latest,
        historyCount: this.processHistory.length,
        ageMs: processAge,
        stale: processAge === null || processAge > HEALTH_STALE_MS,
        status: {
          cpu: latest?.cpuPercent === null || latest?.cpuPercent === undefined ? 'waiting' : 'ok',
          memory: latest ? 'ok' : 'unavailable',
          eventLoop: latest?.eventLoopDelayMeanMs === null || latest?.eventLoopDelayMeanMs === undefined ? 'waiting' : 'ok',
        },
      },
      host: {
        platform: this.hostPlatform,
        supported: this.hostPlatform === 'linux',
        visibility: this.hostRead?.visibility ?? 'unsupported',
        latest: hostLatest,
        historyCount: this.hostHistory.length,
        ageMs: hostAge,
        stale: hostAge === null || hostAge > HEALTH_STALE_MS,
        status: {
          cpu: this.hostRead?.cpuStatus ?? 'unavailable',
          memory: this.hostRead?.memoryStatus ?? 'unavailable',
          disk: this.hostRead?.diskStatus ?? 'unavailable',
        },
        note: this.hostPlatform !== 'linux'
          ? '当前平台没有 /proc，主机 CPU、可用内存与数据盘显示为不支持；不使用应用进程值冒充主机值。'
          : this.hostRead?.visibility === 'container-visible'
            ? '容器可见范围：/proc 反映可见内核命名空间，不等同于专属宿主机或 cgroup 配额；磁盘为应用数据目录所在挂载点。'
            : '来自本机只读 /proc 与数据目录所在挂载点；不等同于云账单、外部可用性或独立磁盘健康探针。',
      },
      requests: {
        terminal: byCategory,
        sinceStartedAt: this.startedAt,
        note: '终态与耗时来自实际 API 请求生命周期；抓取槽可能在本请求结束后继续持有到后台读取结束，槽占用另见 admission。',
      },
    };
  }
}
