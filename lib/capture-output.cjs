'use strict';
const fs = require('node:fs');
const path = require('node:path');

const CAPTURE_TIMES = Object.freeze([200, 500, 900, 1400, 2100, 2800]);

function captureRequest(args) {
  // Output roots are deliberately chosen by the same user launching this local
  // diagnostic. They never come from an MCP command or an HTTP request.
  if (!args.includes('--hidden')) return null;
  const values = args.filter(argument => argument.startsWith('--capture='));
  if (!values.length) return null;
  if (values.length !== 1) throw new Error('Specify one capture output file.');
  const value = values[0].slice('--capture='.length);
  if (!value || /[\u0000-\u001f]/.test(value) || path.extname(value).toLowerCase() !== '.png') throw new Error('Capture output must be a PNG filename.');
  const output = path.resolve(value);
  return { directory: path.dirname(output), filename: path.basename(output), series: args.includes('--capture-series') };
}

function captureTarget(request, delay) {
  if (request.series && !CAPTURE_TIMES.includes(delay)) throw new Error('Unknown capture frame time.');
  const filename = request.series ? request.filename.slice(0, -4) + '-' + String(delay).padStart(4, '0') + '.png' : request.filename;
  const target = path.resolve(request.directory, filename);
  if (path.dirname(target) !== path.resolve(request.directory)) throw new Error('Capture must remain inside its selected output directory.');
  return target;
}

function writeCapture(file, bytes) {
  // Exclusive creation prevents a stale diagnostic run or existing link from
  // overwriting user files. Smoke tests use a fresh private directory per run.
  const descriptor = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, bytes); }
  finally { fs.closeSync(descriptor); }
}

module.exports = { CAPTURE_TIMES, captureRequest, captureTarget, writeCapture };
