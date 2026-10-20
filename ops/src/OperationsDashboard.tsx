import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Activity, AlertTriangle, Clock3, Database, HardDrive, RefreshCw, Server, ShieldCheck} from 'lucide-react';
import {fetchOpsSummary} from './client';
import {
  categoryLabel, defaultQuery, filterLabel, formatAge, formatBytes, formatClock, formatDuration, formatPercent,
  formatUsd, formatUtc, p95Text, queryValid, stageLabel, statusLabel, terminalTotal, utcDay,
} from './format';
import type {DurationReport, OpsPayload, OpsQuery, RequestCategory, SourceStatus} from './types';

const REFRESH_MS = 15_000;
const TIMEOUT_MS = 5_000;
const CONNECTION_STALE_MS = 30_000;
const CATEGORIES: RequestCategory[] = ['inquiry', 'translation', 'capture'];

const sameQuery = (a: OpsQuery, b: OpsQuery) => a.from === b.from && a.to === b.to && a.channel === b.channel && a.material === b.material;

/** Age a server sample using the server-relative age at response time plus local time since receipt. */
function sampleAge(generatedAt: string, observedAt: number | null | undefined, fallbackAgeMs: number | null | undefined, receivedAt: number | null, now: number) {
  if (observedAt === null || observedAt === undefined) return null;
  const generated = Date.parse(generatedAt);
  const serverAge = Number.isFinite(generated)
    ? Math.max(0, generated - observedAt)
    : fallbackAgeMs !== null && fallbackAgeMs !== undefined && Number.isFinite(fallbackAgeMs) ? Math.max(0, fallbackAgeMs) : null;
  if (serverAge === null) return null;
  return serverAge + (receivedAt === null ? 0 : Math.max(0, now - receivedAt));
}


function Pill({tone = 'neutral', children}: {tone?: 'neutral' | 'good' | 'warn' | 'bad'; children: React.ReactNode}) {
  return <span className={`ops-pill ops-pill--${tone}`}>{children}</span>;
}

