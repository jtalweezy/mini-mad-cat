#!/usr/bin/env node
'use strict';
// Opt-in GUI test: opens only this app as a hidden window and captures only its renderer.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const assert = require('node:assert/strict');
const { requestCompanion } = require('../lib/control-client.cjs');
const { ensurePrivateDirectory } = require('../lib/endpoint-file.cjs');
const root = path.resolve(__dirname, '..');
const CAPTURE_TIMES = Object.freeze([200, 500, 900, 1400, 2100, 2800]);
const CASES = Object.freeze([
  ['high-success', { outcome: 'success', impact: 1, confidence: 1 }],
  ['medium-success', { outcome: 'success', impact: .6, confidence: .7 }],
  ['failure', { outcome: 'failure', impact: 1, severity: 1, confidence: 1 }],
  ['reduced-motion', { outcome: 'success', impact: 1, confidence: 1 }, true]
]);
const CASE_NAMES = new Set(CASES.map(item => item[0]));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function childPath(directory, name) {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/i.test(name) || name === '.' || name === '..') throw new Error('Invalid smoke artifact name');
  const target = path.resolve(directory, name);
  if (path.dirname(target) !== path.resolve(directory)) throw new Error('Smoke artifact escaped its run directory');
  return target;
}

async function createOutputRun(requestedParent, defaultParent = path.join(root, 'runtime-smoke')) {
  // Explicit output is chosen by the invoking user, never by the agent bridge.
  // Require it to exist; every write goes into a new private generated child.
  const parent = requestedParent === undefined ? defaultParent : path.resolve(requestedParent);
  if (requestedParent === undefined) await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  const canonicalParent = await fs.realpath(parent);
  if (!(await fs.stat(canonicalParent)).isDirectory()) throw new Error('Smoke output parent must be an existing directory');
  const directory = await fs.mkdtemp(path.join(canonicalParent, 'mini-mad-cat-smoke-'));
  return ensurePrivateDirectory(directory);
}

async function removeCaseDirectory(outputDir, directory) {
  if (path.dirname(directory) !== outputDir || !/^data-(high-success|medium-success|failure|reduced-motion)$/.test(path.basename(directory))) throw new Error('Unsafe smoke data path');
  const info = await fs.lstat(directory);
  if (info.isSymbolicLink() || !info.isDirectory() || await fs.realpath(directory) !== directory) throw new Error('Smoke data directory was replaced');
  await fs.rm(directory, { recursive: true, force: true });
}

