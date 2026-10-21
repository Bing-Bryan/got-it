import {describe, expect, it} from 'vitest';
import {classifyImportError, IMPORT_ERROR_CATEGORIES} from './web-import-observability';

describe('web import error classification', () => {
  it('maps known transport and server failures to finite categories', () => {
    expect(classifyImportError(Object.assign(new Error('slow'), {code: 'web_timeout'}))).toBe('timeout');
    expect(classifyImportError(Object.assign(new Error('rate limit'), {status: 429}))).toBe('rate_limited');
    expect(classifyImportError(Object.assign(new Error('down'), {status: 503}))).toBe('server_error');
    expect(classifyImportError({message: '网页或媒体超过读取容量限制。', code: 'web_budget'})).toBe('too_large');
    expect(classifyImportError({status: 413, code: 'too_large'})).toBe('too_large');
    expect(classifyImportError({message: '今日体验额度已用完', status: 429, code: 'global_quota_exhausted'})).toBe('capacity');
    expect(classifyImportError({message: '当前体验请求较多，请稍后重试。已有内容仍可阅读。', status: 429, code: 'busy'})).toBe('capacity');
    expect(classifyImportError(Object.assign(new Error('bad'), {status: 400}))).toBe('rejected');
    expect(classifyImportError(Object.assign(new Error('large'), {code: 'too_large'}))).toBe('too_large');
    expect(classifyImportError(Object.assign(new Error('extract'), {code: 'invalid_content'}))).toBe('invalid_content');
    expect(classifyImportError(new TypeError('Failed to fetch'))).toBe('network');
  });

  it('never returns raw exception text or invents a category', () => {
    const secret = {message: 'https://private.example/title?token=SECRET', name: 'Error'};
    const category = classifyImportError(secret);
    expect(IMPORT_ERROR_CATEGORIES).toContain(category);
    expect(JSON.stringify(category)).not.toContain('private.example');
    expect(category).toBe('unknown');
  });
});
