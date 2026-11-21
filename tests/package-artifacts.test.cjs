'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { verifyFormat } = require('../.github/scripts/package-artifacts.cjs');

const headers = [
  ['installer.exe', Buffer.from('4d5a000000000000', 'hex')],
  ['installer.dmg', Buffer.concat([Buffer.alloc(8), Buffer.from('koly'), Buffer.alloc(508)])],
  ['portable.zip', Buffer.from('504b030400000000', 'hex')],
  ['installer.deb', Buffer.from('!<arch>\n')],
  ['portable.tar.gz', Buffer.from('1f8b000000000000', 'hex')]
];

test('native package format checks accept the expected magic and reject changed or truncated files', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mini-mad-cat-format-'));
  try {
    for (const [name, bytes] of headers) {
      const filename = path.join(directory, name);
      await fs.writeFile(filename, bytes);
      await assert.doesNotReject(verifyFormat(filename));
      await fs.writeFile(filename, Buffer.alloc(bytes.length));
      await assert.rejects(verifyFormat(filename), /Wrong archive format/);
      await fs.writeFile(filename, Buffer.alloc(4));
      await assert.rejects(verifyFormat(filename), /truncated/);
    }
  } finally {
    for (const name of await fs.readdir(directory)) await fs.unlink(path.join(directory, name));
    await fs.rmdir(directory);
  }
});
