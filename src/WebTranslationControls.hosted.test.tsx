import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
vi.mock('./lib/runtime-mode', () => ({HOSTED:true, trialId:()=> 'trial', hostedCapabilities:vi.fn()}));
import {WebTranslationControls} from './WebTranslationControls';
import {webWorkspace} from './test-support/web';
import type {useReadingLibrary} from './useReadingLibrary';

it('starts hosted translation on the explicit icon without a second panel or implicit automatic consent', async () => {
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.body.appendChild(document.createElement('div')),root=createRoot(host),workspace=webWorkspace();const library={status:'已保存到当前浏览器',ready:true,readOnly:false,autoTranslate:false,translationRunning:false,translationProgress:'',translate:vi.fn(),stopTranslation:vi.fn(),setAutoTranslation:vi.fn()} as unknown as ReturnType<typeof useReadingLibrary>;
 try{await act(async()=>root.render(<WebTranslationControls workspace={workspace} library={library} onSide={()=>{}}/>));expect(library.translate).not.toHaveBeenCalled();await act(async()=>host.querySelector<HTMLButtonElement>('.translation-side-toggle')!.click());expect(library.translate).toHaveBeenCalledOnce();expect(library.setAutoTranslation).not.toHaveBeenCalled();expect(host.querySelector('.translation-permission')).toBeNull();expect(host.querySelector('input')).toBeNull();}finally{await act(async()=>root.unmount());host.remove();}
});
