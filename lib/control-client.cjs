'use strict';
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { dataDirectory } = require('./paths.cjs');
const { ensurePrivateDirectory } = require('./endpoint-file.cjs');
async function requestCompanion(command, options = {}) {
  const directory = options.directory || dataDirectory();
  let endpoint;
  try {
    // This is an explicit local settings directory, never an MCP tool argument.
    // Canonicalize it and refuse endpoint links before reading the bearer token.
    const privateDirectory = ensurePrivateDirectory(directory);
    const endpointPath = path.join(privateDirectory, 'control.json');
    const info = await fs.lstat(endpointPath);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 8192) throw new Error('Invalid endpoint file');
    const canonicalEndpoint = await fs.realpath(endpointPath);
    if (!canonicalEndpoint.startsWith(privateDirectory + path.sep) || path.dirname(canonicalEndpoint) !== privateDirectory) throw new Error('Endpoint escaped the local settings directory');
    endpoint = JSON.parse(await fs.readFile(canonicalEndpoint, 'utf8'));
  }
  catch { throw new Error('Mini Mad Cat is not running. Open the companion, then retry.'); }
  if (!endpoint || !Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535 || !/^[a-f0-9]{64}$/.test(endpoint.token)) throw new Error('Invalid local companion endpoint file');
  let response;
  try {
    const body = command ? JSON.stringify(command) : undefined;
    response = await new Promise((resolve, reject) => {
      // Keep authority and route separate from endpoint-file data. Only a
      // validated integer port varies; this transport never follows redirects.
      const request = http.request({
        protocol: 'http:',
        hostname: '127.0.0.1',
        port: endpoint.port,
        path: command ? '/command' : '/status',
        method: command ? 'POST' : 'GET',
        headers: { Authorization: 'Bearer ' + endpoint.token, ...(command ? { 'Content-Type': 'application/json' } : {}) },
        signal: AbortSignal.timeout(2500),
        agent: false
      }, incoming => {
        if (incoming.statusCode >= 300 && incoming.statusCode < 400) {
          incoming.destroy();
          reject(new Error('Companion redirects are disabled'));
          return;
        }
        const chunks = [];
        let size = 0;
        incoming.on('data', chunk => {
          size += chunk.length;
          if (size > 65536) {
            incoming.destroy(new Error('Companion response exceeds 64 KiB'));
            return;
          }
          chunks.push(chunk);
        });
        incoming.once('error', reject);
        incoming.once('end', () => resolve({ ok: incoming.statusCode >= 200 && incoming.statusCode < 300, body: Buffer.concat(chunks).toString('utf8') }));
      });
      request.once('error', reject);
      request.end(body);
    });
  } catch { throw new Error('Cannot reach the local companion. Open or restart Mini Mad Cat, then retry.'); }
  const payload = JSON.parse(response.body);
  if (!response.ok) throw new Error(payload.error || 'Companion request failed');
  return payload;
}
module.exports = { requestCompanion };
