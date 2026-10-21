export type RequestCategory = 'inquiry' | 'translation' | 'capture';
export type Terminal = {success: number; failed: number; cancelled: number; timedOut: number};
export type P95 = {approximate: true; label: string; upperBoundMs: number | null; over90Seconds: boolean} | null;
export type DurationReport = {samples: number; buckets: {label: string; count: number}[]; p95: P95};
export type SourceStatus = 'ok' | 'waiting' | 'unsupported' | 'unavailable';

export interface OpsQuery {from: string; to: string; channel: string; material: string}

export interface OpsPayload {
  schemaVersion: number;
  generatedAt: string;
  admission: {
    generation: string;
    conservativeDefaults: boolean;
    measuredCapacity: boolean;
    slots: {
      global: number; inquiry: number; nonInquiry: number; translation: number; capture: number;
      limits: {global: number; nonInquiry: number; perId: number; translation: number; capture: number};
    };
    counts: {
      accepted: number; busy: number; rateLimited: number;
      acceptedByCategory: Record<RequestCategory, number>;
      busyByCategory: Record<RequestCategory, number>;
      rateLimitedByCategory: Record<RequestCategory, number>;
    };
    activeOperations: number;
    tombstones: number;
    rounds: number;
  };
  budget: null | {
    day: string; budget: number; confirmed: number; reserved: number; blocked: boolean;
    scope: string; excludes: string[]; alerts: {id: string; day: string; threshold: number; reason: string; status: string; attempts: number}[];
  };
  statistics: null | {
    schemaVersion: 2;
    generatedAt: string;
    range: {from: string; to: string; days: number; daysWithData: number};
    filters: {channel: string; material: string};
    hasData: boolean;
    counts: Record<string, number>;
    importOperations?: {
      schemaVersion: 1;
      hasData: boolean;
      daysWithData: number;
      totals: {success: number; existing: number; failed: number; cancelled: number; expired: number; recovered: number; retried: number};
      errors: Record<string, number>;
      note: string;
    };
    reach: Record<string, number>;
    funnel: Record<string, number> | null;
    conversions: {from: string; to: string; count: number; denominator: number; rate: number | null}[] | null;
    conversionsAvailable: boolean;
    conversionsNote: string;
    discarded: number;
    v1: {present: boolean; days: number; note: string};
    note: string;
  };
  budgetError?: string | null;
  statisticsError?: {code: string; message: string} | null;
  health: null | {
    schemaVersion: 1;
    startedAt: number;
    windowMs: number;
    maxSamples: number;
    staleAfterMs: number;
    process: {
      source: string;
      latest: null | {
        observedAt: number; uptimeSeconds: number; rssBytes: number; heapUsedBytes: number; heapTotalBytes: number;
        cpuPercent: number | null; eventLoopDelayMeanMs: number | null; eventLoopDelayMaxMs: number | null;
      };
      historyCount: number;
      ageMs: number | null;
      stale: boolean;
      status: {cpu: SourceStatus; memory: SourceStatus; eventLoop: SourceStatus};
    };
    host: {
      platform: string;
      supported: boolean;
      visibility: 'container-visible' | 'host-or-vm' | 'unsupported';
      latest: null | {
        observedAt: number; cpuPercent: number | null; memoryAvailableBytes: number | null; memoryTotalBytes: number | null;
        diskAvailableBytes: number | null; diskTotalBytes: number | null; diskUsedPercent: number | null;
      };
      historyCount: number;
      ageMs: number | null;
      stale: boolean;
      status: {cpu: SourceStatus; memory: SourceStatus; disk: SourceStatus};
      note: string;
    };
    requests: {
      terminal: Record<RequestCategory, {terminal: Terminal; durations: DurationReport}>;
      sinceStartedAt: number;
      note: string;
    };
  };
}
