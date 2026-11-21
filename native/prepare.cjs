'use strict';

// Materialize one native wrapper locally. Does not edit any client configuration.
const fs = require('node:fs');
const path = require('node:path');

function quotePosix(value) { return "'" + value.replaceAll("'", "'\\''") + "'"; }
function quotePowerShell(value) { return "'" + value.replaceAll("'", "''") + "'"; }

function prepare(host, bundleRoot) {
  if (!['codex', 'claude', 'cursor', 'grok'].includes(host)) throw new Error('Choose codex, claude, cursor, or grok.');
  const root = fs.realpathSync(path.resolve(bundleRoot));
  for (const file of ['bridge/mcp.cjs', 'bridge/hook.cjs', 'bridge/event.cjs']) {
    if (!fs.statSync(path.join(root, file)).isFile()) throw new Error('Missing ' + file);
  }
  const source = path.join(__dirname, 'templates', host);
  const destination = path.resolve(root, 'generated-native', host);
  if (!destination.startsWith(root + path.sep)) throw new Error('Output must stay in this bundle.');
  const hookPath = path.join(root, 'bridge', 'hook.cjs');
  const commandPosix = [process.execPath, hookPath, host].map(quotePosix).join(' ');
  const commandWindows = '& ' + [process.execPath, hookPath, host].map(quotePowerShell).join(' ');
  const replacements = {
    '__NODE_EXECUTABLE__': process.execPath,
    '__BUNDLE_ROOT__': root.replaceAll('\\', '/'),
    '__HOOK_COMMAND_POSIX__': commandPosix,
    '__HOOK_COMMAND_WINDOWS__': commandWindows,
    '__HOOK_COMMAND_CURRENT__': process.platform === 'win32' ? commandWindows : commandPosix
  };
  function replace(value) {
    if (typeof value === 'string') {
      for (const [key, replacement] of Object.entries(replacements)) value = value.replaceAll(key, () => replacement);
      return value;
    }
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)]));
    return value;
  }
  function copy(sourceDir, outputDir) {
    if (fs.existsSync(outputDir) && fs.lstatSync(outputDir).isSymbolicLink()) throw new Error('Generated output may not be a symlink.');
    fs.mkdirSync(outputDir, { recursive: true });
    if (!fs.realpathSync(outputDir).startsWith(root + path.sep)) throw new Error('Generated output escaped this bundle.');
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Template symlinks are not supported.');
      const sourcePath = path.join(sourceDir, entry.name);
      const outputPath = path.join(outputDir, entry.name);
      if (entry.isDirectory()) copy(sourcePath, outputPath);
      else {
        if (fs.existsSync(outputPath) && fs.lstatSync(outputPath).isSymbolicLink()) throw new Error('Generated output may not be a symlink.');
        const sourceText = fs.readFileSync(sourcePath, 'utf8');
        const outputText = entry.name.endsWith('.json')
          ? JSON.stringify(replace(JSON.parse(sourceText)), null, 2) + '\n'
          : replace(sourceText);
        fs.writeFileSync(outputPath, outputText, { mode: 0o600 });
      }
    }
  }
  copy(source, destination);
  const locationPath = path.join(destination, 'companion-location.json');
  if (fs.existsSync(locationPath) && fs.lstatSync(locationPath).isSymbolicLink()) throw new Error('Generated location output may not be a symlink.');
  fs.writeFileSync(locationPath, JSON.stringify({ bundleRoot: root, startDirectory: root }, null, 2) + '\n', { mode: 0o600 });
  const skillsSource = path.join(root, 'skills');
  if (fs.existsSync(skillsSource)) {
    if (fs.lstatSync(skillsSource).isSymbolicLink()) throw new Error('Skills source may not be a symlink.');
    copy(skillsSource, path.join(destination, 'skills'));
  }
  for (const name of ['AGENT_HANDOFF.md', 'INTEGRATIONS.md', 'NATIVE_PLUGIN.md', 'LICENSE']) {
    const documentPath = path.join(root, name);
    const outputPath = path.join(destination, name);
    if (fs.existsSync(documentPath) && fs.statSync(documentPath).isFile()) {
      if (fs.existsSync(outputPath) && fs.lstatSync(outputPath).isSymbolicLink()) throw new Error('Generated document output may not be a symlink.');
      fs.copyFileSync(documentPath, outputPath);
    }
  }
  if (host === 'codex') {
    let catalogDir = path.join(root, 'generated-native');
    for (const segment of ['.agents', 'plugins']) {
      catalogDir = path.join(catalogDir, segment);
      if (fs.existsSync(catalogDir) && fs.lstatSync(catalogDir).isSymbolicLink()) throw new Error('Catalog output may not be a symlink.');
      fs.mkdirSync(catalogDir, { recursive: true });
      if (!fs.realpathSync(catalogDir).startsWith(root + path.sep)) throw new Error('Catalog output escaped this bundle.');
    }
    const catalogPath = path.join(catalogDir, 'marketplace.json');
    if (fs.existsSync(catalogPath) && fs.lstatSync(catalogPath).isSymbolicLink()) throw new Error('Catalog output may not be a symlink.');
    fs.writeFileSync(catalogPath, JSON.stringify({
      name: 'mini-mad-cat-local',
      interface: { displayName: 'Mini Mad Cat (local)' },
      plugins: [{ name: 'mini-mad-cat', source: { source: 'local', path: './codex' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }]
    }, null, 2) + '\n', { mode: 0o600 });
  }
  return destination;
}

module.exports = { prepare, quotePosix, quotePowerShell };
if (require.main === module) {
  const args = process.argv.slice(2);
  const hostIndex = args.indexOf('--host');
  const rootIndex = args.indexOf('--bundle-root');
  try {
    const output = prepare(hostIndex >= 0 ? args[hostIndex + 1] : '', rootIndex >= 0 ? args[rootIndex + 1] : process.cwd());
    process.stdout.write(JSON.stringify({ ok: true, output, installed: false }) + '\n');
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
