'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { dataDirectory } = require('./paths.cjs');
async function requestCompanion(command, options = {}) {
  const directory = options.directory || dataDirectory();
  let endpoint;
  try { endpoint = JSON.parse(await fs.readFile(path.join(directory, 'control.json'), 'utf8')); }
  catch { throw new Error('Mini Mad Cat is not running. Open the companion with npm start, then retry.'); }
  if (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535 || !/^[a-f0-9]{64}$/.test(endpoint.token)) throw new Error('Invalid local companion endpoint file');
  let response;
  try {
    response = await fetch('http://127.0.0.1:' + endpoint.port + (command ? '/command' : '/status'), {
      method: command ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + endpoint.token, ...(command ? { 'Content-Type': 'application/json' } : {}) },
      ...(command ? { body: JSON.stringify(command) } : {}),
      signal: AbortSignal.timeout(2500),
      redirect: 'error'
    });
  } catch { throw new Error('Cannot reach the local companion. Start or restart it with npm start.'); }
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Companion request failed');
  return payload;
}
module.exports = { requestCompanion };
