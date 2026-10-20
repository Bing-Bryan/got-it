import type {OpsQuery, RequestCategory, SourceStatus} from './types';

const DAY_MS = 86_400_000;
export const utcDay = (value: number | Date = Date.now()) => new Date(value).toISOString().slice(0, 10);

export function defaultQuery(now = Date.now()): OpsQuery {
  return {from: utcDay(now - 6 * DAY_MS), to: utcDay(now), channel: 'all', material: 'all'};
}

export function queryValid(query: OpsQuery): string | null {
  for (const value of [query.from, query.to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) return '请选择有效的 UTC 日期。';
  }
  const from = Date.parse(`${query.from}T00:00:00.000Z`);
  const to = Date.parse(`${query.to}T00:00:00.000Z`);
  if (from > to) return '开始日期不能晚于结束日期。';
  if ((to - from) / DAY_MS + 1 > 31) return '单次最多查看 31 个 UTC 日。';
  if (to > Date.parse(`${utcDay()}T00:00:00.000Z`)) return '结束日期不能晚于今天（UTC）。';
  return null;
}

export function queryString(query: OpsQuery): string {
  const params = new URLSearchParams({from: query.from, to: query.to, channel: query.channel, material: query.material});
  return params.toString();
}

export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '不可用';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let number = Math.max(0, value);
  let index = 0;
  while (number >= 1024 && index < units.length - 1) { number /= 1024; index += 1; }
  return `${number >= 100 || index === 0 ? number.toFixed(0) : number.toFixed(1)} ${units[index]}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '不可用' : `${value.toFixed(digits)}%`;
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '不可用';
  return `$${value.toFixed(4)}`;
}

export function formatAge(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '无样本';
  if (ms < 1000) return '刚刚';
  if (ms < 60_000) return `${Math.floor(ms / 1000)} 秒前`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} 分钟前`;
  return `${Math.floor(ms / 3_600_000)} 小时前`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '不可用';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)} 分钟`;
  return `${(ms / 3_600_000).toFixed(1)} 小时`;
}

export function formatUtc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '未记录';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '未记录';
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 19)} UTC`;
}

export function formatClock(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '未记录';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '未记录';
  return date.toISOString().slice(11, 19) + ' UTC';
}

export function statusLabel(status: SourceStatus, stale = false): string {
  if (status === 'waiting') return '等待样本';
  if (status === 'unsupported') return '当前平台不支持';
  if (status === 'unavailable') return '读取失败';
  return stale ? '采样过期' : '正常';
}

export function categoryLabel(category: RequestCategory): string {
  return category === 'inquiry' ? '问答' : category === 'translation' ? '翻译' : '抓取';
}

export function filterLabel(value: string, kind: 'channel' | 'material'): string {
  const channels: Record<string, string> = {all: '全部渠道', direct: '直接访问', xiaohongshu: '小红书', x: 'X', wechat: '微信', other: '其他'};
  const materials: Record<string, string> = {all: '全部材料', sample: '公开样例', markdown: 'Markdown', pdf: 'PDF', web: '网页', x: 'X 文章', none: '未打开材料'};
  return (kind === 'channel' ? channels : materials)[value] ?? value;
}

export function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    visit_started: '访问开始', material_opened: '打开材料', ai_started: '开始 AI', ai_completed: 'AI 完成', result_saved: '结果保存',
  };
  return labels[stage] ?? stage;
}

export function terminalTotal(value: {success: number; failed: number; cancelled: number; timedOut: number}): number {
  return value.success + value.failed + value.cancelled + value.timedOut;
}

export function p95Text(value: {label: string; approximate: boolean} | null): string {
  return value ? `${value.approximate ? '约 ' : ''}${value.label}` : '无样本';
}

export {DAY_MS};
