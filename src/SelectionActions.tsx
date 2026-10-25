import { ActionAvailability } from './ActionAvailability';
import type { ActionUnavailable } from './lib/action-availability';
import { Lightbulb, ShieldCheck, X } from 'lucide-react';
import { QuestionComposer } from './QuestionComposer';
import { useId, useState, type ReactNode } from 'react';
import type { ActiveInquiryIntent } from './types';

type ActionIntent = 'explain' | 'verify' | 'ask';
export type SelectionActionReasons = Partial<Record<ActionIntent, string>>;

/** Shared selection actions for Markdown text, PDF text, PDF regions and web images. */
export function SelectionActions({ onSelect, onClose, disabled, bookmark, unavailable, onRecover, saveWarning, className = '', actionReasons, closeTitle = '关闭选区' }: {
  onSelect: (intent: ActiveInquiryIntent, question?: string) => void | boolean | Promise<void | boolean>;
  onClose: () => void;
  disabled?: boolean;
  bookmark?: ReactNode;
  className?: string;
  unavailable?: ActionUnavailable;
  saveWarning?: boolean;
  onRecover?: (target: 'connection' | 'save') => void;
  actionReasons?: SelectionActionReasons;
  closeTitle?: string;
}) {
  const [questionOpen, setQuestionOpen] = useState(false);
  const reasonId = useId();
  const reason = actionReasons?.explain ?? actionReasons?.verify ?? actionReasons?.ask;
  return <ActionAvailability unavailable={unavailable} onRecover={onRecover} saveWarning={saveWarning}><div className="selection-operation-row">{bookmark ? <div className="selection-bookmark-container">{bookmark}</div> : null}<div className={`selection-actions ${className}`}>
    <button type="button" data-intent="explain" disabled={disabled || !!actionReasons?.explain} title={actionReasons?.explain} aria-describedby={actionReasons?.explain ? reasonId : undefined} onClick={() => onSelect('explain')}><Lightbulb size={14} aria-hidden="true"/>解释一下</button>
    <button type="button" data-intent="verify" disabled={disabled || !!actionReasons?.verify} title={actionReasons?.verify} aria-describedby={actionReasons?.verify ? reasonId : undefined} onClick={() => onSelect('verify')}><ShieldCheck size={14} aria-hidden="true"/>查找来源</button>
    <QuestionComposer inline hideBackButton onCancel={onClose} onOpenChange={setQuestionOpen} disabled={disabled || !!actionReasons?.ask} onSubmit={question => onSelect('ask', question)}/>
    {questionOpen ? null : <button className="selection-close" type="button" aria-label="关闭" title={closeTitle} onClick={onClose}><X size={14} aria-hidden="true"/></button>}
  </div>{reason ? <p id={reasonId} className="selection-action-note">{reason}</p> : null}</div></ActionAvailability>;
}
