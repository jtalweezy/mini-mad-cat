'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
function authenticated(header, token) {
  const received = Buffer.from(typeof header === 'string' ? header : '');
  const expected = Buffer.from('Bearer ' + token);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
async function createControlServer({ getStatus, execute }) {
  const token = crypto.randomBytes(32).toString('hex');
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const reply = (code, body) => { if (!res.writableEnded) { res.writeHead(code); res.end(JSON.stringify(body)); } };
    // No browser origins and no CORS. Only the same-user bridge knows the bearer token.
    if (req.headers.origin) { reply(403, { error: 'Browser requests are disabled' }); return; }
    if (!authenticated(req.headers.authorization, token)) { reply(401, { error: 'Authentication required' }); return; }
    if (req.method === 'GET' && req.url === '/status') { reply(200, getStatus()); return; }
    if (req.method !== 'POST' || req.url !== '/command') { reply(404, { error: 'Unknown route' }); return; }
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) { reply(415, { error: 'application/json required' }); return; }
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk.toString('utf8');
        if (Buffer.byteLength(body) > 16384) { reply(413, { error: 'Request too large' }); req.destroy(); return; }
      }
      const result = await execute(JSON.parse(body));
      reply(200, result);
    } catch (error) { reply(400, { error: error.message }); }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 5000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, token, port: server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}
module.exports = { authenticated, createControlServer };
