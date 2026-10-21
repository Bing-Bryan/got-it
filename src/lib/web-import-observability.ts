export const IMPORT_OUTCOMES = ['success', 'existing', 'failed', 'cancelled', 'expired'] as const;
export type ImportOutcome = typeof IMPORT_OUTCOMES[number];
export const IMPORT_ERROR_CATEGORIES = ['network', 'timeout', 'rate_limited', 'server_error', 'rejected', 'invalid_content', 'too_large', 'capacity', 'stale_operation', 'unknown'] as const;
export type ImportErrorCategory = typeof IMPORT_ERROR_CATEGORIES[number];
export const IMPORT_OPERATION_MAX = 20;
export const IMPORT_ATTEMPT_MAX = 10;

export interface ImportOperation {
  operationId: string;
  startedAt: string;
  outcome: ImportOutcome;
  attempts: number;
  recovered: boolean;
  errorCategory: ImportErrorCategory | null;
}

/** Convert an error to a bounded category without retaining or returning its text. */
export function classifyImportError(error: unknown): ImportErrorCategory {
  const value = error as {status?: unknown; code?: unknown; name?: unknown; message?: unknown} | null | undefined;
  const status = Number(value?.status);
  const code = typeof value?.code === 'string' ? value.code.toLowerCase() : '';
  const name = typeof value?.name === 'string' ? value.name : '';
  const message = typeof value?.message === 'string' ? value.message : '';
  if (name === 'AbortError' || code.includes('timeout') || /timeout|超时|timed out/i.test(message)) return 'timeout';
  if (code.includes('stale') || code.includes('upgrade_required') || code.includes('operation_stale')) return 'stale_operation';
  if (status === 413 || code.includes('too_large') || code.includes('web_budget') || /超过.*(大小|容量|上限)|too large|文件过大/i.test(message)) return 'too_large';
  if (status === 429 && !/容量|额度|并发|繁忙|busy|quota|exhausted|已用完|不足|满载/i.test(message) && !/quota|busy|memory_limit|rate_limit/.test(code)) return 'rate_limited';
  if (/容量|额度|并发|繁忙|busy|quota|exhausted|已用完|不足|满载/i.test(message) || /quota|busy|memory_limit|capacity/.test(code)) return 'capacity';
  if (status === 429 || code.includes('rate_limit') || /rate.?limit|限速|请求过多/i.test(message)) return 'rate_limited';
  if (code.includes('invalid_content') || code.includes('extract') || /正文|解析|不支持|无法读取|invalid.*content/i.test(message)) return 'invalid_content';
  if (error instanceof TypeError || code.includes('network') || /fetch|network|无法连接|连接失败/i.test(message)) return 'network';
  if (status >= 500 || code.includes('server_error') || /服务暂时|服务端错误/i.test(message)) return 'server_error';
  if (status >= 400 || code.includes('rejected') || code.includes('invalid_url') || code.includes('private')) return 'rejected';
  return 'unknown';
}