function Card({label, value, hint}: {label: string; value: React.ReactNode; hint?: string}) {
  return <div className="ops-metric"><span className="ops-metric-label">{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</div>;
}

function SectionTitle({id, icon, kicker, title, description}: {id: string; icon: React.ReactNode; kicker: string; title: string; description: React.ReactNode}) {
  return <header className="ops-section-heading"><div className="ops-kicker">{icon}{kicker}</div><h2 id={id}>{title}</h2><p>{description}</p></header>;
}

function sourceTone(status: SourceStatus, stale: boolean): 'good' | 'warn' | 'bad' | 'neutral' {
  if (status === 'ok') return stale ? 'warn' : 'good';
  if (status === 'waiting') return 'warn';
  if (status === 'unavailable') return 'bad';
  return 'neutral';
}

function SourceBadge({status, stale = false}: {status: SourceStatus; stale?: boolean}) {
  return <Pill tone={sourceTone(status, stale)}>{statusLabel(status, stale)}</Pill>;
}

function DurationBuckets({report}: {report: DurationReport}) {
  if (!report.samples) return <span className="ops-muted">尚无已结束请求，等待样本。</span>;
  return <details className="ops-details"><summary>查看 {report.samples} 个样本的固定时长桶</summary><div className="ops-table-wrap"><table><caption className="ops-visually-hidden">请求终态时长固定桶</caption><thead><tr><th scope="col">桶边界</th><th scope="col">样本</th></tr></thead><tbody>{report.buckets.map(bucket => <tr key={bucket.label}><td>{bucket.label}</td><td>{bucket.count}</td></tr>)}</tbody></table></div></details>;
}

export function OperationsDashboard() {
  const [query, setQuery] = useState<OpsQuery>(() => defaultQuery());
  const [data, setData] = useState<OpsPayload | null>(null);
  const [dataError, setDataError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [lastAttemptAt, setLastAttemptAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const [filterQueued, setFilterQueued] = useState(false);
  const queryRef = useRef(query);
  queryRef.current = query;
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const lastAttemptRef = useRef(0);
  const initialized = useRef(false);
  const pendingQuery = useRef<OpsQuery | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pumpRef = useRef<() => void>(() => undefined);

  const startRequest = useCallback(async (nextQuery: OpsQuery) => {
    const started = Date.now();
    lastAttemptRef.current = started;
    setLastAttemptAt(started);
    const seq = ++sequence.current;
    const current = new AbortController();
    controller.current = current;
    inFlight.current = true;
    setLoading(true);
    setDataError('');
    setFilterQueued(false);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; current.abort(); }, TIMEOUT_MS);
    try {
      const payload = await fetchOpsSummary(nextQuery, current.signal);
      if (seq !== sequence.current || !sameQuery(queryRef.current, nextQuery)) return;
      const received = Date.now();
      setData(payload);
      setReceivedAt(received);
      setLastSuccessAt(received);
    } catch (error) {
      if (seq !== sequence.current || !sameQuery(queryRef.current, nextQuery)) return;
      const networkFailure = error instanceof TypeError || (error instanceof Error && /failed to fetch|fetch failed|networkerror/i.test(error.message));
      const message = timedOut
        ? '读取超过 5 秒，已保留上次成功值。该状态不能说明服务已停止。'
        : current.signal.aborted
          ? '本次读取已取消，未改变已有数据。'
          : networkFailure
            ? '无法读取运营汇总；查看器、SSH 隧道或服务器可能未运行。该状态不能推断服务健康。'
            : error instanceof Error ? error.message : '运营汇总读取失败；已保留上次成功值。';
      setDataError(message);
    } finally {
      clearTimeout(timer);
      if (seq === sequence.current) {
        inFlight.current = false;
        controller.current = null;
        setLoading(false);
        pumpRef.current();
      }
    }
  }, []);

  const pump = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (inFlight.current || !pendingQuery.current || timerRef.current) return;
    const invalid = queryValid(pendingQuery.current);
    if (invalid) { pendingQuery.current = null; setDataError(invalid); return; }
    const wait = REFRESH_MS - (Date.now() - lastAttemptRef.current);
    if (lastAttemptRef.current && wait > 0) {
      timerRef.current = setTimeout(() => { timerRef.current = null; pumpRef.current(); }, wait);
      return;
    }
    const next = pendingQuery.current;
    pendingQuery.current = null;
    void startRequest(next);
  }, [startRequest]);
  pumpRef.current = pump;

  const schedule = useCallback((nextQuery: OpsQuery, kind: 'filter' | 'manual' | 'auto' = 'auto') => {
    const invalid = queryValid(nextQuery);
    if (invalid) { setDataError(invalid); return; }
    pendingQuery.current = nextQuery;
    if (kind === 'filter') setFilterQueued(true);
    pumpRef.current();
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    schedule(queryRef.current, 'manual');
    return () => {
      sequence.current += 1;
      controller.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [schedule]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    const visibility = () => {
      const isHidden = document.visibilityState === 'hidden';
      setHidden(isHidden);
      setNow(Date.now());
      if (isHidden) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
      } else if (!inFlight.current) schedule(queryRef.current, 'auto');
    };
    document.addEventListener('visibilitychange', visibility);
    const automatic = setInterval(() => {
      if (document.visibilityState !== 'visible' || inFlight.current) return;
      schedule(queryRef.current, 'auto');
    }, 1_000);
    return () => { clearInterval(tick); clearInterval(automatic); document.removeEventListener('visibilitychange', visibility); };
  }, [schedule]);

  const validation = useMemo(() => queryValid(query), [query]);
  const cooldown = Math.max(0, REFRESH_MS - (now - lastAttemptAt));
  const connectionAge = lastSuccessAt === null ? null : now - lastSuccessAt;
  const connectionExpired = connectionAge !== null && connectionAge > CONNECTION_STALE_MS;
  const update = (patch: Partial<OpsQuery>) => {
    const next = {...query, ...patch};
    setQuery(next);
    schedule(next, 'filter');
  };

  const stats = data?.statistics ?? null;
  const health = data?.health ?? null;
  const budget = data?.budget ?? null;
  const admission = data?.admission ?? null;
  const statsUnavailable = data ? (!stats || data.statisticsError) : false;
  const sampleLimit = health?.staleAfterMs ?? 120_000;
  const processAge = health ? sampleAge(data?.generatedAt ?? '', health.process.latest?.observedAt, health.process.ageMs, receivedAt, now) : null;
  const hostAge = health ? sampleAge(data?.generatedAt ?? '', health.host.latest?.observedAt, health.host.ageMs, receivedAt, now) : null;
  const processStale = health ? processAge === null || processAge > sampleLimit : false;
  const hostStale = health ? hostAge === null || hostAge > sampleLimit : false;

  return <div className="ops-shell">
    <header className="ops-header">
      <div>
        <div className="ops-brand"><ShieldCheck size={18} aria-hidden="true" /><span>Got-it 私人运营</span></div>
        <h1>托管容量与运行看板</h1>
        <p className="ops-subtitle">仅绑定回环地址，经本人 SSH 隧道或本机查看器打开。只读；不会请求模型、搜索、抓取、发信或修改读者成果。</p>
      </div>
      <div className="ops-header-actions">
        <div className="ops-connection" role="status" aria-live="polite">
          <span className={`ops-dot ${connectionExpired || dataError ? 'ops-dot--warn' : data ? 'ops-dot--good' : ''}`} aria-hidden="true" />
          {dataError ? '读取失败' : connectionExpired ? '连接已过期' : data ? '已连接 · 只读' : loading ? '正在连接' : '尚未连接'}
          <small>{lastSuccessAt ? `最近成功 ${formatClock(lastSuccessAt)}` : '尚无成功读取'}</small>
        </div>
        <button type="button" className="ops-refresh" onClick={() => schedule(query, 'manual')} disabled={loading || cooldown > 0 || !!validation} aria-busy={loading}>
          <RefreshCw size={16} aria-hidden="true" className={loading ? 'ops-spin' : undefined} />
          {loading ? '读取中…' : cooldown > 0 ? `${Math.ceil(cooldown / 1000)} 秒后可刷新` : '立即刷新'}
        </button>
        <small className="ops-refresh-note">{hidden ? '后台标签已暂停自动刷新' : '每 15 秒最多一次；同刻仅一个请求'}</small>
      </div>
    </header>

    {dataError ? <div className="ops-banner ops-banner--warn" role="alert"><AlertTriangle size={17} aria-hidden="true" /><div><strong>{connectionExpired ? '连接已过期' : '本次读取未成功'}</strong><span>{dataError}{data ? ' 下方保留上次成功值与读取时间；不能据此推断服务当前健康。' : ''}</span></div></div> : null}
    {data && connectionExpired && !dataError ? <div className="ops-banner ops-banner--warn" role="status"><Clock3 size={17} aria-hidden="true" /><div><strong>超过 30 秒没有成功读取</strong><span>自动刷新尚未成功，连接状态未知；已有数值仅供回看。</span></div></div> : null}
    {data?.statisticsError ? <div className="ops-banner ops-banner--warn" role="status"><Database size={17} aria-hidden="true" /><div><strong>统计源暂不可用</strong><span>{data.statisticsError.message}；健康数据仍独立读取。</span></div></div> : null}
    {data?.budgetError ? <div className="ops-banner ops-banner--warn" role="status"><AlertTriangle size={17} aria-hidden="true" /><div><strong>预算源暂不可用</strong><span>{data.budgetError}；不将未知费用显示为 $0。</span></div></div> : null}

    <main className="ops-main">
      <section className="ops-section" aria-labelledby="product-title">
        <SectionTitle id="product-title" icon={<Database size={15} aria-hidden="true" />} kicker="产品使用" title="匿名使用与有序触达" description="复用已送达的 v2 聚合；访问阶段计数不是 UV/PV，也不代表精确留存。关闭统计的浏览器不会新增上报。" />
        <div className="ops-filters" role="group" aria-label="产品统计筛选">
          <label htmlFor="from-date">开始日期（UTC）<input id="from-date" type="date" value={query.from} max={query.to} onChange={event => update({from: event.target.value})} /></label>
          <label htmlFor="to-date">结束日期（UTC）<input id="to-date" type="date" value={query.to} min={query.from} max={utcDay()} onChange={event => update({to: event.target.value})} /></label>
          <label htmlFor="channel-filter">渠道<select id="channel-filter" value={query.channel} onChange={event => update({channel: event.target.value})}><option value="all">全部渠道</option><option value="direct">直接访问</option><option value="xiaohongshu">小红书</option><option value="x">X</option><option value="wechat">微信</option><option value="other">其他</option></select></label>
          <label htmlFor="material-filter">材料<select id="material-filter" value={query.material} onChange={event => update({material: event.target.value})}><option value="all">全部材料</option><option value="sample">公开样例</option><option value="markdown">Markdown</option><option value="pdf">PDF</option><option value="web">网页</option><option value="x">X 文章</option><option value="none">未打开材料</option></select></label>
          <button type="button" className="ops-quiet" onClick={() => { const next = {...defaultQuery(), channel: query.channel, material: query.material}; setQuery(next); schedule(next, 'filter'); }}>最近 7 天</button>
          {validation ? <p className="ops-inline-error" role="alert">{validation}</p> : null}
          {filterQueued ? <p className="ops-queued" role="status">筛选已更新，将在 15 秒刷新窗口到达后读取；下方仍是上一次成功范围。</p> : null}
        </div>

        {!data ? <div className="ops-empty"><p>尚未读取运营汇总。</p><p className="ops-muted">需要先启动服务器回环 ops、SSH 隧道和本机查看器；页面错误不会触发付费重试。</p></div>
          : !stats ? <div className="ops-empty"><p>{statsUnavailable ? '统计源不可用，未显示伪造的零值。' : '统计未配置。'}</p></div>
            : <>
              <div className="ops-meta-row">
                <Pill tone="good">v2 · schema {stats.schemaVersion}</Pill>
                <Pill>{stats.range.from} 至 {stats.range.to}（UTC）· {stats.range.days} 天</Pill>
                <Pill>{filterLabel(stats.filters.channel, 'channel')} / {filterLabel(stats.filters.material, 'material')}</Pill>
                <Pill>{stats.range.daysWithData} 天有已送达批次</Pill>
                <Pill>{stats.discarded ? `${stats.discarded} 个客户端批次被丢弃` : '无客户端丢弃记录'}</Pill>
              </div>
              {stats.v1.present ? <p className="ops-callout">{stats.v1.note} 检测到 v1 历史 {stats.v1.days} 天。</p> : null}
              {!stats.hasData ? <div className="ops-empty"><p>该范围没有已送达的 v2 批次。</p><p className="ops-muted">这是真实空数据，不是加载失败；可能尚未有人访问、统计已关闭，或批次仍在 48 小时补报窗口内。</p></div> : <>
                <div className="ops-metric-grid ops-metric-grid--counts">
                  <Card label="导入开始" value={stats.counts.import_started ?? 0} />
                  <Card label="导入成功" value={stats.counts.import_success ?? 0} />
                  <Card label="导入失败" value={stats.counts.import_failed ?? 0} />
                  <Card label="翻译完成" value={stats.counts.translation_complete ?? 0} />
                  <Card label="翻译部分" value={stats.counts.translation_partial ?? 0} />
                  <Card label="翻译失败" value={stats.counts.translation_failed ?? 0} />
                  <Card label="回答完成" value={stats.counts.answer_complete ?? 0} />
                  <Card label="结果保存" value={stats.counts.result_saved ?? 0} />
                  <Card label="原文收藏" value={stats.counts.bookmark_saved ?? 0} hint="不等于 AI 结果保存" />
                </div>
                <div className="ops-two-column">
                  <div className="ops-panel">
                    <h3>阶段触达</h3>
                    <div className="ops-table-wrap"><table><caption className="ops-visually-hidden">v2 阶段触达</caption><thead><tr><th scope="col">阶段</th><th scope="col">触达计数</th></tr></thead><tbody>{['visit_started', 'material_opened', 'ai_started', 'ai_completed', 'result_saved'].map(stage => <tr key={stage}><th scope="row">{stageLabel(stage)}</th><td>{stats.reach[stage] ?? 0}</td></tr>)}</tbody></table></div>
                  </div>
                  <div className="ops-panel">
                    <h3>有序漏斗</h3>
                    {stats.funnel ? <div className="ops-table-wrap"><table><caption className="ops-visually-hidden">已送达批次的有序漏斗</caption><thead><tr><th scope="col">阶段</th><th scope="col">有序到达</th></tr></thead><tbody>{Object.entries(stats.funnel).map(([stage, count]) => <tr key={stage}><th scope="row">{stageLabel(stage)}</th><td>{count}</td></tr>)}</tbody></table></div> : <p className="ops-callout">{stats.conversionsNote}</p>}
                  </div>
                </div>
                <div className="ops-panel">
                  <h3>相邻阶段转换</h3>
                  {stats.conversions ? <div className="ops-table-wrap"><table><caption className="ops-visually-hidden">单一渠道跨材料汇总的相邻阶段转换</caption><thead><tr><th scope="col">阶段</th><th scope="col">前序分母</th><th scope="col">到达</th><th scope="col">比值</th></tr></thead><tbody>{stats.conversions.map(item => <tr key={`${item.from}-${item.to}`}><th scope="row">{stageLabel(item.from)} → {stageLabel(item.to)}</th><td>{item.denominator}</td><td>{item.count}</td><td>{item.rate === null ? '—（分母为 0）' : `${item.rate.toFixed(1)}%`}</td></tr>)}</tbody></table></div> : <p className="ops-callout">{stats.conversionsNote}</p>}
                  <p className="ops-muted ops-small">{stats.note}</p>
                </div>
              </>}
            </>}
      </section>

      <section className="ops-section" aria-labelledby="health-title">
        <SectionTitle id="health-title" icon={<Activity size={15} aria-hidden="true" />} kicker="服务器健康" title="容量、费用与采样" description="区分请求终态、槽占用和 60 秒资源采样；缺失或过期显示等待/不可用，不显示为正常或 0。" />
        {!data ? <div className="ops-empty">尚无健康数据。</div> : <>
          {admission ? <div className="ops-panel">
            <div className="ops-panel-title"><div><h3>并发槽</h3><p className="ops-muted ops-small">总槽 {admission.slots.limits.global}；非问答上限 {admission.slots.limits.nonInquiry}，因此至少 {admission.slots.limits.global - admission.slots.limits.nonInquiry} 槽保留给问答。默认目标配置，不是实测生产容量。</p></div><Pill tone={admission.conservativeDefaults ? 'warn' : 'neutral'}>{admission.measuredCapacity ? '已测容量' : '待负载验证'}</Pill></div>
            <div className="ops-metric-grid">
              <Card label="总占用" value={`${admission.slots.global} / ${admission.slots.limits.global}`} />
              <Card label="问答占用" value={admission.slots.inquiry} hint="可使用其余空闲槽" />
              <Card label="非问答占用" value={`${admission.slots.nonInquiry} / ${admission.slots.limits.nonInquiry}`} />
              <Card label="翻译" value={`${admission.slots.translation} / ${admission.slots.limits.translation}`} />
              <Card label="抓取" value={`${admission.slots.capture} / ${admission.slots.limits.capture}`} />
              <Card label="每体验 ID" value={`≤ ${admission.slots.limits.perId}`} />
            </div>
            <div className="ops-table-wrap"><table><caption className="ops-visually-hidden">分类准入计数</caption><thead><tr><th scope="col">分类</th><th scope="col">准入</th><th scope="col">容量 busy</th><th scope="col">短窗拒绝</th></tr></thead><tbody>{CATEGORIES.map(category => <tr key={category}><th scope="row">{categoryLabel(category)}</th><td>{admission.counts.acceptedByCategory[category]}</td><td>{admission.counts.busyByCategory[category]}</td><td>{admission.counts.rateLimitedByCategory[category]}</td></tr>)}</tbody></table></div>
            <p className="ops-muted ops-small">并发允许不等于费用、速率或供应商成功保障；请求还可能因预算、次数、同 ID 或短窗限速被拒绝。</p>
          </div> : null}

          <div className="ops-two-column">
            <div className="ops-panel">
              <div className="ops-panel-title"><div><h3>费用账本</h3><p className="ops-muted ops-small">仅本站模型与搜索账本，不含 AWS 或其他 Key；不是供应商真实账单。</p></div>{budget ? <Pill tone={budget.blocked ? 'bad' : 'good'}>{budget.blocked ? '已阻断' : '未阻断'}</Pill> : null}</div>
              {!budget ? <p className="ops-callout">预算源不可用；未知费用不显示为 $0。</p> : <>
                <div className="ops-metric-grid">
                  <Card label="已确认" value={formatUsd(budget.confirmed)} />
                  <Card label="在途预留" value={formatUsd(budget.reserved)} />
                  <Card label="有效占用" value={formatUsd(budget.confirmed + budget.reserved)} hint="确认 + 预留" />
                  <Card label="可预留余量" value={formatUsd(Math.max(0, budget.budget - budget.confirmed - budget.reserved))} />
                </div>
                <p className="ops-muted ops-small">UTC 日 {budget.day}，日上限 {formatUsd(budget.budget)}；下次 UTC 重置 {formatUtc(Date.parse(`${budget.day}T00:00:00.000Z`) + 86_400_000)}。费用在出站前预留，失败或停止不返还预留。</p>
                <h4>告警投递</h4>
                {budget.alerts.length ? <div className="ops-table-wrap"><table><caption className="ops-visually-hidden">费用告警事件</caption><thead><tr><th scope="col">阈值</th><th scope="col">原因</th><th scope="col">状态</th><th scope="col">尝试</th></tr></thead><tbody>{budget.alerts.map(alert => <tr key={alert.id}><th scope="row">{alert.threshold}%</th><td>{alert.reason === 'request_unaffordable' ? '预留不足' : '跨过阈值'}</td><td>{alert.status === 'delivered' ? '已送达' : alert.status === 'unconfigured' ? '未配置接收方' : alert.status === 'exhausted' ? '尝试耗尽' : '待发送'}</td><td>{alert.attempts}</td></tr>)}</tbody></table></div> : <p className="ops-muted">暂无告警事件。</p>}
              </>}
            </div>

            <div className="ops-panel">
              <div className="ops-panel-title"><div><h3>应用进程</h3><p className="ops-muted ops-small">CPU 是单核百分比，多核可超过 100%；事件循环延迟为 60 秒窗口近似值。</p></div>{health ? <SourceBadge status={health.process.status.memory === 'ok' ? 'ok' : health.process.status.memory} stale={processStale} /> : null}</div>
              {!health ? <p className="ops-callout">健康采集未配置。</p> : health.process.latest ? <>
                <div className="ops-metric-grid">
                  <Card label="运行时长" value={formatDuration(health.process.latest.uptimeSeconds * 1000)} />
                  <Card label="RSS" value={formatBytes(health.process.latest.rssBytes)} />
                  <Card label="堆内存" value={`${formatBytes(health.process.latest.heapUsedBytes)} / ${formatBytes(health.process.latest.heapTotalBytes)}`} />
                  <Card label="进程 CPU" value={health.process.latest.cpuPercent === null ? '等待差分' : formatPercent(health.process.latest.cpuPercent)} hint="单核 0–100% 基准" />
                  <Card label="事件循环均值" value={health.process.latest.eventLoopDelayMeanMs === null ? '等待样本' : `${health.process.latest.eventLoopDelayMeanMs.toFixed(1)} ms`} />
                  <Card label="事件循环最大" value={health.process.latest.eventLoopDelayMaxMs === null ? '等待样本' : `${health.process.latest.eventLoopDelayMaxMs.toFixed(1)} ms`} />
                </div>
                <div className="ops-inline-status"><SourceBadge status={health.process.status.cpu} stale={processStale} /><SourceBadge status={health.process.status.memory} stale={processStale} /><SourceBadge status={health.process.status.eventLoop} stale={processStale} /><span className="ops-muted">采样 {formatClock(health.process.latest.observedAt)} · {formatAge(processAge)} · {health.process.historyCount}/{health.maxSamples} 个分钟桶</span></div>
              </> : <p className="ops-callout">尚无进程样本，等待采集。</p>}
            </div>
          </div>

          <div className="ops-panel">
            <div className="ops-panel-title"><div><h3>主机与数据盘</h3><p className="ops-muted ops-small">分开显示全机 CPU 与进程 CPU；不将容器可见范围冒充专属整机。目标 Linux 依赖只读 /proc 与固定数据挂载点。</p></div>{health ? <SourceBadge status={health.host.status.cpu === 'ok' || health.host.status.memory === 'ok' || health.host.status.disk === 'ok' ? 'ok' : health.host.status.cpu} stale={hostStale} /> : null}</div>
            {!health ? <p className="ops-callout">健康采集未配置。</p> : <>
              <div className="ops-inline-status">
                <Pill>{health.host.visibility === 'container-visible' ? '容器可见范围' : health.host.visibility === 'host-or-vm' ? '宿主/虚拟机可见范围' : '平台不支持'}</Pill>
                <SourceBadge status={health.host.status.cpu} stale={hostStale} />
                <SourceBadge status={health.host.status.memory} stale={hostStale} />
                <SourceBadge status={health.host.status.disk} stale={hostStale} />
              </div>
              {health.host.latest ? <>
                <div className="ops-metric-grid">
                  <Card label="主机 CPU" value={health.host.latest.cpuPercent === null ? '等待差分' : formatPercent(health.host.latest.cpuPercent)} hint="全机总时间占比" />
                  <Card label="可用内存" value={formatBytes(health.host.latest.memoryAvailableBytes)} hint={`总内存 ${formatBytes(health.host.latest.memoryTotalBytes)}`} />
                  <Card label="数据盘可用" value={formatBytes(health.host.latest.diskAvailableBytes)} hint={`总量 ${formatBytes(health.host.latest.diskTotalBytes)}`} />
                  <Card label="数据盘使用率" value={formatPercent(health.host.latest.diskUsedPercent)} />
                </div>
                <p className="ops-muted ops-small">采样 {formatClock(health.host.latest.observedAt)} · {formatAge(hostAge)} · {health.host.historyCount}/{health.maxSamples} 个分钟桶。{health.host.note}</p>
              </> : <p className="ops-callout">{health.host.note}</p>}
            </>}
          </div>

          {health ? <div className="ops-panel">
            <h3>请求终态与耗时</h3>
            <p className="ops-muted ops-small">{health.requests.note}</p>
            <div className="ops-table-wrap"><table><caption className="ops-visually-hidden">分类请求终态和近似 p95</caption><thead><tr><th scope="col">分类</th><th scope="col">成功</th><th scope="col">失败</th><th scope="col">取消</th><th scope="col">超时</th><th scope="col">样本</th><th scope="col">近似 p95</th></tr></thead><tbody>{CATEGORIES.map(category => {
              const report = health.requests.terminal[category];
              return <tr key={category}><th scope="row">{categoryLabel(category)}</th><td>{report.terminal.success}</td><td>{report.terminal.failed}</td><td>{report.terminal.cancelled}</td><td>{report.terminal.timedOut}</td><td>{terminalTotal(report.terminal)}</td><td>{report.durations.samples ? `${p95Text(report.durations.p95)}（${report.durations.samples}）` : '无样本'}</td></tr>;
            })}</tbody></table></div>
            <div className="ops-details-grid">{CATEGORIES.map(category => <DurationBuckets key={category} report={health.requests.terminal[category].durations} />)}</div>
          </div> : null}
        </>}
      </section>
    </main>
    <footer className="ops-footer"><span><Server size={14} aria-hidden="true" /> 服务器：回环 ops · 凭据仅在查看器服务端</span><span><HardDrive size={14} aria-hidden="true" /> 采样仅保存在当前进程内存，重启不伪造历史</span><span><ShieldCheck size={14} aria-hidden="true" /> 只读：无付费、无发信、无写入</span></footer>
  </div>;
}
