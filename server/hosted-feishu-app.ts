import {createHash} from 'node:crypto';
import type {BudgetAlert} from './hosted-budget';

const TOKEN_URL = 'https://accounts.feishu.cn/oauth/v3/token';
const MESSAGE_URL = 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id';
export interface FeishuAppOptions {appId?: string; appSecret?: string; recipientOpenId?: string; fetchImpl?: typeof fetch; clock?: () => number;}
export class FeishuAppError extends Error {
  constructor(public status = 0, public businessCode?: number) { super('Feishu application notification unavailable'); }
}
export async function readFeishuJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new FeishuAppError(response.status);
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength; if (size > 16_384) throw new FeishuAppError(response.status);
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, any>;
  } finally { await reader.cancel().catch(() => undefined); }
}
function waitForToken<T>(work: Promise<T>, signal: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new FeishuAppError());
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, {once: true});
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
/** Fixed server-configured recipient. No credential, token or receiver enters outbox state. */
export class HostedFeishuApp {
  private token?: {value: string; expires: number};
  private refreshing?: Promise<string>;
  constructor(private options: FeishuAppOptions) { this.options = {...options}; }
  configured() {
    return typeof this.options.appId === 'string' && /^cli_[a-zA-Z0-9]+$/.test(this.options.appId) && typeof this.options.appSecret === 'string' && !!this.options.appSecret.trim() && typeof this.options.recipientOpenId === 'string' && /^ou_[a-zA-Z0-9]+$/.test(this.options.recipientOpenId);
  }
  private async refresh() {
    const started = (this.options.clock ?? Date.now)();
    const response = await (this.options.fetchImpl ?? fetch)(TOKEN_URL, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5_000),
      headers: {'Content-Type': 'application/json; charset=utf-8'},
      body: JSON.stringify({grant_type: 'client_credentials', client_id: this.options.appId, client_secret: this.options.appSecret}),
    });
    const ack = await readFeishuJson(response);
    const code = Number.isSafeInteger(ack.code) ? ack.code as number : undefined;
    if (!response.ok || code !== 0 || typeof ack.access_token !== 'string' || !ack.access_token || /[\r\n]/.test(ack.access_token) || !Number.isSafeInteger(ack.expires_in) || ack.expires_in < 1 || ack.token_type !== 'Bearer') throw new FeishuAppError(response.status, code);
    const lifetime = Math.min(ack.expires_in as number, 7200) * 1000;
    this.token = {value: ack.access_token, expires: started + lifetime - Math.min(60_000, lifetime / 10)};
    return this.token.value;
  }
  private accessToken(signal: AbortSignal) {
    if (this.token && this.token.expires > (this.options.clock ?? Date.now)()) return Promise.resolve(this.token.value);
    if (!this.refreshing) {
      const work = this.refresh(); this.refreshing = work;
      void work.finally(() => { if (this.refreshing === work) this.refreshing = undefined; }).catch(() => {});
    }
    return waitForToken(this.refreshing, signal);
  }
  private uuid(alert: BudgetAlert) {
    // Official UUID contract is <=50 chars, deduplicated for one hour only.
    // createdAt separates independent ledgers with the same daily threshold ID.
    return createHash('sha256').update(JSON.stringify(['gotit-budget-alert-v1', this.options.appId, this.options.recipientOpenId, alert.id, alert.createdAt, alert.budget])).digest('hex').slice(0, 48);
  }
  async send(alert: BudgetAlert, text: string, signal: AbortSignal) {
    if (!this.configured()) throw new FeishuAppError();
    const token = await this.accessToken(signal);
    if (signal.aborted) throw new FeishuAppError();
    const response = await (this.options.fetchImpl ?? fetch)(MESSAGE_URL, {
      method: 'POST', redirect: 'error', signal,
      headers: {'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}`},
      body: JSON.stringify({receive_id: this.options.recipientOpenId, msg_type: 'text', content: JSON.stringify({text}), uuid: this.uuid(alert)}),
    });
    const ack = await readFeishuJson(response);
    const code = Number.isSafeInteger(ack.code) ? ack.code as number : undefined;
    const validMessage = typeof ack.data?.message_id === 'string' && /^om_[a-zA-Z0-9]+$/.test(ack.data.message_id);
    if (!response.ok || code !== 0 || !validMessage) {
      // Conservatively refresh next attempt after a rejected API response. Do not
      // retry an ambiguous message within this consumed outbox attempt.
      if (this.token?.value === token) this.token = undefined;
      throw new FeishuAppError(response.status, code);
    }
    return {status: response.status, businessCode: code};
  }
}
