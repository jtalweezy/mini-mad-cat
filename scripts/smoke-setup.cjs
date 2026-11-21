'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const smokeRoot = path.resolve(__dirname, '../runtime-smoke');

if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  fs.mkdirSync(smokeRoot, { recursive: true, mode: 0o700 });
  const root = fs.realpathSync.native(smokeRoot);
  const fixture = fs.mkdtempSync(path.join(root, 'setup-'));
  const home = path.join(fixture, 'home');
  const state = path.join(fixture, 'state');
  const appData = path.join(home, 'AppData/Roaming');
  const localAppData = path.join(home, 'AppData/Local');
  for (const directory of [state, path.join(home, '.codex'), path.join(home, '.cursor'), appData, localAppData]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(path.join(home, '.codex/config.toml'), 'model = "fixture"\n');
  fs.writeFileSync(path.join(home, '.cursor/mcp.json'), '{"mcpServers":{"fixture":{"command":"fixture-tool"}}}\n');
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData, LOCALAPPDATA: localAppData,
    XDG_CONFIG_HOME: path.join(home, '.config'), CODEX_HOME: path.join(home, '.codex'), npm_node_execpath: process.execPath,
    MADCAT_HOME: state, MADCAT_SETUP_FIXTURE: path.basename(fixture) };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit' });
  const timer = setTimeout(() => child.kill(), 25000);
  child.once('error', error => console.error(error));
  child.once('close', code => {
    clearTimeout(timer);
    const resolved = fs.realpathSync.native(fixture);
    assert.equal(path.dirname(resolved), root);
    fs.rmSync(resolved, { recursive: true, force: true });
    process.exitCode = code ?? 1;
  });
} else {
  const { app, BrowserWindow } = require('electron');
  const { setTimeout: pause } = require('node:timers/promises');
  const name = process.env.MADCAT_SETUP_FIXTURE;
  assert.match(name || '', /^setup-[0-9a-zA-Z]{6}$/);
  const fixture = path.join(fs.realpathSync.native(smokeRoot), name);
  assert.ok(fs.lstatSync(fixture).isDirectory());
  const home = path.join(fixture, 'home');
  const state = path.join(fixture, 'state');
  for (const directory of [home, state]) assert.ok(fs.lstatSync(directory).isDirectory());
  assert.equal(process.env.HOME, home);
  assert.equal(process.env.USERPROFILE, home);
  assert.equal(process.env.MADCAT_HOME, state);
  const { setupWindowController } = require('../app/integration-window.cjs');
  app.setPath('userData', state);
  app.disableHardwareAcceleration();
  app.on('window-all-closed', () => {});
  // The sandboxed BrowserWindow and IPC stay real. Prevent the fixture from
  // taking focus on the machine running the test.
  BrowserWindow.prototype.show = () => {};
  app.whenReady().then(async () => {
    const manager = setupWindowController(app, state);
    const codex = path.join(home, '.codex/config.toml');
    const cursor = path.join(home, '.cursor/mcp.json');
    const readCursor = () => JSON.parse(fs.readFileSync(cursor, 'utf8'));
    async function waitFor(condition) {
      for (let tries = 0; tries < 100; tries++) {
        if (await condition()) return;
        await pause(45);
      }
      throw new Error('The setup window did not reach the expected state.');
    }
    async function open() {
      manager.show();
      const [window] = BrowserWindow.getAllWindows();
      const run = code => window.webContents.executeJavaScript(code);
      await waitFor(async () => {
        try { return await run('Boolean(document.querySelector("input[value=cursor]"))'); }
        catch { return false; }
      });
      assert.equal(await run('typeof window.require'), 'undefined');
      assert.equal(await run('typeof window.connectionSetup.save'), 'function');
      return { window, run };
    }
    async function saveSelection(page, ids) {
      const json = JSON.stringify(ids);
      await page.run(`{
        const selected = ${json};
        for (const input of document.querySelectorAll('#apps input')) input.checked = selected.includes(input.value);
        document.getElementById('setup').requestSubmit();
      }`);
      await waitFor(() => page.window.isDestroyed());
    }
    const first = await open();
    assert.equal(await first.run('document.querySelector("input[value=cursor]").checked'), true);
    assert.equal(await first.run('document.querySelector("input[value=codex]").checked'), true);
    assert.equal(fs.readFileSync(codex, 'utf8'), 'model = "fixture"\n');
    assert.deepEqual(readCursor().mcpServers, { fixture: { command: 'fixture-tool' } });
    await saveSelection(first, ['cursor']);
    assert.equal(fs.readFileSync(codex, 'utf8'), 'model = "fixture"\n');
    assert.equal(readCursor().mcpServers['mini-mad-cat'].command, process.env.npm_node_execpath);
    const later = await open();
    assert.equal(await later.run('document.querySelector("input[value=cursor]").checked'), true);
    assert.equal(await later.run('document.querySelector("input[value=codex]").checked'), false);
    await saveSelection(later, ['codex']);
    assert.deepEqual(readCursor().mcpServers, { fixture: { command: 'fixture-tool' } });
    const codexConfig = fs.readFileSync(codex, 'utf8');
    assert.match(codexConfig, /model = "fixture"/);
    assert.match(codexConfig, /\[mcp_servers\.(?:"mini-mad-cat"|mini-mad-cat)\]/);
    console.log('Setup smoke passed: first-run defaults, explicit save, deselection, sandbox and unrelated settings.');
    app.exit(0);
  }).catch(error => { console.error(error); app.exit(1); });
}
