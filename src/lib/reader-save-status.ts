import type { DocumentSnapshot } from '../types';

/** Only shorten known, complete persistence outcomes; warnings remain verbatim. */
export function readerSaveStatus(status: string, document?: DocumentSnapshot, blocked = false): string {
  const complete = status === '已保存' || status === '已保存到本机' || status === '已保存到当前浏览器';
  if (blocked && complete) return '未保存';
  if (document?.kind === 'web' && document.web.extractorVersion === 'x-fxtwitter-public-v1' && complete) {
    const missing = document.web.media.filter(media => media.status !== 'saved').length;
    if (missing) return `正文已保存，${missing}张图片未保存`;
  }
  if (complete) return '已保存';
  return status;
}
