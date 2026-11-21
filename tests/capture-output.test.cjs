'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { captureRequest, captureTarget, writeCapture } = require('../lib/capture-output.cjs');

test('capture is opt-in hidden diagnostics with one PNG output', () => {
  assert.equal(captureRequest(['--capture=preview.png']),null);
  assert.equal(captureRequest(['--hidden']),null);
  assert.throws(()=>captureRequest(['--hidden','--capture=settings.json']),/PNG/);
  assert.throws(()=>captureRequest(['--hidden','--capture=one.png','--capture=two.png']),/one capture/);
});

test('capture frames stay inside the user-selected output root and have fixed names', () => {
  const request=captureRequest(['--hidden','--capture='+path.join(os.tmpdir(),'madcat-frame.png'),'--capture-series']);
  const target=captureTarget(request,500);
  assert.equal(path.dirname(target),request.directory);
  assert.equal(path.basename(target),'madcat-frame-0500.png');
  assert.throws(()=>captureTarget(request,100),/Unknown capture/);
});

test('capture writes never overwrite an existing file', () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'madcat-capture-test-'));
  try {
    const file=path.join(directory,'frame.png');
    writeCapture(file,Buffer.from('first capture'));
    assert.throws(()=>writeCapture(file,Buffer.from('replacement')),error=>error.code==='EEXIST');
    assert.equal(fs.readFileSync(file,'utf8'),'first capture');
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
