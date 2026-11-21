'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { parse: parseToml } = require('smol-toml');
const { parseTree, modify, applyEdits } = require('jsonc-parser');
const { dataDirectory } = require('./paths.cjs');
const { ensurePrivateDirectory } = require('./endpoint-file.cjs');

const SERVER = 'mini-mad-cat';
const MARKER_START = '# BEGIN Mini Mad Cat integration';
const MARKER_END = '# END Mini Mad Cat integration';
const MAX_CONFIG_BYTES = 4 * 1024 * 1024;
const HOST_IDS = ['codex', 'claude-desktop', 'claude-code', 'cursor', 'grok'];
const SCOPE = 'Current user';

function absent(error) {
  return error.code === 'ENOENT' || error.code === 'ENOTDIR';
}

function inspect(filename) {
  try { return fs.lstatSync(filename); }
  catch (error) { if (!absent(error)) throw error; }
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function observed(filename) {
  try { return !!inspect(filename); }
  catch (error) {
    if (error.code === 'EACCES' || error.code === 'EPERM') return true;
    throw error;
  }
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
}

function localAbsolute(filename, platform) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename) || filename.includes('\0')) return false;
  if (platform !== 'win32') return true;
  // An absolute path alone admits UNC shares and Windows device namespaces.
  // Do not contact them while looking for optional integrations.
  if (/^[\\/]{2}/.test(filename)) return false;
  return path.sep !== '\\' || /^[a-z]:[\\/]/i.test(filename) &&
    !/[<>:"|?*\x00-\x1f]/.test(filename.slice(2));
}

function profilePath(home, filename, platform) {
  return localAbsolute(filename, platform) && inside(home, filename);
}

function children(home, dir, matches, platform) {
  try {
    // Validate each profile component before reading optional MSIX folders.
    const probe = safePath(home, path.join(dir, '.mini-mad-cat-discovery'), platform);
    if (!probe) return [];
    const folder = path.dirname(probe);
    return fs.readdirSync(folder, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && matches.test(entry.name))
      .map(entry => path.join(folder, entry.name));
  } catch {
    return [];
  }
}

