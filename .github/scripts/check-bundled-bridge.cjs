'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { node } = require('../../build/upstream-runtimes.json');

function resourceCandidates(directory) {
  const resources = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    if (item.name.endsWith('.app')) resources.push(path.join(directory, item.name, 'Contents', 'Resources'));
    else if (/^mac(?:-arm64|-x64)?$/.test(item.name)) resources.push(...resourceCandidates(path.join(directory, item.name)));
    else if (/^(linux|win)(?:-arm64|-x64)?-unpacked$/.test(item.name)) resources.push(path.join(directory, item.name, 'resources'));
  }
  return resources;
}

function run(binary, args, input) {
  const result = spawnSync(binary, args, { input, encoding: 'utf8', timeout: 15000, maxBuffer: 65536 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('The bundled Node runtime or bridge failed to start');
  return result.stdout.trim();
}

function main() {
  const [directory, expectedArchitecture] = process.argv.slice(2);
  const resources = resourceCandidates(directory);
  if (resources.length !== 1) throw new Error('Expected one native packaged application');
  const executable = path.join(resources[0], 'bridge-runtime', process.platform === 'win32' ? 'node.exe' : 'node');
  const runtime = JSON.parse(run(executable, ['-p', 'JSON.stringify([process.version,process.arch,process.platform])']));
  if (runtime[0] !== `v${node.version}` ||
      runtime[1] !== expectedArchitecture || runtime[2] !== process.platform) {
    throw new Error('Bundled runtime does not match the pinned version or target architecture');
  }
  const bridge = path.join(resources[0], 'bridge-app', 'bridge', 'mcp.cjs');
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
