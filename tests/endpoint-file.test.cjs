'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensurePrivateDirectory, writeEndpoint } = require('../lib/endpoint-file.cjs');

function fixture(t) {
  const base = path.resolve(__dirname, '../runtime-smoke/endpoint-checks');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'fixture-'));
  t.after(() => { assert.ok(root.startsWith(base + path.sep)); fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}

test('endpoint publishing replaces stale files with a complete private file', t => {
  const root = fixture(t), directory = path.join(root, 'private');
  assert.equal(ensurePrivateDirectory(directory), fs.realpathSync(directory));
  const endpoint = path.join(directory, 'control.json');
  fs.writeFileSync(endpoint, 'stale', { mode: 0o644 });
  const value = { port: 12345, token: 'fixture-token', pid: 1, version: 1 };
  assert.equal(writeEndpoint(directory, value), endpoint);
  assert.deepEqual(JSON.parse(fs.readFileSync(endpoint, 'utf8')), value);
  assert.deepEqual(fs.readdirSync(directory), ['control.json']);
  if (process.platform !== 'win32') assert.equal(fs.statSync(endpoint).mode & 0o777, 0o600);
});

test('endpoint publishing replaces a link entry without writing its target', t => {
  const root = fixture(t), directory = path.join(root, 'private');
  ensurePrivateDirectory(directory);
  const target = path.join(root, 'unchanged.json');
  fs.writeFileSync(target, 'fixture sentinel');
  try { fs.symlinkSync(target, path.join(directory, 'control.json'), 'file'); }
  catch (error) { if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) { t.skip('Windows account cannot create file symlinks'); return; } throw error; }
  writeEndpoint(directory, { port: 12345 });
  assert.equal(fs.readFileSync(target, 'utf8'), 'fixture sentinel');
  assert.equal(fs.lstatSync(path.join(directory, 'control.json')).isSymbolicLink(), false);
});

test('final directory links are refused while parent aliases remain usable', t => {
  const root = fixture(t), actual = path.join(root, 'actual'), alias = path.join(root, 'alias');
  fs.mkdirSync(actual, { mode: 0o700 });
  fs.symlinkSync(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => ensurePrivateDirectory(alias), /not a link/);
  assert.equal(ensurePrivateDirectory(path.join(alias, 'pet')), fs.realpathSync(path.join(actual, 'pet')));
});

test('POSIX data directories reject permissions that expose tokens to other users', { skip: process.platform === 'win32' }, t => {
  const root = fixture(t), directory = path.join(root, 'shared');
  fs.mkdirSync(directory, { mode: 0o700 });
  fs.chmodSync(directory, 0o755);
  assert.throws(() => ensurePrivateDirectory(directory), /must be private/);
  assert.equal(fs.existsSync(path.join(directory, 'control.json')), false);
});
