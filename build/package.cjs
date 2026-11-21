'use strict';

const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createReadStream, createWriteStream } = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { parseArgs } = require('node:util');
const pins = require('./upstream-runtimes.json');
const app = require('../package.json');

const project = path.join(__dirname, '..');
const outputDirectory = path.join(project, 'dist', 'packages');
const targets = {
  darwin: ['dmg', 'zip'],
  linux: ['deb', 'tar.gz'],
  win32: ['nsis']
};
const packageExtensions = {
  darwin: ['dmg', 'zip'],
  linux: ['deb', 'tar.gz'],
  win32: ['exe']
};
const maximumDownloadBytes = 256 * 1024 * 1024;

function runtimeSources(platform, architecture) {
  const target = `${platform}-${architecture}`;
  const electronArchive = `electron-v${pins.electron.version}-${target}.zip`;
  const nodeRoot = `node-v${pins.node.version}-${platform === 'win32' ? 'win' : platform}-${architecture}`;
  return {
    electron: {
      filename: electronArchive,
      url: `https://github.com/electron/electron/releases/download/v${pins.electron.version}/${electronArchive}`,
      checksum: pins.electron.checksums[target],
      hosts: ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']
    },
    node: {
      filename: `${nodeRoot}.${platform === 'win32' ? 'zip' : 'tar.gz'}`,
      url: `https://nodejs.org/download/release/v${pins.node.version}/${nodeRoot}.${platform === 'win32' ? 'zip' : 'tar.gz'}`,
      checksum: pins.node.checksums[target],
      hosts: ['nodejs.org'],
      executableMember: `${nodeRoot}/${platform === 'win32' ? 'node.exe' : 'bin/node'}`,
      licenseMember: `${nodeRoot}/LICENSE`
    }
  };
}

