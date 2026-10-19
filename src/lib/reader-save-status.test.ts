import {expect,it} from 'vitest';
import {readerSaveStatus} from './reader-save-status';
import {webWorkspace} from '../test-support/web';

it('shortens only explicit successful persistence labels across local and hosted documents',()=>{
  for(const status of ['已保存','已保存到本机','已保存到当前浏览器']) expect(readerSaveStatus(status)).toBe('已保存');
});
it('preserves incomplete, failed and qualified persistence outcomes verbatim',()=>{
  for(const status of ['保存中','保存失败','未保存','阅读进度暂未保存','已保存，部分内容未导入','已保存到本机，但备份失败','正文已保存到本机，2张图片未保存','仅保存公开部分','示例文档']) expect(readerSaveStatus(status)).toBe(status);
  expect(readerSaveStatus('保存中…')).toBe('保存中…');
});
it('keeps missing public-X media visible even when the persistence status is successful',()=>{
  const document=webWorkspace().document;if(document.kind!=='web')throw Error('fixture');
  document.web.extractorVersion='x-fxtwitter-public-v1';
  const missing=document.web.media.filter(media=>media.status!=='saved').length;
  expect(missing).toBeGreaterThan(0);
  expect(readerSaveStatus('已保存到当前浏览器',document)).toBe(`正文已保存，${missing}张图片未保存`);
  for(const status of ['保存中','保存失败','未保存','正文已保存，但备份失败'])expect(readerSaveStatus(status,document)).toBe(status);
});

it('preserves the actual blocked error and only guards a stale successful label against false success',()=>{
 for(const status of ['阅读进度暂未保存','保存失败：磁盘空间不足','保存失败','正文已保存，但备份失败']) expect(readerSaveStatus(status,undefined,true)).toBe(status);
 for(const status of ['已保存','已保存到本机','已保存到当前浏览器'])expect(readerSaveStatus(status,undefined,true)).toBe('未保存');
});
