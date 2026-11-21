'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { node } = require('../../build/upstream-runtimes.json');

const outputDirectory = path.join(__dirname, '..', '..', 'dist', 'packages');
const resourceLocations = {
  'win32-x64': ['win-unpacked', 'resources'],
  'win32-arm64': ['win-arm64-unpacked', 'resources'],
  'darwin-x64': ['mac', 'mini-mad-cat.app', 'Contents', 'Resources'],
  'darwin-arm64': ['mac-arm64', 'mini-mad-cat.app', 'Contents', 'Resources'],
  'linux-x64': ['linux-unpacked', 'resources'],
  'linux-arm64': ['linux-arm64-unpacked', 'resources']
};

function packagedFile(root, filename) {
  const resolved = fs.realpathSync.native(filename);
  const relative = path.relative(root, resolved);
  if (path.isAbsolute(relative) || !relative || relative === '..' || relative.startsWith('..' + path.sep) ||
      !fs.statSync(resolved).isFile()) {
    throw new Error('Expected a regular packaged file inside the build directory');
  }
  return resolved;
}

function run(binary, args, input) {
  const result = spawnSync(binary, args, { input, encoding: 'utf8', timeout: 15000, maxBuffer: 65536 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('The bundled Node runtime or bridge failed to start');
  return result.stdout.trim();
}

function main() {
  const [expectedArchitecture] = process.argv.slice(2);
  if (expectedArchitecture !== process.arch) throw new Error('Packager host architecture does not match the build target');
  const location = resourceLocations[process.platform + '-' + process.arch];
  if (!location) throw new Error('Unsupported native package target');
  const root = fs.realpathSync.native(outputDirectory);
  const resources = path.join(outputDirectory, ...location);
  const executable = packagedFile(root, path.join(resources, 'bridge-runtime', process.platform === 'win32' ? 'node.exe' : 'node'));
  const runtime = JSON.parse(run(executable, ['-p', 'JSON.stringify([process.version,process.arch,process.platform])']));
  if (runtime[0] !== `v${node.version}` ||
      runtime[1] !== expectedArchitecture || runtime[2] !== process.platform) {
    throw new Error('Bundled runtime does not match the pinned version or target architecture');
  }
  const bridge = packagedFile(root, path.join(resources, 'bridge-app', 'bridge', 'mcp.cjs'));
  const request = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) + '\n';
  const response = JSON.parse(run(executable, [bridge], request));
  if (response.id !== 1 || !response.result?.tools?.some(tool => tool.name === 'pet_status')) {
    throw new Error('The packaged bridge did not return its tool list');
  }
  console.log('Bundled Node and MCP bridge verified for ' + process.platform + '/' + expectedArchitecture);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
