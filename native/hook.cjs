'use strict';

// Passive lifecycle adapter. Never reads transcripts or forwards hook payloads.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const HOSTS = new Set(['codex', 'claude', 'cursor', 'grok']);
const OWN_TOOL = /pet_(status|animate|configure|reset|react)(?:$|[^a-z])/i;

function structuredFailure(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.isError === true || value.success === false) return true;
  for (const key of ['exit_code', 'exitCode']) {
    if (Number.isInteger(value[key]) && value[key] !== 0) return true;
  }
  // MCP wrappers may retain their deterministic result in structuredContent.
  const nested = value.structuredContent;
  return Boolean(nested && typeof nested === 'object' &&
    (nested.isError === true || nested.success === false ||
      (Number.isInteger(nested.exit_code) && nested.exit_code !== 0)));
}

function classifyEvent(host, payload) {
  if (!HOSTS.has(host) || !payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const event = String(payload.hook_event_name || payload.hookEventName || payload.hook_event || '');
  const key = event.toLowerCase();
  const tool = String(payload.tool_name || payload.toolName || '');
  if (OWN_TOOL.test(tool)) return null;
  const failure = message => ({ outcome: 'failure', impact: 0.25, confidence: 1, severity: 0.35, message });
  if (key === 'sessionstart') {
    return { outcome: 'success', impact: 0.05, confidence: 0.5, severity: 0, message: 'Session started' };
  }
  if (key === 'posttoolusefailure') {
    if (payload.is_interrupt === true) return { outcome: 'partial', impact: 0.1, confidence: 1, severity: 0, message: 'Tool interrupted' };
    if (payload.failure_type === 'permission_denied') return { outcome: 'blocked', impact: 0.2, confidence: 1, severity: 0.1, message: 'Tool permission denied' };
    return failure('Tool failed');
  }
  if (key === 'stopfailure') {
    return { outcome: 'failure', impact: 0.5, confidence: 1, severity: 0.75, message: 'Turn ended with an API error' };
  }
  if (key === 'postmodelrequest') {
    if (payload.status === 'failed') return failure('Model request failed');
    return null; // A model request is not a completed user task.
  }
  if (key === 'posttooluse') {
    if (structuredFailure(payload.tool_response || payload.tool_output || payload.toolResponse)) return failure('Tool failed');
    return null; // Do not celebrate every successful tool invocation.
  }
  if (key === 'permissiondenied') {
    return { outcome: 'blocked', impact: 0.2, confidence: 1, severity: 0.1, message: 'Tool permission denied' };
  }
  if (key === 'interrupt') {
    return { outcome: 'partial', impact: 0.1, confidence: 1, severity: 0, message: 'Turn interrupted' };
  }
  if (key === 'stop') {
    if (payload.stop_hook_active === true) return null;
    if (payload.status === 'error') return failure('Turn ended with an error');
    if (payload.status === 'aborted') {
      return { outcome: 'partial', impact: 0.1, confidence: 1, severity: 0, message: 'Turn interrupted' };
    }
    return { outcome: 'success', impact: 0.1, confidence: 0.35, severity: 0, message: 'Turn ended' };
  }
  return null;
}

async function deliver(reaction) {
  const target = path.join(__dirname, 'event.cjs');
  if (!fs.existsSync(target)) return;
  await new Promise(resolve => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } };
    const child = spawn(process.execPath, [target], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    const timer = setTimeout(() => { child.kill(); finish(); }, 1200);
    child.once('error', finish);
    child.once('close', finish);
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(reaction));
  });
}

async function main() {
  const host = process.argv[2];
  let text = '';
  let tooLarge = false;
  try {
    for await (const chunk of process.stdin) {
      if (!tooLarge) text += chunk.toString('utf8');
      if (Buffer.byteLength(text, 'utf8') > 65536) { tooLarge = true; text = ''; }
    }
    if (!tooLarge) {
      const reaction = classifyEvent(host, JSON.parse(text || '{}'));
      if (reaction) await deliver(reaction);
    }
  } catch (_) {
    // Pet decoration must not change the host agent's control flow.
  }
  process.stdout.write('{}\n');
}

module.exports = { classifyEvent, structuredFailure };
if (require.main === module) main().catch(() => { process.stdout.write('{}\n'); process.exitCode = 0; });
