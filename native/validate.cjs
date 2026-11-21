'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const target = path.resolve(__dirname, '../tests/native.test.cjs');
if (!fs.existsSync(target)) {
  process.stderr.write('Run this validator from the complete companion bundle; tests/native.test.cjs is required.\n');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', target], { stdio:'inherit', windowsHide:true });
  const ok = result.status === 0 && !result.error;
  if (result.error) process.stderr.write(result.error.message + '\n');
  const report = {
    ok,
    command: 'node native/validate.cjs',
    integrationTests: 3,
    platform: process.platform,
    node: process.version,
    scope: ['coarse event mapping', 'actual passive hook delivery and chat privacy', 'malformed and oversized input fail-open', 'native paths and copied instructions', 'shell metacharacter path execution'],
    globalConfigurationChanged: false
  };
  fs.writeFileSync(path.join(__dirname, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
  process.exitCode = ok ? 0 : 1;
}