function detectable(name, commonBins, platform) {
  const names = platform === 'win32' ? [name + '.exe', name + '.cmd'] : [name];
  return commonBins.some(dir => names.some(file => {
    const candidate = path.join(dir, file);
    try {
      if (platform === 'win32') {
        const local = safePath(path.parse(candidate).root, candidate, platform);
        const info = local && inspect(local);
        return !!info && (info.isFile() || info.isSymbolicLink());
      }
      if (!fs.statSync(candidate).isFile()) return false;
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch { return false; }
  }));
}

function hostLocations(home, env, platform) {
  const configHome = env.XDG_CONFIG_HOME || path.join(home, '.config');
  const roaming = env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const codexHome = env.CODEX_HOME || path.join(home, '.codex');
  const grokHome = env.GROK_HOME || path.join(home, '.grok');
  const claudeHome = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const commonBins = [
    path.join(home, '.local', 'bin'), path.join(home, 'bin'),
    ...(platform === 'win32' && profilePath(home, roaming, platform) ? [path.join(roaming, 'npm')] : []),
    ...(env.PATH || env.Path || '').split(path.delimiter)
  ].filter(dir => localAbsolute(dir, platform));
  const nativeApp = name => [
    path.join(home, 'Applications', name + '.app'),
    path.join(path.parse(home).root, 'Applications', name + '.app')
  ].some(dir => inspect(dir)?.isDirectory());
  const profileExecutable = filename => {
    try {
      const safe = safePath(home, filename, platform);
      return !!(safe && inspect(safe)?.isFile());
    } catch { return false; }
  };

  const safeLocal = platform === 'win32' && profilePath(home, local, platform);
  const claudeData = safeLocal ? children(home, path.join(local, 'Claude-Data'), /^claude_[a-z0-9]+$/i, platform) : [];
  const desktopConfig = platform === 'win32'
    ? path.join(roaming, 'Claude', 'claude_desktop_config.json')
    : platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : path.join(configHome, 'Claude', 'claude_desktop_config.json');
  // An existing MSIX config wins over the classic path. An uninitialized
  // single MSIX profile can also be configured, with no guess among profiles.
  const storeTargets = claudeData.map(dir => path.join(dir, 'claude_desktop_config.json'));
  const desktopTargets = storeTargets.filter(filename => {
    try {
      const safe = safePath(home, filename, platform);
      return !!(safe && observed(safe));
    } catch { return false; }
  });
  const desktopCandidates = desktopTargets.length ? desktopTargets : storeTargets;
  const desktopPath = desktopCandidates[0] || desktopConfig;
  const codexStore = safeLocal && children(home, path.join(local, 'Packages'), /^OpenAI\.Codex_/i, platform).length > 0;
  const codexSetup = path.join(codexHome, 'config.toml');
  const grokSetup = path.join(grokHome, 'config.toml');
  const claudeSetup = env.CLAUDE_CONFIG_DIR ? path.join(claudeHome, '.claude.json') : path.join(home, '.claude.json');
  const cursorSetup = path.join(home, '.cursor', 'mcp.json');
  return [
    { id: 'codex', label: 'Codex', target: codexSetup, root: codexHome, format: 'toml',
      detected: filename => codexStore || (platform === 'darwin' && nativeApp('Codex')) ||
        detectable('codex', commonBins, platform) || !!(filename && inspect(filename)) },
    { id: 'claude-desktop', label: 'Claude Desktop', target: desktopPath, root: path.dirname(desktopPath), format: 'json',
      restriction: desktopCandidates.length > 1 ? 'Multiple Claude Desktop profiles were found. Choose the config from Claude Desktop settings.' : '',
      detected: filename => storeTargets.length > 0 || !!(filename && inspect(filename)) ||
        (platform === 'darwin' && nativeApp('Claude')) ||
        (safeLocal && profileExecutable(path.join(local, 'Programs', 'Claude', 'Claude.exe'))) ||
        detectable('claude-desktop', commonBins, platform) },
    { id: 'claude-code', label: 'Claude Code', target: claudeSetup, root: claudeHome, format: 'json', type: 'stdio',
      detected: filename => detectable('claude', commonBins, platform) || !!(filename && inspect(filename)) },
    { id: 'cursor', label: 'Cursor', target: cursorSetup, root: path.dirname(cursorSetup), format: 'json', type: 'stdio',
      detected: filename => (platform === 'darwin' && nativeApp('Cursor')) ||
        (safeLocal && profileExecutable(path.join(local, 'Programs', 'cursor', 'Cursor.exe'))) ||
        detectable('cursor', commonBins, platform) || !!(filename && inspect(filename)) },
    { id: 'grok', label: 'Grok Build', target: grokSetup, root: grokHome, format: 'toml',
      detected: filename => detectable('grok', commonBins, platform) || !!(filename && inspect(filename)) }
  ];
}

function safeDirectory(info, platform) {
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Configuration folder is a link or is not a regular directory.');
  if (platform !== 'win32' && (info.uid !== process.getuid() || (info.mode & 0o022))) {
    throw new Error('Configuration folder must be owned by you and writable only by you.');
  }
}

function safePath(home, filename, platform, create = false) {
  if (!profilePath(home, filename, platform)) {
    throw new Error('Configuration outside your home folder needs manual setup.');
  }
  let current = home;
  const dirs = path.relative(home, path.dirname(filename)).split(path.sep).filter(Boolean);
  for (const dir of dirs) {
    current = path.join(current, dir);
    let info = inspect(current);
    if (!info) {
      if (!create) return null;
      try { fs.mkdirSync(current, { mode: 0o700 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      info = fs.lstatSync(current);
    }
    safeDirectory(info, platform);
  }
  return path.join(current, path.basename(filename));
}

function equalFile(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

function readConfig(filename, platform) {
  const info = filename && inspect(filename);
  if (!info) return null;
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) {
    throw new Error('Configuration must be a regular file with no links.');
  }
  if (platform !== 'win32' && (info.uid !== process.getuid() || (info.mode & 0o022))) {
    throw new Error('Configuration must be owned by you and writable only by you.');
  }
  if (info.size > MAX_CONFIG_BYTES) throw new Error('Configuration is too large for automatic editing.');
  const file = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    if (!equalFile(info, fs.fstatSync(file))) throw new Error('Configuration changed while reading. Close the app and retry.');
    const buffer = Buffer.alloc(info.size + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = fs.readSync(file, buffer, size, buffer.length - size);
      if (!count) break;
      size += count;
    }
    if (size !== info.size || !equalFile(info, fs.fstatSync(file))) {
      throw new Error('Configuration changed while reading. Close the app and retry.');
    }
    return buffer.subarray(0, size);
  } finally { fs.closeSync(file); }
}

function initializeExclusive(filename, text, mode) {
  const fd = fs.openSync(filename, 'wx', mode);
  try {
    fs.writeFileSync(fd, text);
    fs.fsyncSync(fd);
  } catch (error) {
    fs.closeSync(fd);
    fs.unlinkSync(filename);
    throw error;
  }
  fs.closeSync(fd);
}

function replaceConfig(filename, original, text, platform) {
  const temporary = path.join(path.dirname(filename), '.mini-mad-cat-' + randomUUID() + '.tmp');
  let created = false;
  try {
    initializeExclusive(temporary, text, 0o600);
    created = true;
    if (!isDeepStrictEqual(readConfig(filename, platform), original)) {
      throw new Error('Configuration changed during setup. Close the app and retry.');
    }
    fs.renameSync(temporary, filename);
    created = false;
  } finally {
    if (created) fs.unlinkSync(temporary);
  }
}

function decode(bytes) {
  if (!bytes) return { text: '', bom: '' };
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  return { text: text.replace(/^\uFEFF/, ''), bom: text.startsWith('\uFEFF') ? '\uFEFF' : '' };
}

function document(text, format) {
  const key = format === 'json' ? 'mcpServers' : 'mcp_servers';
  let value;
  try {
    if (format === 'json') {
      value = text ? JSON.parse(text) : {};
      const root = parseTree(text || '{}');
      const properties = (node, name) => node?.children?.filter(child => child.type === 'property' && child.children[0].value === name) || [];
      const servers = properties(root, key);
      if (servers.length > 1 || properties(servers[0]?.children[1], SERVER).length > 1) throw new Error('Duplicate keys');
    } else {
      value = parseToml(text, { integersAsBigInt: true });
    }
  } catch {
    throw new Error('Configuration could not be parsed safely. Use the app’s settings to connect manually.');
  }
  if (!object(value) || (Object.hasOwn(value, key) && !object(value[key]))) {
    throw new Error('Configuration has an unsupported MCP structure. Use the app’s settings to connect manually.');
  }
  const servers = value[key];
  return { key, value, entry: servers && Object.hasOwn(servers, SERVER) ? servers[SERVER] : undefined };
}

function samePath(a, b, platform) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!path.isAbsolute(a) || !path.isAbsolute(b)) return a === b;
  const normalize = value => platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value);
  return normalize(a) === normalize(b);
}

