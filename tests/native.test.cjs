'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { classifyEvent } = require('../bridge/hook.cjs');
const { prepare } = require('../native/prepare.cjs');

function fixture(t) {
  const root = path.resolve(__dirname, '../runtime-smoke/native-checks');
  fs.mkdirSync(root, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(root, 'fixture-'));
  t.after(() => {
    const resolved = path.resolve(temporary);
    assert.ok(resolved.startsWith(root + path.sep));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const bundle = path.join(temporary, "bundle '$` & space");
  const bridge = path.join(bundle, 'bridge');
  fs.mkdirSync(bridge, { recursive: true });
  fs.copyFileSync(path.resolve(__dirname, '../bridge/hook.cjs'), path.join(bridge, 'hook.cjs'));
  fs.writeFileSync(path.join(bridge, 'mcp.cjs'), '// fixture only\n');
  fs.writeFileSync(path.join(bridge, 'event.cjs'), "let t='';process.stdin.on('data',c=>t+=c);process.stdin.on('end',()=>require('node:fs').writeFileSync(require('node:path').join(__dirname,'received.json'),t));\n");
  return { bundle, bridge, trace: path.join(bridge, 'received.json') };
}

test('lifecycle mapping separates task evidence, user interruptions and companion calls', () => {
  assert.equal(classifyEvent('codex', {hook_event_name:'PostModelRequest',status:'completed'}), null);
  assert.equal(classifyEvent('codex', {hook_event_name:'PostModelRequest',status:'failed'}).outcome, 'failure');
  assert.equal(classifyEvent('claude', {hook_event_name:'PostToolUseFailure',tool_name:'mcp__mini_mad_cat__pet_react'}), null);
  assert.equal(classifyEvent('grok', {hookEventName:'PermissionDenied'}).outcome, 'blocked');
  assert.equal(classifyEvent('cursor', {hook_event_name:'stop',status:'aborted'}).outcome, 'partial');
  assert.equal(classifyEvent('claude', {hook_event_name:'Stop',stop_hook_active:true}), null);
  assert.equal(classifyEvent('codex', {hook_event_name:'PostToolUse',tool_response:{exit_code:1}}).outcome, 'failure');
  assert.equal(classifyEvent('codex', {hook_event_name:'PostToolUse',tool_response:{exit_code:0,stdout:'error'}}), null);
  assert.equal(classifyEvent('cursor', {hook_event_name:'postToolUseFailure',failure_type:'permission_denied'}).outcome, 'blocked');
  assert.ok(classifyEvent('claude', {hook_event_name:'Stop'}).confidence < 0.5);
});

test('passive hook sends only coarse event fields and fails open on malformed or oversized input', t => {
  const { bridge, trace } = fixture(t);
  const hook = path.join(bridge, 'hook.cjs');
  const run = input => spawnSync(process.execPath, [hook, 'claude'], { input, encoding:'utf8', timeout:4000, windowsHide:true });
  const delivered = run(JSON.stringify({hook_event_name:'StopFailure',prompt:'PRIVATE',transcript_path:'PRIVATE',error:'PRIVATE'}));
  assert.equal(delivered.status, 0);
  assert.equal(delivered.stdout, '{}\n');
  const reaction = JSON.parse(fs.readFileSync(trace, 'utf8'));
  assert.equal(reaction.outcome, 'failure');
  assert.equal(JSON.stringify(reaction).includes('PRIVATE'), false);
  assert.deepEqual(Object.keys(reaction).sort(), ['confidence','impact','message','outcome','severity']);
  fs.writeFileSync(trace, 'sentinel');
  for (const input of ['not json', JSON.stringify({hook_event_name:'StopFailure',data:'x'.repeat(70000)})]) {
    const result = run(input);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '{}\n');
    assert.equal(fs.readFileSync(trace, 'utf8'), 'sentinel');
  }
});

test('native wrappers include agent instructions and execute safely from a metacharacter path', t => {
  const { bundle } = fixture(t);
  fs.mkdirSync(path.join(bundle, 'skills/fixture-skill'), { recursive:true });
  fs.writeFileSync(path.join(bundle, 'skills/fixture-skill/SKILL.md'), 'fixture skill data\n');
  fs.writeFileSync(path.join(bundle, 'AGENT_HANDOFF.md'), 'fixture handoff data\n');
  for (const host of ['codex','claude','cursor','grok']) {
    const output = prepare(host, bundle);
    assert.equal(fs.readFileSync(path.join(output, 'skills/fixture-skill/SKILL.md'),'utf8'), 'fixture skill data\n');
    assert.equal(fs.readFileSync(path.join(output, 'AGENT_HANDOFF.md'),'utf8'), 'fixture handoff data\n');
    function inspect(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes:true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) inspect(file);
        else if (file.endsWith('.json')) {
          const text = fs.readFileSync(file,'utf8');
          JSON.parse(text);
          assert.equal(text.includes('__BUNDLE_ROOT__'), false);
        }
      }
    }
    inspect(output);
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(bundle, 'generated-native/.agents/plugins/marketplace.json'),'utf8'));
  assert.equal(catalog.plugins[0].source.path, './codex');
  const config = JSON.parse(fs.readFileSync(path.join(bundle, 'generated-native/codex/hooks/codex.json'),'utf8'));
  const command = config.hooks.Stop[0].hooks[0][process.platform === 'win32' ? 'commandWindows' : 'command'];
  const shell = process.platform === 'win32' ? path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe') : '/bin/sh';
  const args = process.platform === 'win32' ? ['-NoProfile','-NonInteractive','-Command',command] : ['-c',command];
  const result = spawnSync(shell, args, { input:JSON.stringify({hook_event_name:'Stop'}), encoding:'utf8', timeout:5000, windowsHide:true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '{}');
});
