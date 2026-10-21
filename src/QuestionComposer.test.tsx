import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {QuestionComposer} from './QuestionComposer';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;host=document.body.appendChild(document.createElement('div'));root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function fill(value:string){await act(async()=>{const input=host.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
async function submit(){await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});}
it('keeps unsent draft when a guard rejects and does not submit on readiness changes',async()=>{
 const send=vi.fn().mockResolvedValue(false);await act(async()=>root.render(<QuestionComposer initialOpen onSubmit={send}/>));await fill('保留这个问题');await submit();expect(host.querySelector('textarea')!.value).toBe('保留这个问题');
 await act(async()=>root.render(<QuestionComposer initialOpen disabled onSubmit={send}/>));await act(async()=>root.render(<QuestionComposer initialOpen onSubmit={send}/>));expect(send).toHaveBeenCalledTimes(1);expect(host.querySelector('textarea')!.value).toBe('保留这个问题');
});
it('does not duplicate pending storage preparation; clears only accepted submission',async()=>{
 let finish!:(value:boolean)=>void;const send=vi.fn(()=>new Promise<boolean>(r=>finish=r));await act(async()=>root.render(<QuestionComposer initialOpen onSubmit={send}/>));await fill('明确提交');await submit();await submit();expect(send).toHaveBeenCalledTimes(1);await act(async()=>finish(true));expect(host.querySelector('textarea')).toBeNull();
});
it('retains draft when preparation fails',async()=>{await act(async()=>root.render(<QuestionComposer initialOpen onSubmit={()=>Promise.reject(new Error('save failed'))}/>));await fill('保存失败也保留');await submit();expect(host.querySelector('textarea')!.value).toBe('保存失败也保留');});
it('keeps a newer edit while the previous submission is awaiting acceptance',async()=>{let finish!:(v:boolean)=>void;const send=vi.fn(()=>new Promise<boolean>(r=>finish=r));await act(async()=>root.render(<QuestionComposer initialOpen onSubmit={send}/>));await fill('问题 A');await submit();expect(host.querySelector('textarea')!.disabled).toBe(true);await fill('问题 B');await act(async()=>finish(true));expect(host.querySelector('textarea')!.value).toBe('问题 B');expect(send).toHaveBeenCalledTimes(1);});