function entryMatches(entry, bridge, platform) {
  return object(entry) && samePath(entry.command, bridge.command, platform) && Array.isArray(entry.args) &&
    entry.args.length === bridge.args.length && entry.args.every((arg, index) => samePath(arg, bridge.args[index], platform));
}

function ownEntry(entry, bridge, legacyPaths, platform) {
  if (!object(entry) || Object.keys(entry).some(key => !['command', 'args', 'type', 'enabled', 'env'].includes(key)) ||
      (entry.type !== undefined && entry.type !== 'stdio') || (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') ||
      (entry.env !== undefined && (!object(entry.env) || Object.keys(entry.env).length !== 0))) return false;
  if (entryMatches(entry, bridge, platform)) return true;
  const node = typeof entry.command === 'string' && /^node(?:\.exe)?$/i.test(path.basename(entry.command));
  return node && Array.isArray(entry.args) && entry.args.length === 1 && legacyPaths.some(file => samePath(file, entry.args[0], platform));
}

function configuredEntry(host, bridge, enabled) {
  return {
    ...(host.type ? { type: host.type } : {}),
    command: bridge.command, args: bridge.args,
    ...(enabled ? {} : { enabled: false })
  };
}

function updateValue(value, key, entry) {
  if (entry === undefined) {
    if (value[key]) delete value[key][SERVER];
  } else {
    value[key] ||= {};
    value[key][SERVER] = entry;
  }
}

function compareToml(value) {
  if (object(value.mcp_servers) && Object.keys(value.mcp_servers).length === 0) delete value.mcp_servers;
  return value;
}

function editToml(text, parsed, entry) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  let result = text;
  if (parsed.entry !== undefined) {
    const lines = text.match(/[^\n]*\n|[^\n]+$/g) || [];
    const indexes = (predicate) => lines.flatMap((line, index) => predicate(line.trim()) ? [index] : []);
    const starts = indexes(line => line === MARKER_START);
    const ends = indexes(line => line === MARKER_END);
    if (starts.length === 1 && ends.length === 1 && starts[0] < ends[0]) {
      lines.splice(starts[0], ends[0] - starts[0] + 1);
    } else {
      const headings = indexes(line => /^\[(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*\.\s*(?:mini-mad-cat|"mini-mad-cat"|'mini-mad-cat')\]\s*(?:#.*)?$/.test(line));
      if (headings.length !== 1) throw new Error('The existing TOML registration needs manual editing.');
      const start = headings[0];
      const next = lines.findIndex((line, index) => index > start && /^\s*\[/.test(line));
      const length = (next < 0 ? lines.length : next) - start;
      const retained = lines.slice(start + 1, start + length).filter(line => /^\s*(?:#|$)/.test(line));
      lines.splice(start, length, ...retained);
    }
    result = lines.join('');
  }
  if (entry !== undefined) {
    const block = [MARKER_START, '[mcp_servers.mini-mad-cat]',
      'command = ' + JSON.stringify(entry.command), 'args = ' + JSON.stringify(entry.args)];
    if (entry.enabled === false) block.push('enabled = false');
    block.push(MARKER_END, '');
    result += (result && !result.endsWith('\n') ? newline : '') + block.join(newline);
  }
  updateValue(parsed.value, parsed.key, entry);
  const decoded = document(result, 'toml');
  if (!isDeepStrictEqual(structuredClone(compareToml(decoded.value)), structuredClone(compareToml(parsed.value)))) {
    throw new Error('The change would affect other TOML settings. Use the app’s settings to connect manually.');
  }
  return result;
}

function editConfig(text, parsed, entry, format) {
  if (format === 'toml') return editToml(text, parsed, entry);
  const input = text || '{}\n';
  const result = applyEdits(input, modify(input, [parsed.key, SERVER], entry, {}));
  updateValue(parsed.value, parsed.key, entry);
  if (!isDeepStrictEqual(document(result, 'json').value, parsed.value)) {
    throw new Error('The change would affect other JSON settings. Use the app’s settings to connect manually.');
  }
  return result;
}

function createIntegrationSetup({ bridge, homeDir = os.homedir(), env = process.env, platform = process.platform,
  stateDirectory = dataDirectory(env, platform, homeDir), legacyBridgePaths = [] } = {}) {
  const home = fs.realpathSync.native(homeDir);
  if (!bridge || typeof bridge.command !== 'string' || !path.isAbsolute(bridge.command) ||
      !Array.isArray(bridge.args) || bridge.args.some(arg => typeof arg !== 'string')) {
    throw new TypeError('An absolute bridge command and argument list are required.');
  }
  if ([bridge.command, ...bridge.args].some(arg => /[\x00-\x1f\x7f]/.test(arg) || arg.includes('${'))) {
    throw new TypeError('Integration paths must use literal arguments without interpolation or control characters.');
  }
  bridge = { command: bridge.command, args: [...bridge.args] };
  const legacy = [...legacyBridgePaths];
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    if (profilePath(home, local, platform)) {
      legacy.push(path.join(local, 'Programs', 'MiniMadCat', 'bridge', 'mcp.cjs'));
    }
  }

  function savedSelections() {
    if (!inspect(stateDirectory)) return {};
    const directory = ensurePrivateDirectory(stateDirectory);
    const bytes = readConfig(path.join(directory, 'integration-selection.json'), platform);
    if (!bytes) return {};
    const value = JSON.parse(bytes.toString('utf8'));
    if (!object(value)) throw new Error('Integration preferences are invalid.');
    return value;
  }

  function readHost(host) {
    let detected = true;
    try {
      if (!profilePath(home, host.root, platform)) {
        throw new Error('Configuration outside your home folder needs manual setup.');
      }
      const filename = safePath(home, host.target, platform);
      detected = host.detected(filename);
      if (host.restriction) return { detected, reason: host.restriction };
      const bytes = readConfig(filename, platform);
      const { text, bom } = decode(bytes);
      const parsed = document(text, host.format);
      const owned = ownEntry(parsed.entry, bridge, legacy, platform);
      const connected = owned && parsed.entry.enabled !== false;
      const reason = parsed.entry !== undefined && !owned ? 'Another registration already uses mini-mad-cat. Review it in the app’s settings.' : '';
      return { bytes, text, bom, parsed, detected, owned, connected, reason };
    } catch (error) {
      return { detected, reason: error.message };
    }
  }

  function list() {
    const saved = savedSelections();
    return hostLocations(home, env, platform).map(host => {
      const { connected = false, detected, owned, reason } = readHost(host);
      const available = (detected || owned) && !reason;
      const selected = !!(available && (connected || (!owned && saved[host.id] !== false)));
      return {
        id: host.id, label: host.label, scope: SCOPE, detected: detected || !!owned, connected, available: !!available, selected,
        reason: reason || (!available ? 'Application not detected.' : '')
      };
    });
  }

  function apply(selectedIds) {
    if (!Array.isArray(selectedIds) || selectedIds.some(id => !HOST_IDS.includes(id)) || new Set(selectedIds).size !== selectedIds.length) {
      throw new TypeError('Select only supported integration IDs.');
    }
    const state = ensurePrivateDirectory(stateDirectory);
    const stateFile = path.join(state, 'integration-selection.json');
    const oldState = readConfig(stateFile, platform);
    const saved = savedSelections();
    const selected = new Set(selectedIds);
    const hosts = hostLocations(home, env, platform);
    const results = [];
    for (const host of hosts) {
      const desired = selected.has(host.id);
      try {
        const existing = readHost(host);
        if (existing.reason) {
          if (desired || existing.detected) throw new Error(existing.reason);
          continue;
        }
        if (!existing.detected && !existing.owned) {
          if (desired) throw new Error('Application not detected.');
          continue;
        }
        // Grok imports lower-priority MCP settings from Claude Code and Cursor.
        // A disabled entry for this product prevents that specific inheritance,
        // without changing Grok's general compatibility settings.
        const disableInherited = !desired && host.id === 'grok' &&
          results.some(item => item.ok && selected.has(item.id) && ['claude-code', 'cursor'].includes(item.id));
        const entry = desired || disableInherited ? configuredEntry(host, bridge, desired) : undefined;
        const current = existing.parsed.entry;
        const same = entry === undefined ? current === undefined :
          entryMatches(current, bridge, platform) && (current.enabled !== false) === desired;
        if (!same) {
          const text = existing.bom + editConfig(existing.text, existing.parsed, entry, host.format);
          const filename = safePath(home, host.target, platform, true);
          if (existing.bytes) {
            const backupDir = ensurePrivateDirectory(path.join(state, 'integration-backups'));
            initializeExclusive(path.join(backupDir, host.id + '-' + randomUUID() + '.bak'), existing.bytes, 0o600);
          }
          replaceConfig(filename, existing.bytes, text, platform);
        }
        saved[host.id] = desired;
        results.push({ id: host.id, ok: true, changed: !same });
      } catch (error) {
        results.push({ id: host.id, ok: false, changed: false, reason: error.message });
      }
    }
    const stateContent = JSON.stringify(saved, null, 2) + '\n';
    if (!oldState || oldState.toString('utf8') !== stateContent) replaceConfig(stateFile, oldState, stateContent, platform);
    return { results, integrations: list() };
  }
  return { list, apply };
}

module.exports = { createIntegrationSetup };
