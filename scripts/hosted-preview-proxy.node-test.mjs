import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {createServer, request} from 'node:http';
import {once} from 'node:events';
import {proxyHostedRequest} from './hosted-preview-proxy.mjs';

let upstream;
let preview;
let upstreamPort;
let previewPort;
let seenHeaders;
let seenBody;
let upstreamClosed;

before(async () => {
  upstream = createServer((req, res) => {
    seenHeaders = req.headers;
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => { seenBody = Buffer.concat(chunks).toString(); });
    if (req.url === '/stream') {
      res.writeHead(200, {'Content-Type': 'application/x-ndjson'});
      res.write('{"type":"progress"}\n');
      setTimeout(() => {
        if (!res.destroyed) {
          res.end('{"type":"complete"}\n');
        }
      }, 80);
      return;
    }
    if (req.url === '/cancel') {
      res.writeHead(200, {'Content-Type': 'application/x-ndjson'});
      res.write('{"type":"progress"}\n');
      res.on('close', () => { upstreamClosed?.(); });
      return;
    }
    if (req.url === '/upstream-reset') {
      res.writeHead(200, {'Content-Type': 'application/x-ndjson'});
      res.write('{"type":"progress"}\n');
      setTimeout(() => res.socket?.destroy(), 40);
      return;
    }
    res.writeHead(404).end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  upstreamPort = upstream.address().port;

  preview = createServer((req, res) => proxyHostedRequest(req, res, upstreamPort));
  preview.listen(0, '127.0.0.1');
  await once(preview, 'listening');
  previewPort = preview.address().port;
});

after(async () => {
  preview?.close();
  upstream?.close();
  await Promise.all([once(preview, 'close'), once(upstream, 'close')]);
});

test('proxy streams each chunk and preserves request metadata while replacing XFF', async () => {
  const started = Date.now();
  const receivedAt = [];
  const chunks = [];
  const responsePromise = new Promise((resolve, reject) => {
    const client = request({
      host: '127.0.0.1', port: previewPort, path: '/stream', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.9',
        Origin: `http://127.0.0.1:${previewPort}`,
      },
    }, response => {
      response.on('data', chunk => {
        receivedAt.push(Date.now() - started);
        chunks.push(chunk.toString());
      });
      response.on('end', () => resolve({response, body: chunks.join('')}));
    });
    client.once('error', reject);
    client.end('{"question":"stream test"}');
  });
  const {response, body} = await responsePromise;

  assert.equal(response.statusCode, 200);
  assert.match(body, /progress/);
  assert.match(body, /complete/);
  assert.equal(receivedAt.length, 2);
  assert(receivedAt[1] - receivedAt[0] >= 40, 'the preview must not buffer until upstream completes');
  assert.equal(seenHeaders.origin, `http://127.0.0.1:${previewPort}`);
  assert.equal(seenHeaders['x-forwarded-for'], '127.0.0.1');
  assert.equal(seenHeaders.host, `127.0.0.1:${previewPort}`);
  assert.equal(seenBody, '{"question":"stream test"}');
});

test('client disconnect closes the upstream response', async () => {
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  upstreamClosed = resolveClosed;
  const client = request({host: '127.0.0.1', port: previewPort, path: '/cancel'});
  const gotFirstChunk = new Promise((resolve, reject) => {
    client.once('response', response => {
      response.once('data', resolve);
      response.once('error', reject);
    });
    client.once('error', reject);
  });
  client.end();
  await gotFirstChunk;
  client.destroy();
  await Promise.race([
    closed,
    new Promise((_, reject) => setTimeout(() => reject(Error('upstream remained open after client disconnect')), 1500)),
  ]);
  upstreamClosed = null;
});

test('upstream reset after a streamed chunk fails the client promptly without completion', async () => {
  const started = Date.now();
  let partial = '';
  const client = request({host: '127.0.0.1', port: previewPort, path: '/upstream-reset'});
  const outcome = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('downstream hung after upstream reset')), 700);
    client.once('response', response => {
      response.on('data', chunk => { partial += chunk.toString(); });
      const fail = kind => { clearTimeout(timer); resolve({kind, complete: response.complete}); };
      response.once('aborted', () => fail('aborted'));
      response.once('error', () => fail('error'));
      response.once('close', () => fail('closed'));
      response.once('end', () => fail('ended'));
    });
    client.once('error', () => { clearTimeout(timer); resolve({kind: 'client-error', complete: false}); });
  });
  client.end();
  const result = await outcome;
  assert.match(partial, /progress/);
  assert.notEqual(result.kind, 'ended', 'an incomplete upstream stream must not look complete');
  assert.equal(result.complete, false);
  assert(Date.now() - started < 700);
});
