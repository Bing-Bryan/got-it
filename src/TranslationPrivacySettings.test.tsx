import {act} from 'react';import {createRoot} from 'react-dom/client';import {expect,it,vi} from 'vitest';
import {TranslationPrivacySettings} from './TranslationPrivacySettings';
it('explains full text boundaries and changes automatic consent only through its separate checkbox',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.body.appendChild(document.createElement('div')),root=createRoot(host),change=vi.fn();
 try{await act(async()=>root.render(<TranslationPrivacySettings automatic={false} onAutomaticChange={change}/>));const input=host.querySelector<HTMLInputElement>('input')!;expect(input.checked).toBe(false);expect(host.textContent).toContain('代码、URL 和图片不发送');expect(host.textContent).toContain('默认关闭');expect(host.textContent).toContain('重复网址、Markdown 和 PDF 不会自动翻译');expect(change).not.toHaveBeenCalled();await act(async()=>input.click());expect(change).toHaveBeenLastCalledWith(true);await act(async()=>root.render(<TranslationPrivacySettings automatic onAutomaticChange={change}/>));await act(async()=>input.click());expect(change).toHaveBeenLastCalledWith(false);}finally{await act(async()=>root.unmount());host.remove();}
});
