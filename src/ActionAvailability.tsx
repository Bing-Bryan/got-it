import { useId } from 'react';
import type { ReactNode } from 'react';
import type { ActionUnavailable } from './lib/action-availability';
/** The status remains visible on touch; its recovery only opens an existing surface. */
export function ActionAvailability({ unavailable, onRecover, saveWarning, children }: {unavailable?:ActionUnavailable;saveWarning?:boolean;onRecover?:(target:'connection'|'save')=>void;children?:ReactNode}) {
  const id=useId();
  const status:Omit<ActionUnavailable,"reason">|undefined=unavailable??(saveWarning?{message:"阅读记录尚未保存，当前草稿仍保留。",recovery:"save" as const}:undefined);
  return <div className="action-availability" role="group" aria-describedby={status?id:undefined}>
    {children}
    {status?<div className="action-unavailable" id={id}><span>{status.message}</span>{status.recovery&&onRecover?<button type="button" className="secondary-action" onClick={()=>onRecover(status.recovery!)}>{status.recoveryLabel ?? (status.recovery==='connection'?'查看连接与模型':'查看保存状态')}</button>:null}</div>:null}
  </div>;
}
