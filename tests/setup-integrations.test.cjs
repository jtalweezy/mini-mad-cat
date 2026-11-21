'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parse } = require('smol-toml');
const { createIntegrationSetup } = require('../lib/setup-integrations.cjs');

function fixture(t, options = {}) {
  const homeDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'madcat-integrations-')));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const stateDirectory = path.join(homeDir, 'madcat-state');
  const bridge = { command: path.join(homeDir, 'Mad Cat', 'node'), args: [path.join(homeDir, 'Mad Cat', 'mcp.cjs')] };
  const setup = createIntegrationSetup({ homeDir, stateDirectory, bridge, env: {}, ...options });
  function write(filename, text) {
    const target = path.join(homeDir, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, text, { mode: 0o600 });
    return target;
  }
  return { setup, homeDir, stateDirectory, bridge, write };
}

function statuses(setup) { return Object.fromEntries(setup.list().map(item => [item.id, item])); }
function text(filename) { return fs.readFileSync(filename, 'utf8'); }

test('selects detected hosts and removes only this bridge with sticky deselections', t => {
  const { setup, stateDirectory, bridge, write } = fixture(t);
  const codexConfig = '# account note\r\n[model]\r\nname = "other"\r\n\r\n[mcp_servers.my-server]\r\ncommand = "other"\r\n';
  const cursorConfig = '{ "number": 9223372036854775807, "mcpServers": { "other": {"command":"other"} } }\n';
  const codex = write('.codex/config.toml', codexConfig);
  const cursor = write('.cursor/mcp.json', cursorConfig);
  assert.deepEqual(setup.list().filter(host => host.selected).map(host => host.id), ['codex', 'cursor']);
  assert.equal(fs.existsSync(stateDirectory), false, 'read-only detection creates no data');
  assert.ok(setup.apply(['codex', 'cursor']).results.every(result => result.ok && result.changed));
  assert.ok(text(codex).startsWith(codexConfig));
  assert.equal(parse(text(codex)).mcp_servers['mini-mad-cat'].command, bridge.command);
  assert.match(text(cursor), /9223372036854775807/);
  assert.equal(JSON.parse(text(cursor)).mcpServers['mini-mad-cat'].type, 'stdio');
  assert.ok(statuses(setup).cursor.connected);
  assert.ok(setup.apply(['codex', 'cursor']).results.every(result => result.ok && !result.changed));
  assert.ok(setup.apply([]).results.every(result => result.ok && result.changed));
  assert.deepEqual(JSON.parse(text(cursor)).mcpServers, { other: { command: 'other' } });
  assert.match(text(cursor), /9223372036854775807/);
  assert.equal(text(codex), codexConfig);
  assert.equal(statuses(setup).cursor.selected, false);
  assert.equal(statuses(setup).codex.selected, false);
  const backups = path.join(stateDirectory, 'integration-backups');
  const backupContents = fs.readdirSync(backups).map(name => text(path.join(backups, name)));
  assert.ok(backupContents.includes(cursorConfig));
  assert.ok(backupContents.includes(codexConfig));
});

test('configures an MSIX Claude Desktop profile in preference to the classic Windows path', t => {
  const { setup, write } = fixture(t, { platform: 'win32' });
  const classic = write('AppData/Roaming/Claude/claude_desktop_config.json', '{"classic":true}\n');
  const store = write('AppData/Local/Claude-Data/claude_example/claude_desktop_config.json', '{"store":true}\n');
  assert.equal(statuses(setup)['claude-desktop'].selected, true);
  assert.ok(setup.apply(['claude-desktop']).results[0].ok);
  assert.equal(text(classic), '{"classic":true}\n');
  assert.equal(JSON.parse(text(store)).store, true);
  assert.ok(JSON.parse(text(store)).mcpServers['mini-mad-cat']);
  write('AppData/Local/Claude-Data/claude_second/claude_desktop_config.json', '{}\n');
  const host = statuses(setup)['claude-desktop'];
  assert.equal(host.available, false);
  assert.match(host.reason, /Multiple Claude Desktop profiles/);
});

test('deselects Grok Build even when it imports Cursor or Claude Code configurations', t => {
  const { setup, write } = fixture(t);
  const claude = write('.claude.json', '{"projects":{"/elsewhere":{"mcpServers":{"other":{"command":"other"}}}}}\n');
  const cursor = write('.cursor/mcp.json', '{}\n');
  const grok = write('.grok/config.toml', '[mcp_servers.other]\ncommand = "other"\n');
  assert.ok(setup.apply(['claude-code', 'cursor']).results.every(result => result.ok));
  assert.equal(parse(text(grok)).mcp_servers['mini-mad-cat'].enabled, false);
  assert.equal(parse(text(grok)).mcp_servers.other.command, 'other');
  assert.equal(statuses(setup).grok.connected, false);
  assert.equal(statuses(setup).grok.selected, false);
  assert.equal(JSON.parse(text(claude)).projects['/elsewhere'].mcpServers.other.command, 'other');
  assert.ok(JSON.parse(text(claude)).mcpServers['mini-mad-cat']);
  assert.ok(JSON.parse(text(cursor)).mcpServers['mini-mad-cat']);
  assert.ok(setup.apply(['grok']).results.every(result => result.ok));
  assert.equal(parse(text(grok)).mcp_servers['mini-mad-cat'].enabled, undefined);
  assert.equal(statuses(setup).grok.connected, true);
  assert.deepEqual(JSON.parse(text(claude)).mcpServers, {});
});

