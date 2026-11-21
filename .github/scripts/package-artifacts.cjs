'use strict';

const { createHash } = require('node:crypto');
const { createReadStream, promises: fs } = require('node:fs');
const path = require('node:path');
const { version } = require('../../package.json');

const architectures = ['x64', 'arm64'];
const packageTypes = { win32: ['exe'], darwin: ['dmg', 'zip'], linux: ['deb', 'tar.gz'] };

function packageNames(platform, arch) {
  if (!Object.hasOwn(packageTypes, platform) || !architectures.includes(arch)) {
    throw new Error('Unrecognized package target');
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a stable package version');
  return packageTypes[platform].map(extension => `mini-mad-cat-${version}-${platform}-${arch}.${extension}`);
}

async function verifyFormat(file) {
  if (!(await fs.lstat(file)).isFile()) throw new Error(`Expected a regular file: ${path.basename(file)}`);
  const handle = await fs.open(file, 'r');
  try {
    const signature = Buffer.alloc(8);
    const length = (await handle.stat()).size;
    const diskImage = file.endsWith('.dmg');
    if (length < (diskImage ? 512 : signature.length)) throw new Error('Package is truncated');
    await handle.read(signature, 0, signature.length, diskImage ? length - 512 : 0);
    const magic = signature.toString('hex');
    const prefix = diskImage ? '6b6f6c79' : file.endsWith('.exe') ? '4d5a'
      : file.endsWith('.zip') ? '504b0304' : file.endsWith('.deb') ? '213c617263683e0a' : '1f8b';
    if (!magic.startsWith(prefix)) throw new Error(`Wrong archive format: ${path.basename(file)}`);
  } finally {
    await handle.close();
  }
}

async function writeChecksums(directory, names) {
  const lines = [];
  for (const name of names.sort()) {
    const file = path.join(directory, name);
    if (!(await fs.lstat(file)).isFile()) throw new Error(`Expected a regular file: ${name}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    lines.push(`${hash.digest('hex')}  ${name}`);
  }
  await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`, { flag: 'wx' });
}

async function stage(platform, arch, source, destination) {
  const names = packageNames(platform, arch);
  for (const name of names) await verifyFormat(path.join(source, name));
  await fs.mkdir(destination);
  for (const name of names) await fs.copyFile(path.join(source, name), path.join(destination, name));
}

async function completeRelease(directory) {
  const expected = ['mini-mad-cat-linux-signing-key.asc'];
  for (const platform of Object.keys(packageTypes)) {
    for (const arch of architectures) {
      for (const name of packageNames(platform, arch)) {
        await verifyFormat(path.join(directory, name));
        expected.push(name);
        if (platform === 'linux') expected.push(`${name}.asc`);
      }
    }
  }
  expected.sort();
  if ((await fs.readdir(directory)).sort().join('\n') !== expected.join('\n')) {
    throw new Error('Release files do not match the exact expected set');
  }
  await writeChecksums(directory, expected);
}

async function main([command, ...args]) {
  if (command === 'stage' && args.length === 4) return stage(...args);
  if (command === 'checksum' && args.length === 3) return writeChecksums(args[2], packageNames(args[0], args[1]));
  if (command === 'complete-release' && args.length === 1) return completeRelease(args[0]);
  throw new Error('Use stage <platform> <arch> <source> <destination>, checksum <platform> <arch> <directory>, or complete-release <directory>');
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { verifyFormat };
