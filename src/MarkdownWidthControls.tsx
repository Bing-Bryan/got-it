import { useReadingAdjustment } from './useReadingAdjustment';
import { useId, useRef, useState, type CSSProperties } from 'react';
import { RotateCcw, MoveHorizontal } from 'lucide-react';
import { clampMarkdownWidth } from './useMarkdownWidth';

export function MarkdownWidthControls({ width, measuredPercent = 100, error = "", onChange }: { width: number | null; measuredPercent?: number; error?: string; onChange: (width: number | null) => void }) {
  const panelId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const { root: root, open, close, triggerClick, events } = useReadingAdjustment();
  const trigger = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);
  const commit = () => {
    if (!cancelled.current && draft !== null && /^\d+(\.\d+)?%?$/.test(draft.trim())) onChange(clampMarkdownWidth(Number(draft.trim().replace(/%$/, ''))));
    setDraft(null);
  };
  return <div {...events} ref={root} className={`reading-adjustment markdown-width-controls${open ? ' is-open' : ''}`} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelled.current = true; setDraft(null); close(); if (open) trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" className="reading-adjustment-trigger markdown-width-trigger" title="正文宽度" aria-controls={panelId} aria-expanded={open} aria-label={`调整正文宽度，当前${width === null ? "推荐" : ` ${width}%`}`} onClick={triggerClick}><MoveHorizontal size={18} strokeWidth={1.8} aria-hidden="true"/></button>
    <div id={panelId} hidden={!open} className="reading-adjustment-fields markdown-width-fields" role="group" aria-label="正文宽度设置">
      <span className="reading-adjustment-label markdown-width-label">正文宽度 · {width === null ? "推荐" : "自定义"}</span>
      <input className="markdown-width-slider" type="range" min="50" max="100" step="1" value={width ?? clampMarkdownWidth(measuredPercent)} aria-label="正文宽度" aria-valuetext={width === null ? `推荐，当前约占阅读区 ${measuredPercent}%` : `${width}%`} style={{'--width-progress': `${((width ?? clampMarkdownWidth(measuredPercent)) - 50) * 2}%`} as CSSProperties} onChange={e => onChange(Number(e.target.value))}/>
      <label className="markdown-width-value"><input aria-label="正文宽度百分比" inputMode="numeric" placeholder="推荐" value={draft ?? width ?? ""} onFocus={e => { cancelled.current = false; setDraft(width === null ? "" : String(width)); e.target.select(); }} onChange={e => { cancelled.current = false; setDraft(e.target.value); }} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}/><span>{width === null ? "" : "%"}</span></label>
      <button type="button" className="markdown-width-reset" aria-label="恢复推荐正文宽度" title="恢复推荐正文宽度" disabled={width === null} onClick={() => { setDraft(null); onChange(null); }}><RotateCcw size={14}/></button>
      {error ? <span className="markdown-width-error" role="status">{error}</span> : null}
    </div>
  </div>;
}
