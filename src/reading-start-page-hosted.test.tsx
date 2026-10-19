import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ReadingStartPage} from './ReadingStartPage';
import {createPlaceholderWorkspace} from './sample';
import type {useReadingLibrary} from './useReadingLibrary';
import {browserBackup,browserStorageStatus} from './lib/browser-library';
vi.mock('./lib/runtime-mode',async original=>({...await original<typeof import('./lib/runtime-mode')>(),HOSTED:true}));
vi.mock('./lib/library-client',()=>({libraryRequest:vi.fn().mockResolvedValue({bookmarks:[],total:0,warnings:[]})}));
vi.mock('./lib/browser-library',()=>({browserStorageStatus:vi.fn(),browserBackup:vi.fn(),sha256:vi.fn(),storeSampleImages:vi.fn()}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.body.appendChild(document.createElement('div'));root=createRoot(host);vi.mocked(browserStorageStatus).mockResolvedValue({persistent:true,usage:2097152});vi.mocked(browserBackup).mockResolvedValue('real bounded backup');vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({samples:[]})}));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();});
async function mount(save=vi.fn().mockResolvedValue(undefined),restore=vi.fn()){
 const library={entry:null,list:{entries:[],warnings:[],nativePicker:false},ready:true,busy:false,error:'',recoveries:[],saveNow:save} as unknown as ReturnType<typeof useReadingLibrary>;
 await act(async()=>root.render(<ReadingStartPage library={library} workspace={createPlaceholderWorkspace()} onFile={restore} onContinue={vi.fn()} onNote={vi.fn()} onBookmarks={vi.fn()}/>));
 await act(async()=>host.querySelectorAll<HTMLButtonElement>('.start-nav-button')[1].click());return {save,restore};
}
it('uses real browser storage content inside the home modal and refuses backup when saving fails',async()=>{
 const save=vi.fn().mockRejectedValue(Error('受控保存失败'));await mount(save);
 expect(host.querySelector('.start-privacy-dialog')).not.toBeNull();expect(host.textContent).toContain('材料与成果仅保存在当前浏览器');expect(host.querySelector('.hosted-storage-details,.hosted-privacy-details')).toBeNull();expect(host.textContent).not.toContain('存储详情');expect(host.textContent).not.toContain('发送与隐私');expect(host.textContent).not.toContain('主动全文译中');expect(browserStorageStatus).not.toHaveBeenCalled();expect(host.textContent).not.toContain('每天有提问额度，打开和阅读不占用');
 await act(async()=>host.querySelector<HTMLButtonElement>('.hosted-backup-actions button')!.click());expect(save).toHaveBeenCalledOnce();expect(browserBackup).not.toHaveBeenCalled();expect(host.querySelector('.start-privacy-dialog [role=alert]')?.textContent).toBe('受控保存失败');
});
it('backs up only after real save and closes the modal before the existing restore picker callback',async()=>{
 const order:string[]=[],save=vi.fn(async()=>{order.push('saved');});vi.mocked(browserBackup).mockImplementation(async()=>{order.push('backup');return 'bounded existing data';});
 const createUrl=vi.fn().mockReturnValue('blob:controlled-backup');vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:createUrl,revokeObjectURL:vi.fn()}));const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 const restore=vi.fn();await mount(save,restore);await act(async()=>host.querySelector<HTMLButtonElement>('.hosted-backup-actions button')!.click());expect(order).toEqual(['saved','backup']);expect(createUrl).toHaveBeenCalledWith(expect.any(Blob));expect(click).toHaveBeenCalledOnce();expect(browserStorageStatus).not.toHaveBeenCalled();
 await act(async()=>host.querySelectorAll<HTMLButtonElement>('.hosted-backup-actions button')[1].click());expect(restore).toHaveBeenCalledOnce();expect(host.querySelector('dialog')).toBeNull();
});
it('keeps both backup actions disabled until the real save settles and retains a visible failure',async()=>{
 let fail!:(error:Error)=>void;const save=vi.fn(()=>new Promise<void>((_resolve,reject)=>{fail=reject;}));const restore=vi.fn();await mount(save,restore);
 await act(async()=>host.querySelector<HTMLButtonElement>('.hosted-backup-actions button')!.click());
 const buttons=host.querySelectorAll<HTMLButtonElement>('.hosted-backup-actions button');expect([...buttons].every(button=>button.disabled)).toBe(true);
 await act(async()=>{buttons[0].click();buttons[1].click();});expect(save).toHaveBeenCalledOnce();expect(restore).not.toHaveBeenCalled();expect(browserBackup).not.toHaveBeenCalled();
 await act(async()=>fail(Error('受控延迟保存失败')));expect([...buttons].every(button=>!button.disabled)).toBe(true);expect(host.querySelector('[role=alert]')?.textContent).toBe('受控延迟保存失败');expect(browserBackup).not.toHaveBeenCalled();expect(browserStorageStatus).not.toHaveBeenCalled();
});
