import 'fake-indexeddb/auto';
import {webcrypto} from 'node:crypto';
import {act,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('./lib/runtime-mode',()=>({HOSTED:true}));
import {useReadingLibrary} from './useReadingLibrary';
import {createPlaceholderWorkspace} from './sample';
import * as client from './lib/library-client';
import {browserRequest} from './lib/browser-library';
import type {LibraryList} from './lib/library-types';
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
let root:Root,control:ReturnType<typeof useReadingLibrary>;
function Harness(){const [workspace,set]=useState(createPlaceholderWorkspace);control=useReadingLibrary({workspace,install:set,interrupt:()=>workspace});return null;}
beforeEach(async()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});localStorage.clear();await new Promise<void>(resolve=>{const r=indexedDB.deleteDatabase('got-it.browser-library.v1');r.onsuccess=()=>resolve();});const host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>{root.render(<Harness/>);});for(let i=0;i<40&&(!control.ready||control.busy);i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});expect(control.ready).toBe(true);});
afterEach(async()=>{vi.restoreAllMocks();await act(async()=>root.unmount());document.body.innerHTML='';});
function safeFile(){const file=new File(['# Safe example\n\nNo model request.'],'safe.md',{type:'text/markdown'});Object.defineProperty(file,'text',{value:async()=>'# Safe example\n\nNo model request.'});return file;}
it('never persists a placeholder, including an attempted first action',async()=>{expect((await browserRequest<LibraryList>()).entries).toHaveLength(0);await expect(control.ensureEntry()).rejects.toThrow('请先添加阅读材料');expect((await browserRequest<LibraryList>()).entries).toHaveLength(0);});
it('imports explicitly and keeps failed imports on the empty start state',async()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('full','QuotaExceededError');};try{await act(async()=>control.importFile(safeFile()));expect(control.entry).toBeNull();expect(control.error).toBeTruthy();}finally{IDBObjectStore.prototype.put=original;}await act(async()=>control.importFile(safeFile()));expect((await browserRequest<LibraryList>()).entries).toHaveLength(1);expect(control.entry?.workspace.document.filename).toBe('safe.md');});
it('locks material transitions while the explicit import transaction is pending',async()=>{let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const original=client.libraryRequest;vi.spyOn(client,'libraryRequest').mockImplementation((async(path='',body?:unknown)=>{if(path==='/entries')await gate;return original(path,body);}) as typeof original);let preparation!:Promise<void>;await act(async()=>{preparation=control.importFile(safeFile());await new Promise(resolve=>setTimeout(resolve,0));});expect(control.busy).toBe(true);await act(async()=>control.importFile(safeFile()));expect((await browserRequest<LibraryList>()).entries).toHaveLength(0);await act(async()=>{release();await preparation;});expect(control.busy).toBe(false);expect((await browserRequest<LibraryList>()).entries).toHaveLength(1);});
