'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function ensurePrivateDirectory(directory) {
  const absolute = path.resolve(directory);
  let info;
  try { info = fs.lstatSync(absolute); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    fs.mkdirSync(absolute, { recursive: true, mode: 0o700 });
    info = fs.lstatSync(absolute);
  }
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Mini Mad Cat data directory must be a real directory, not a link.');
  if (process.platform !== 'win32') {
    if (typeof process.getuid === 'function' && info.uid !== process.getuid()) throw new Error('Mini Mad Cat data directory must be owned by the current user.');
    if ((info.mode & 0o077) !== 0) throw new Error('Mini Mad Cat data directory must be private (no group or other permissions).');
  }
  // Match fs.promises.realpath used for endpoint reads. On Windows, the JS
  // realpathSync implementation can preserve input casing or short aliases,
  // while native realpath expands them to the filesystem's canonical spelling.
  // Both sides must use that spelling before the strict containment check.
  return fs.realpathSync.native(absolute);
}

function writeEndpoint(directory, endpoint) {
  const privateDirectory = ensurePrivateDirectory(directory);
  const temporary = path.join(privateDirectory, '.control-' + process.pid + '-' + crypto.randomBytes(12).toString('hex') + '.tmp');
  const destination = path.join(privateDirectory, 'control.json');
  let descriptor;
  let created = false;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    created = true;
    fs.writeFileSync(descriptor, JSON.stringify(endpoint));
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    // Rename replaces the destination entry; it never opens an existing token
    // file or follows an existing control.json link.
    fs.renameSync(temporary, destination);
    return destination;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (created) {
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
}

module.exports = { ensurePrivateDirectory, writeEndpoint };
