'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { childPath, createOutputRun, removeCaseDirectory } = require('../scripts/smoke.cjs');

async function fixture(t) {
  const base = path.resolve(__dirname, '../runtime-smoke/path-checks');
  await fs.mkdir(base, { recursive: true });
  const directory = await fs.mkdtemp(path.join(base, 'fixture-'));
  t.after(async () => { assert.ok(directory.startsWith(base + path.sep)); await fs.rm(directory, { recursive: true, force: true }); });
  return directory;
}

test('smoke output uses a new private run inside an explicitly selected existing parent', async t => {
  const parent = await fixture(t);
  const one = await createOutputRun(parent), two = await createOutputRun(parent);
  assert.notEqual(one, two);
  assert.equal(path.dirname(one), await fs.realpath(parent));
  assert.match(path.basename(one), /^mini-mad-cat-smoke-/);
  if (process.platform !== 'win32') assert.equal((await fs.stat(one)).mode & 0o777, 0o700);
  await assert.rejects(createOutputRun(path.join(parent, 'missing')), /ENOENT/);
});

test('artifact names cannot traverse outside their generated run', async t => {
  const run = await fixture(t);
  assert.equal(childPath(run, 'high-success-0200.png.json'), path.join(run, 'high-success-0200.png.json'));
  for (const name of ['../outside', '..', '/outside', 'a/b', 'a\\b', '']) assert.throws(() => childPath(run, name), /Invalid|escaped/);
});

test('cleanup accepts only a real directly contained case directory', async t => {
  const run = await fixture(t);
  const valid = path.join(run, 'data-failure'); await fs.mkdir(valid, { mode: 0o700 });
  await fs.writeFile(path.join(valid, 'fixture.txt'), 'test data');
  await removeCaseDirectory(run, valid);
  await assert.rejects(fs.access(valid), /ENOENT/);
  await assert.rejects(removeCaseDirectory(run, path.join(run, 'unrelated')), /Unsafe/);
  await assert.rejects(removeCaseDirectory(run, path.join(run, '..', 'data-failure')), /Unsafe/);
});
