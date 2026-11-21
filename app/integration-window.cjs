'use strict';

const { BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createIntegrationSetup } = require('../lib/setup-integrations.cjs');

function getBridge(app, resources, env) {
  if (app.isPackaged) {
    if (process.platform === 'darwin' &&
        (resources.startsWith('/Volumes/') || resources.includes('/AppTranslocation/'))) {
      return { reason: 'Move Mini Mad Cat to Applications and open that copy to connect your apps.' };
    }
    return {
      command: path.join(resources, 'bridge-runtime', process.platform === 'win32' ? 'node.exe' : 'node'),
      args: [path.join(resources, 'bridge-app', 'bridge', 'mcp.cjs')]
    };
  }
  if (!env.npm_node_execpath || !path.isAbsolute(env.npm_node_execpath) ||
      !/^node(\.exe)?$/i.test(path.basename(env.npm_node_execpath))) {
    return { reason: 'Start the source build with npm start to connect your apps.' };
  }
  return { command: env.npm_node_execpath, args: [path.join(__dirname, '..', 'bridge', 'mcp.cjs')] };
}

function setupWindowController(app, dataDir) {
  const html = path.join(__dirname, 'setup.html');
  const url = pathToFileURL(html).href;
  const completed = path.join(dataDir, 'integration-setup-complete');
  const bridge = getBridge(app, process.resourcesPath, process.env);
  let window;
  let firstRun = false;

  const reason = bridge.reason || ([bridge.command, ...bridge.args].every(file => fs.existsSync(file))
    ? null
    : 'The bundled bridge is missing. Reinstall Mini Mad Cat before connecting your apps.');
  const setup = reason ? null : createIntegrationSetup({ bridge, stateDirectory: dataDir });

  function authorized(event) {
    if (!window || window.isDestroyed() || event.sender !== window.webContents ||
        event.senderFrame?.url !== url || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Invalid integration window.');
    }
  }

  function finish() {
    try { fs.writeFileSync(completed, '1\n', { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    window.close();
  }

  ipcMain.handle('integration:list', event => {
    authorized(event);
    return { firstRun, reason, integrations: setup?.list() ?? [] };
  });
  ipcMain.handle('integration:save', (event, selected) => {
    authorized(event);
    if (!setup || !Array.isArray(selected) || selected.length > 5 ||
        selected.some(id => typeof id !== 'string' || !/^[a-z-]{1,24}$/.test(id))) {
      throw new Error('Invalid integration selection.');
    }
    const result = setup.apply(selected);
    if (result.results.every(item => item.ok)) finish();
    return result;
  });
  ipcMain.handle('integration:close', event => {
    authorized(event);
    if (firstRun) finish();
    else window.close();
  });

  function show(initial = true) {
    if (window && !window.isDestroyed()) {
      window.show();
      window.focus();
      return;
    }
    firstRun = initial && !fs.existsSync(completed);
    window = new BrowserWindow({
      title: 'Mini Mad Cat · App connections', width: 580, height: 660,
      minWidth: 450, minHeight: 440, autoHideMenuBar: true, show: false,
      backgroundColor: '#10191f',
      webPreferences: { preload: path.join(__dirname, 'setup-preload.cjs'), nodeIntegration: false,
        contextIsolation: true, sandbox: true, webSecurity: true, partition: 'madcat-integration-setup' }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    window.once('ready-to-show', () => window?.show());
    window.once('closed', () => { window = null; });
    window.loadFile(html).catch(() => { window?.destroy(); });
  }

  return { show, offerOnFirstLaunch() { if (app.isPackaged && !fs.existsSync(completed)) show(true); } };
}

module.exports = { setupWindowController };
