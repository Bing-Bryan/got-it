import {act, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createInitialWorkspace} from '../sample';
import {webWorkspace} from '../test-support/web';
import {useReadingLibrary} from '../useReadingLibrary';
import type {LibraryEntry} from './library-types';
import type {WebImportJob} from './web-data';

const {request, noteImportOperation, noteCount} = vi.hoisted(() => ({request: vi.fn(), noteImportOperation: vi.fn(), noteCount: vi.fn()}));
vi.mock('./library-client', () => ({libraryRequest: request, libraryBinary: vi.fn()}));
vi.mock('./hosted-usage', () => ({noteImportOperation, noteCount, markMaterial: vi.fn(), confirmSavedAnswers: vi.fn(), track: vi.fn()}));

let root: Root;
let control: ReturnType<typeof useReadingLibrary>;
let current: ReturnType<typeof createInitialWorkspace>;
let job: WebImportJob;
let entry: LibraryEntry;
function Harness() {
  const [workspace, setWorkspace] = useState(createInitialWorkspace());
  current = workspace;
  control = useReadingLibrary({workspace, install: setWorkspace, interrupt: () => workspace});
  return <div className="reader-scroll" />;
}
async function mount() {
  await act(async () => { root = createRoot(document.body.appendChild(document.createElement('div'))); root.render(<Harness />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
}
function response() {
  return {
    operationId: job?.operationId,
  };
}
function dispatch(path = '', body?: Record<string, any>) {
  if (!path) return {entries: [], activeId: null, warnings: [], nativePicker: true};
  if (path === '/recoveries') return [];
  if (path === '/web-imports') {
    job = {operationId: body!.operationId, status: 'ready', progress: '正文已读取', preview: {candidateId: 'candidate', workspace: webWorkspace()}};
    return job;
  }
  if (path.endsWith('/cancel')) return {};
  if (path.endsWith('/confirm')) return entry;
  if (path.startsWith('/web-imports/')) return job;
  if (path.startsWith('/entries/')) return entry;
  throw new Error(path);
}
beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  localStorage.clear(); sessionStorage.clear();
  noteImportOperation.mockReset(); noteCount.mockReset();
  entry = {creationKey: 'web-key', id: 'web-entry', version: 1, revisionId: 'revision', workspace: webWorkspace(), position: {ratio: 0}, source: null, history: [], updatedAt: '2026', lastOpenedAt: '2026'};
  request.mockReset().mockImplementation(dispatch);
});
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ''; });
async function read() { await act(async () => control.readWebUrl('https://example.org/article')); }
function lastOperation() { return noteImportOperation.mock.calls.at(-1)?.[0]; }

describe('web import operation observability', () => {
  it('records one recovered success after a failed confirmation retry', async () => {
    await mount(); await read();
    let fail = true;
    request.mockImplementation((path, body) => {
      if (String(path).endsWith('/confirm') && fail) { fail = false; throw Object.assign(new Error('temporary network failure'), {code: 'network'}); }
      return dispatch(path, body);
    });
    await act(async () => control.confirmWebImport(true));
    expect(noteImportOperation).not.toHaveBeenCalled();
    await act(async () => control.confirmWebImport(true));
    const operation = lastOperation();
    expect(operation).toMatchObject({outcome: 'success', attempts: 2, recovered: true, errorCategory: 'network'});
    expect(noteImportOperation).toHaveBeenCalledOnce();
    expect(noteCount).toHaveBeenCalledWith('import_failed', 'web');
  });

  it('records one failed operation when polling errors without retrying the import', async () => {
    await mount();
    request.mockImplementation((path, body) => {
      if (path === '/web-imports') return job = {operationId: body!.operationId, status: 'reading', progress: '读取中'};
      if (String(path).startsWith('/web-imports/')) return Promise.reject(Object.assign(new Error('network unavailable'), {code: 'network'}));
      return dispatch(path, body);
    });
    await act(async () => { await control.readWebUrl('https://example.org/article'); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 520)); });
    expect(lastOperation()).toMatchObject({outcome: 'failed', errorCategory: 'network', recovered: false});
    expect(noteImportOperation).toHaveBeenCalledOnce();
    expect(noteCount).toHaveBeenCalledWith('import_failed', 'web');
  });

  it('records only one success when confirmation is submitted twice', async () => {
    await mount(); await read();
    await act(async () => { await Promise.all([control.confirmWebImport(true), control.confirmWebImport(true)]); });
    expect(lastOperation()).toMatchObject({outcome: 'success', recovered: false});
    expect(noteImportOperation).toHaveBeenCalledOnce();
  });

  it('records cancellation once and ignores a late result', async () => {
    await mount(); await read();
    await act(async () => control.cancelWebImport(true));
    expect(lastOperation()).toMatchObject({outcome: 'cancelled', attempts: 1, recovered: false, errorCategory: null});
    expect(noteImportOperation).toHaveBeenCalledOnce();
  });

  it('records an expired job as expired rather than failed', async () => {
    await mount(); await read();
    job = {...job, status: 'expired', progress: '读取作业已过期'};
    await act(async () => control.confirmWebImport(true));
    expect(lastOperation()).toMatchObject({outcome: 'expired', attempts: 1, recovered: false, errorCategory: null});
    expect(noteImportOperation).toHaveBeenCalledOnce();
    expect(noteCount).toHaveBeenCalledWith('import_failed', 'web');
  });
});