async function verifiedDownload(source, staging) {
  const { filename, checksum, hosts, url } = source;
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error(`Missing SHA-256 pin for ${filename}`);
  const destination = path.join(staging, filename);
  const signal = AbortSignal.timeout(240_000);
  let location = new URL(url);
  let response;
  for (let redirect = 0; redirect < 5; redirect++) {
    if (location.protocol !== 'https:' || location.port || location.username || location.password ||
        !hosts.includes(location.hostname)) throw new Error(`Unexpected download endpoint for ${filename}`);
    response = await fetch(location, { signal, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) break;
    const next = response.headers.get('location');
    await response.body?.cancel();
    if (!next) throw new Error(`Invalid download redirect for ${filename}`);
    location = new URL(next, location);
  }
  if (!response.ok || !response.body) throw new Error(`Download failed for ${filename} (HTTP ${response.status})`);

  const hash = createHash('sha256');
  let count = 0;
  const digest = new Transform({
    transform(chunk, _encoding, callback) {
      count += chunk.length;
      if (count > maximumDownloadBytes) return callback(new Error(`Download limit exceeded for ${filename}`));
      hash.update(chunk);
      callback(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body), digest, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
  if (hash.digest('hex') !== checksum) throw new Error(`SHA-256 mismatch for ${filename}`);
  console.log(`Verified ${filename}`);
  return destination;
}

async function extractWindowsNode(source, archive, runtime) {
  const { openPromise } = require('yauzl');
  const outputs = new Map([
    [source.executableMember, { name: 'node.exe', limit: 160 * 1024 * 1024 }],
    [source.licenseMember, { name: 'LICENSE', limit: 1024 * 1024 }]
  ]);
  const zip = await openPromise(archive, { strictFileNames: true });
  try {
    for await (const entry of zip.eachEntry()) {
      const output = outputs.get(entry.fileName);
      if (!output) continue;
      const type = (entry.externalFileAttributes >>> 16) & 0o170000;
      if ((type && type !== 0o100000) || entry.uncompressedSize < 1 || entry.uncompressedSize > output.limit) {
        throw new Error(`Unexpected Node archive member: ${output.name}`);
      }
      await pipeline(await zip.openReadStreamPromise(entry),
        createWriteStream(path.join(runtime, output.name), { flags: 'wx', mode: 0o600 }));
    }
    await Promise.all([...outputs.values()].map(output => fs.access(path.join(runtime, output.name))));
  } finally { zip.close(); }
}

async function stageNode(source, archive, staging, platform) {
  const extraction = path.join(staging, 'node-extracted');
  const runtime = path.join(staging, 'bridge-runtime');
  await fs.mkdir(runtime);
  // The Windows archive is a ZIP. Copy only the two known members.
  if (platform === 'win32') {
    await extractWindowsNode(source, archive, runtime);
    return runtime;
  }
  await fs.mkdir(extraction);
  execFileSync('tar', ['-xf', archive, '-C', extraction, source.executableMember, source.licenseMember], { stdio: 'inherit' });
  const executable = path.join(runtime, 'node');
  await Promise.all([
    fs.copyFile(path.join(extraction, source.executableMember), executable),
    fs.copyFile(path.join(extraction, source.licenseMember), path.join(runtime, 'LICENSE'))
  ]);
  await fs.chmod(executable, 0o755);
  return runtime;
}

async function stageBridge(staging) {
  const runtime = path.join(staging, 'bridge-app');
  const files = [
    'LICENSE', 'package.json', 'assets/manifest.json', 'config/reactions.json',
    'bridge/control.cjs', 'bridge/event.cjs', 'bridge/hook.cjs', 'bridge/mcp.cjs', 'bridge/tools.cjs',
    'lib/atlas.cjs', 'lib/commands.cjs', 'lib/control-client.cjs', 'lib/endpoint-file.cjs',
    'lib/paths.cjs', 'lib/reactions.cjs', 'lib/tracking.cjs'
  ];
  for (const file of files) {
    const destination = path.join(runtime, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(project, file), destination);
  }
  return runtime;
}

function signInputs(platform, signed) {
  if (!signed) return;
  const required = platform === 'darwin'
    ? ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
    : ['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD'];
  const missing = required.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Required signing credentials are missing: ${missing.join(', ')}`);
}

function configuration(platform, architecture, signed, electronArchive, nodeRuntime, bridge) {
  return {
    appId: 'io.github.jtalweezy.mini-mad-cat',
    productName: 'Mini Mad Cat',
    executableName: 'mini-mad-cat',
    artifactName: `mini-mad-cat-\${version}-${platform}-${architecture}.\${ext}`,
    directories: { output: outputDirectory, buildResources: 'build' },
    files: ['app/**/*', 'lib/**/*', 'assets/**/*', 'config/*.json', 'package.json', 'LICENSE'],
    extraResources: [
      { from: nodeRuntime, to: 'bridge-runtime' },
      { from: bridge, to: 'bridge-app' }
    ],
    asar: true,
    electronVersion: pins.electron.version,
    electronDist: electronArchive,
    electronFuses: {
      runAsNode: false,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      onlyLoadAppFromAsar: true,
      ...(platform === 'darwin' ? { resetAdHocDarwinSignature: true } : {}),
      // Electron provides embedded ASAR integrity on Windows and macOS.
      ...(platform === 'linux' ? {} : { enableEmbeddedAsarIntegrityValidation: true })
    },
    npmRebuild: false,
    forceCodeSigning: signed,
    publish: null,
    mac: {
      category: 'public.app-category.utilities',
      minimumSystemVersion: '13.5',
      hardenedRuntime: true,
      entitlements: 'build/entitlements.mac.plist',
      entitlementsInherit: 'build/entitlements.mac.plist',
      binaries: ['Contents/Resources/bridge-runtime/node'],
      notarize: signed,
      ...(signed ? {} : { identity: null })
    },
    dmg: { sign: signed },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      allowToChangeInstallationDirectory: false,
      packElevateHelper: false,
      runAfterFinish: true
    },
    win: { signAndEditExecutable: true },
    deb: {
      fpm: ['-d', 'libasound2t64 | libasound2']
    },
    linux: {
      category: 'Utility',
      maintainer: 'Mini Mad Cat maintainers <34728823+jtalweezy@users.noreply.github.com>',
      syncDesktopName: true
    }
  };
}

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  const { values } = parseArgs({
    options: {
      arch: { type: 'string', default: process.arch },
      signed: { type: 'boolean', default: false },
      unpacked: { type: 'boolean', default: false }
    }
  });
  const platform = process.platform;
  const architecture = values.arch;
  if (!targets[platform] || !['x64', 'arm64'].includes(architecture)) {
    throw new Error('Build on Linux, Windows, or macOS and target x64 or arm64.');
  }
  if (values.signed && (platform === 'linux' || values.unpacked)) {
    throw new Error('Use the release workflow for detached Linux signatures. Signed Windows and macOS builds require native installer targets.');
  }
  if (app.devDependencies.electron !== pins.electron.version) throw new Error('The Electron package and upstream runtime pins disagree.');
  signInputs(platform, values.signed);
  // Debian installs generated desktop files and icons as root for all users.
  if (platform === 'linux') process.umask(0o022);
  if (!values.signed) {
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
    for (const key of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD']) delete process.env[key];
  }
  const { Arch, Platform, build } = require('electron-builder');
  const tempParent = await fs.realpath(os.tmpdir());
  const staging = await fs.mkdtemp(path.join(tempParent, 'mini-mad-cat-build-'));
  try {
    const sources = runtimeSources(platform, architecture);
    const downloads = await Promise.allSettled([
      verifiedDownload(sources.electron, staging),
      verifiedDownload(sources.node, staging)
    ]);
    for (const result of downloads) if (result.status === 'rejected') throw result.reason;
    const [electronArchive, nodeArchive] = downloads.map(result => result.value);
    const nodeRuntime = await stageNode(sources.node, nodeArchive, staging, platform);
    const bridge = await stageBridge(staging);
    const built = await build({
      projectDir: project,
      config: configuration(platform, architecture, values.signed, electronArchive, nodeRuntime, bridge),
      targets: Platform.current().createTarget(values.unpacked ? ['dir'] : targets[platform], Arch[architecture]),
      publish: 'never'
    });
    if (values.unpacked) return;
    const prefix = `mini-mad-cat-${app.version}-${platform}-${architecture}`;
    const expected = packageExtensions[platform].map(extension => `${prefix}.${extension}`);
    const artifacts = new Map(built.map(file => [path.basename(file), file]));
    for (const ref of expected) {
      if (!artifacts.has(ref)) throw new Error(`Missing expected package ${ref}`);
      const file = artifacts.get(ref);
      const stat = await fs.stat(file);
      if (!stat.size) throw new Error(`Empty package ${ref}`);
      console.log(`${await digest(file)}  ${ref}`);
    }
  } finally {
    const resolved = await fs.realpath(staging);
    if (resolved !== staging || path.dirname(resolved) !== tempParent) {
      throw new Error('Unexpected build staging directory. Temporary files were kept.');
    }
    await fs.rm(resolved, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`Packaging failed: ${error.message}`);
  process.exitCode = 1;
});
