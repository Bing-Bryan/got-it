import type {OpsPayload, OpsQuery} from './types';
import {queryString} from './format';

export class OpsRequestError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

export async function fetchOpsSummary(query: OpsQuery, signal: AbortSignal): Promise<OpsPayload> {
  const response = await fetch(`/api/ops/summary?${queryString(query)}`, {
    method: 'GET',
    headers: {Accept: 'application/json'},
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    signal,
  });
  if (!response.ok) throw new OpsRequestError(response.status === 502 ? '无法读取服务器运营汇总；这不表示服务已停止。' : `运营汇总读取失败（HTTP ${response.status}）。`, response.status);
  if (!/^application\/json/i.test(response.headers.get('content-type') ?? '')) throw new OpsRequestError('运营汇总返回格式异常。', response.status);
  const value = await response.json() as Partial<OpsPayload>;
  if (value?.schemaVersion !== 1 || !value.admission || typeof value.generatedAt !== 'string' || !('budget' in value) || !('health' in value) || (value.budget !== null && typeof value.budget !== 'object')) throw new OpsRequestError('运营汇总版本不受支持。', response.status);
  return value as OpsPayload;
}