test('leaves conflicting, malformed and ambiguous files untouched and still applies other selections', t => {
  const { setup, write } = fixture(t);
  const wrong = '{"mcpServers":{"mini-mad-cat":{"command":"different"}}}\n';
  const duplicate = '{"mcpServers":{},"mcpServers":{"other":{}}}\n';
  const codex = write('.codex/config.toml', 'malformed document\n');
  const cursor = write('.cursor/mcp.json', wrong);
  const claude = write('.claude.json', duplicate);
  const grok = write('.grok/config.toml', '# intact\n');
  assert.match(statuses(setup).cursor.reason, /Another registration/);
  assert.equal(statuses(setup).codex.available, false);
  assert.equal(statuses(setup)['claude-code'].available, false);
  const { results } = setup.apply(['grok']);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(text(codex), 'malformed document\n');
  assert.equal(text(cursor), wrong);
  assert.equal(text(claude), duplicate);
  assert.ok(parse(text(grok)).mcp_servers['mini-mad-cat']);
});

test('refuses links and does not modify the linked file', t => {
  const { setup, homeDir, write } = fixture(t);
  const original = write('untouched.json', '{"personal":true}\n');
  const folder = path.join(homeDir, '.cursor');
  fs.mkdirSync(folder, { mode: 0o700 });
  try { fs.symlinkSync(original, path.join(folder, 'mcp.json'), 'file'); }
  catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('Windows symlink privilege unavailable');
      return;
    }
    throw error;
  }
  assert.equal(statuses(setup).cursor.available, false);
  assert.equal(setup.apply(['cursor']).results[0].ok, false);
  assert.equal(text(original), '{"personal":true}\n');
});

test('upgrades the legacy Windows bridge entry and safely removes a simple unmarked TOML registration', t => {
  const { setup, homeDir, write, bridge } = fixture(t, { platform: 'win32' });
  const oldBridge = path.join(homeDir, 'AppData', 'Local', 'Programs', 'MiniMadCat', 'bridge', 'mcp.cjs');
  const unchanged = '[unknown]\nnumber = 9223372036854775807\n';
  const oldEntry = '[mcp_servers.mini-mad-cat]\ncommand = "node"\nargs = [' + JSON.stringify(oldBridge) + ']\n# keep this note\n';
  const filename = write('.codex/config.toml', oldEntry + unchanged);
  assert.equal(statuses(setup).codex.connected, true);
  assert.ok(setup.apply(['codex']).results[0].ok);
  assert.equal(parse(text(filename), { integersAsBigInt: true }).mcp_servers['mini-mad-cat'].command, bridge.command);
  assert.ok(setup.apply([]).results[0].ok);
  assert.equal(text(filename), '# keep this note\n' + unchanged);
});

test('detects an installed Windows Cursor and creates settings on apply, not discovery', t => {
  const { setup, homeDir, write } = fixture(t, { platform: 'win32' });
  write('AppData/Local/Programs/cursor/Cursor.exe', '');
  const filename = path.join(homeDir, '.cursor', 'mcp.json');
  assert.ok(statuses(setup).cursor.selected);
  assert.equal(fs.existsSync(filename), false);
  assert.ok(setup.apply(['cursor']).results[0].ok);
  assert.equal(JSON.parse(text(filename)).mcpServers['mini-mad-cat'].type, 'stdio');
});

function monitorProbes(t, forbidden) {
  const rejected = [];
  for (const name of ['lstatSync', 'statSync', 'accessSync', 'readdirSync']) {
    const original = fs[name];
    t.mock.method(fs, name, (filename, ...args) => {
      if (typeof filename === 'string' && forbidden.test(filename)) {
        rejected.push(filename);
        throw new Error('Discovery attempted an out-of-scope probe.');
      }
      return original(filename, ...args);
    });
  }
  return rejected;
}

test('rejects relative and out-of-profile configuration roots before probing them', t => {
  const env = { CODEX_HOME: 'relative-madcat-override', CLAUDE_CONFIG_DIR: 'relative-madcat-override' };
  const { setup, homeDir } = fixture(t, { env });
  env.GROK_HOME = path.join(path.dirname(homeDir), 'external-madcat-override');
  const rejected = monitorProbes(t, /(?:relative|external)-madcat-override/);
  const hosts = statuses(setup);
  for (const id of ['codex', 'claude-code', 'grok']) {
    assert.equal(hosts[id].available, false);
    assert.match(hosts[id].reason, /outside your home folder/);
  }
  assert.deepEqual(rejected, []);
});

test('Windows discovery does not contact UNC or device paths from app data or Path', t => {
  const unc = String.raw`\\madcat-scan-avoid\share`;
  const device = String.raw`\\?\GLOBALROOT\Device\madcat-scan-avoid`;
  const env = { APPDATA: unc, LOCALAPPDATA: unc, Path: [unc, device, 'relative-madcat-scan-avoid'].join(path.delimiter) };
  const { setup } = fixture(t, { env, platform: 'win32' });
  const rejected = monitorProbes(t, /madcat-scan-avoid/);
  const hosts = statuses(setup);
  assert.match(hosts['claude-desktop'].reason, /outside your home folder/);
  assert.equal(hosts.cursor.available, false);
  assert.deepEqual(rejected, []);
});

test('follows a normal POSIX executable symlink during PATH discovery', { skip: process.platform === 'win32' }, t => {
  const env = {};
  const { setup, homeDir, write } = fixture(t, { env });
  const executable = write('install/codex', '#!/bin/sh\nexit 0\n');
  fs.chmodSync(executable, 0o700);
  const bin = path.join(homeDir, 'local-bin');
  fs.mkdirSync(bin, { mode: 0o700 });
  fs.symlinkSync(executable, path.join(bin, 'codex'));
  env.PATH = bin;
  assert.equal(statuses(setup).codex.selected, true);
});