async function mcpCalls(directory, event, reducedMotion) {
  const env = { ...process.env, MADCAT_HOME: directory }; delete env.ELECTRON_RUN_AS_NODE;
  const bridge = spawn(process.execPath, [path.join(root, 'bridge/mcp.cjs')], { env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let pending = null, nextId = 0, errors = '', bridgeError = null;
  function rejectPending(error) {
    bridgeError = error;
    if (pending) { const request = pending; pending = null; clearTimeout(request.timeout); request.reject(error); }
  }
  bridge.stderr.on('data', data => { errors += data; });
  bridge.on('error', rejectPending);
  bridge.stdin.on('error', rejectPending);
  bridge.on('exit', () => rejectPending(new Error('MCP bridge exited')));
  const lines = readline.createInterface({ input: bridge.stdout });
  lines.on('line', line => {
    let value;
    try { value = JSON.parse(line); } catch { rejectPending(new Error('Malformed MCP response')); return; }
    if (!value || Array.isArray(value) || value.jsonrpc !== '2.0' || !Number.isSafeInteger(value.id) || !pending || value.id !== pending.id) return;
    // Response IDs never index an object or select an arbitrary callable.
    const request = pending; pending = null; clearTimeout(request.timeout); request.resolve(value);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    if (bridgeError) { reject(bridgeError); return; }
    if (pending) { reject(new Error('Smoke MCP calls must be sequential')); return; }
    const id = ++nextId;
    const timeout = setTimeout(() => rejectPending(new Error('MCP call timed out')), 5000);
    pending = { id, timeout, resolve, reject };
    bridge.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  try {
    const initialized = await call('initialize', { protocolVersion: '2025-11-25', clientInfo: { name: 'madcat-smoke', version: '1' }, capabilities: {} });
    assert.equal(initialized.result.serverInfo.name, 'mini-mad-cat');
    if (reducedMotion) {
      const configured = await call('tools/call', { name: 'pet_configure', arguments: { reducedMotion: true } }); assert.equal(configured.result.isError, false);
    }
    const reacted = await call('tools/call', { name: 'pet_react', arguments: event }); assert.equal(reacted.result.isError, false);
    const result = JSON.parse(reacted.result.content[0].text);
    assert.equal(result.accepted, true);
    assert.equal(result.reaction.effect, reducedMotion ? null : event.outcome === 'failure' ? 'explosion' : event.impact === 1 ? 'missiles' : 'laser');
    const status = await call('tools/call', { name: 'pet_status', arguments: {} }); assert.equal(status.result.isError, false);
    return { reaction: result, status: JSON.parse(status.result.content[0].text), stderr: errors };
  } finally { bridge.stdin.end(); lines.close(); if (bridge.exitCode === null) bridge.kill(); }
}

async function runCase(outputDir, name, event, reducedMotion = false) {
  assert.ok(CASE_NAMES.has(name), 'Unknown smoke case');
  const directory = childPath(outputDir, 'data-' + name);
  // Non-recursive mkdir refuses any preexisting entry inside the fresh run.
  await fs.mkdir(directory, { mode: 0o700 });
  ensurePrivateDirectory(directory);
  const env = { ...process.env, MADCAT_HOME: directory }; delete env.ELECTRON_RUN_AS_NODE;
  const screenshot = childPath(outputDir, name + '.png');
  let child, exited, log = '', finished = false;
  try {
    const electron = require('electron');
    child = spawn(electron, [root, '--hidden', '--capture=' + screenshot, '--capture-series', '--capture-exit'], { env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { log += data; }); child.stderr.on('data', data => { log += data; });
    exited = new Promise(resolve => {
      child.once('error', error => { finished = true; resolve({ code: null, error }); });
      child.once('exit', (code, signal) => { finished = true; resolve({ code, signal }); });
    });
    let ready = false;
    for (let i = 0; i < 100 && !finished; i++) {
      try { await fs.access(childPath(directory, 'control.json')); ready = true; break; } catch { await pause(100); }
    }
    if (!ready) throw new Error('Companion did not start: ' + log);
    const protocol = await mcpCalls(directory, event, reducedMotion);
    await pause(2400);
    const recovered = await requestCompanion(null, { directory }); assert.equal(recovered.temporaryState, null);
    const exit = await exited; assert.equal(exit.code, 0, 'Electron failed: ' + log);
    const captures = [];
    for (const time of CAPTURE_TIMES) {
      // Read only fixed expected artifacts, never names supplied by readdir,
      // child output, protocol responses, or the environment.
      const file = name + '-' + String(time).padStart(4, '0') + '.png';
      await fs.access(childPath(outputDir, file));
      const info = JSON.parse(await fs.readFile(childPath(outputDir, file + '.json'), 'utf8'));
      assert.equal(info.logicalWidth, 512); assert.equal(info.logicalHeight, 400);
      const ratio = info.width / 512; assert.equal(ratio, info.height / 400);
      assert.ok(info.visiblePixels > 3000, 'Blank renderer capture');
      assert.ok(info.petPixels > 5000 * ratio * ratio, 'Missing or clipped pet in renderer capture');
      assert.ok(info.visiblePixels < info.width * info.height, 'Opaque overlay capture');
      captures.push({ file, ...info });
    }
    return { name, ok: true, protocol, recovered, captures, log };
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      if (!await Promise.race([exited, pause(2000).then(() => null)])) throw new Error('Smoke app did not stop; temporary data retained');
    }
    await removeCaseDirectory(outputDir, directory);
  }
}

async function main(args = process.argv.slice(2)) {
  if (args.length > 1 || args[0] === '') throw new Error('Usage: npm run test:gui -- [existing-output-parent]');
  const outputDir = await createOutputRun(args[0]);
  const cases = [];
  for (const item of CASES) cases.push(await runCase(outputDir, ...item));
  const report = { ok: true, platform: process.platform, node: process.version, electron: '45.4.1', cases };
  await fs.writeFile(childPath(outputDir, 'smoke-report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ok: true, outputDir, cases: cases.map(item => item.name) }));
}

module.exports = { childPath, createOutputRun, removeCaseDirectory };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
