import {request as httpRequest} from 'node:http';

/** Forward one same-origin hosted API request while preserving streaming and disconnects. */
export function proxyHostedRequest(req, res, apiPort) {
  const headers = {
    ...req.headers,
    // The loopback API trusts this header only after the proxy replaces any client value.
    'x-forwarded-for': req.socket.remoteAddress || '127.0.0.1',
  };
  const upstream = httpRequest({
    host: '127.0.0.1',
    port: apiPort,
    path: req.originalUrl || req.url,
    method: req.method,
    headers,
  });

  req.on('aborted', () => upstream.destroy(new Error('client disconnected')));
  req.pipe(upstream);
  upstream.on('response', response => {
    res.writeHead(response.statusCode || 502, response.headers);
    response.on('aborted', () => res.destroy());
    response.on('error', () => res.destroy());
    response.on('close', () => {
      if (!response.complete) res.destroy();
    });
    response.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({error: '托管 API 暂不可用', code: 'api_unavailable'}));
    } else {
      res.destroy();
    }
  });
  res.on('close', () => {
    if (!res.writableEnded) upstream.destroy();
  });
  return upstream;
}
