import {createHmac} from 'node:crypto';
import {HostedFeishuApp, FeishuAppError} from './hosted-feishu-app';
import {type BudgetAlert, type HostedBudget} from './hosted-budget';

export interface AlertDeliveryOptions {
  url?: string;
  authorization?: string;
  format?: string;
  signingSecret?: string;
  appId?: string;
  appSecret?: string;
  recipientOpenId?: string;
  fetchImpl?: typeof fetch;
  clock?: () => number;
  timeoutMs?: number;
}

/** One configured webhook. The URL and credential never enter events or logs. */
export class HostedAlerts {
  private app: HostedFeishuApp;
  private timer?: ReturnType<typeof setInterval>;
  private sending = new Set<string>();
  private pumping?: Promise<void>;
  constructor(private budget: HostedBudget, private options: AlertDeliveryOptions = {}) {
    this.options = {...options};
    this.app = new HostedFeishuApp(options);
    budget.bindAlerts(() => this.wake());
  }
  configured() {
    if (this.options.format === 'feishu-app-bot') return !this.options.url && !this.options.authorization && !this.options.signingSecret && this.app.configured();
    if (!this.options.url || !['generic', 'feishu'].includes(this.options.format ?? 'generic')) return false;
    if (this.options.signingSecret && this.options.format !== 'feishu') return false;
    try {
      const url = new URL(this.options.url);
      return url.protocol === 'https:' || (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost'));
    } catch { return false; }
  }
  private wake() { void this.pump().catch(() => { /* Ledger failure is fail-closed; no credentials/errors logged. */ }); }
  start() { if (this.timer) return; this.timer = setInterval(() => this.wake(), 15_000); this.timer.unref?.(); this.wake(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  pump(now = (this.options.clock ?? Date.now)()) {
    // Explicit callers must await a dispatcher already started by the ledger hook.
    if (this.pumping) return this.pumping;
    const work = this.dispatch(now);
    this.pumping = work;
    void work.finally(() => { if (this.pumping === work) this.pumping = undefined; }).catch(() => {});
    return work;
  }
  private async dispatch(now: number) {
    if (!this.configured()) {
      for (const alert of this.budget.alerts()) if (alert.status === 'pending') this.budget.markAlert(alert.id, {attempts: alert.attempts, nextAttemptAt: alert.nextAttemptAt, status: 'unconfigured'});
      return;
    }
    for (const alert of this.budget.alerts()) {
      if (alert.status === 'delivered' || alert.status === 'exhausted') continue;
      if (alert.nextAttemptAt > now || this.sending.has(alert.id)) continue;
      this.sending.add(alert.id);
      try { await this.send(alert, now); } catch { /* Failed pre-send writes cause zero outbound requests. */ } finally { this.sending.delete(alert.id); this.budget.endAlertAttempt(alert.id); }
    }
  }
  private payload(alert: BudgetAlert, now: number) {
    const event = {date: alert.day, eventId: alert.id, threshold: alert.threshold, budget: alert.budget, confirmed: alert.confirmed, reserved: alert.reserved, reason: alert.reason};
    if (this.options.format !== 'feishu' && this.options.format !== 'feishu-app-bot') return event;
    const timestamp = String(Math.floor(now / 1000));
    const signature = this.options.signingSecret ? {timestamp, sign: createHmac('sha256', `${timestamp}\n${this.options.signingSecret}`).update('').digest('base64')} : {};
    // Official custom-bot contract: text envelope, code===0 business ACK,
    // optional HMAC-SHA256(empty, timestamp + newline + secret).
    return {...signature, msg_type: 'text', content: {text: `Got-it 费用告警（仅本站模型与搜索，不含 AWS 或其他 Key）\n${JSON.stringify(event)}`}};
  }
  private async send(event: BudgetAlert, now: number) {
    const alert = this.budget.beginAlertAttempt(event.id, now);
    if (!alert) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 5_000);
    let ok = false;
    let status = 0;
    let businessCode: number | undefined;
    try {
      if (this.options.format === 'feishu-app-bot') {
        const payload = this.payload(alert, now) as {content: {text: string}};
        const result = await this.app.send(alert, payload.content.text, controller.signal);
        ok = true; status = result.status; businessCode = result.businessCode;
      } else {
      const response = await (this.options.fetchImpl ?? fetch)(this.options.url!, {
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: {'Content-Type': 'application/json', ...(this.options.authorization ? {Authorization: this.options.authorization} : {})},
        body: JSON.stringify(this.payload(alert, now)),
      });
      status = response.status;
      ok = response.ok;
      if (ok && this.options.format === 'feishu') {
        // Read a bounded business response; no arbitrary receiver payload enters logs.
        const reader = response.body?.getReader();
        if (!reader) ok = false;
        else {
          const chunks: Uint8Array[] = []; let size = 0;
          try {
            while (true) {
              const part = await reader.read(); if (part.done) break;
              size += part.value.byteLength;
              if (size > 16_384) throw new Error('ACK too large');
              chunks.push(part.value);
            }
            const ack = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            ok = ack?.code === 0;
          } finally { await reader.cancel().catch(() => undefined); }
        }
      } else await response.body?.cancel?.().catch(() => undefined);
      }
    } catch (error) { ok = false; if (error instanceof FeishuAppError) {status = error.status; businessCode = error.businessCode;} }
    finally { clearTimeout(timer); }
    if (ok) this.budget.markAlert(alert.id, {attempts: alert.attempts, nextAttemptAt: 0, status: 'delivered'});
    // Failure already has its durable retry/terminal state from before sending.
    console.info(JSON.stringify({event: 'alert_delivery', id: alert.id, ok, status, ...(businessCode !== undefined ? {businessCode} : {}), attempts: alert.attempts}));
  }
}
