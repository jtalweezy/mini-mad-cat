'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTrackingController, TRACKING_WINDOW_MS } = require('../lib/tracking.cjs');
const { commandForTool } = require('../bridge/tools.cjs');
const { validateCommand } = require('../lib/commands.cjs');

test('the default waits for a click and Always retains the independent followCursor toggle', () => {
  assert.deepEqual(createTrackingController().behavior(), {active:false,gaze:false,chase:false});
  const tracking = createTrackingController({ mode: 'always' });
  assert.deepEqual(tracking.behavior(), {active:true,gaze:true,chase:false});
  assert.deepEqual(tracking.behavior({followCursor:true}), {active:true,gaze:true,chase:true});
  assert.deepEqual(tracking.behavior({available:false,followCursor:true}), {active:false,gaze:false,chase:false});
});

test('after-click mode gates both gaze and chase at the exact monotonic 10-second boundary', () => {
  let now = 0;
  const tracking = createTrackingController({mode:'after-click',now:()=>now});
  assert.equal(TRACKING_WINDOW_MS,10000);
  assert.deepEqual(tracking.behavior({followCursor:true}), {active:false,gaze:false,chase:false});
  tracking.notePrimaryInteraction();
  now = 9999;
  assert.deepEqual(tracking.behavior({followCursor:true}), {active:true,gaze:true,chase:true});
  assert.equal(tracking.status().remainingMs,1);
  now = 10000;
  assert.deepEqual(tracking.behavior({followCursor:true}), {active:false,gaze:false,chase:false});
  assert.equal(tracking.status().remainingMs,0);
});

test('a new completed interaction renews once while querying behavior or changing follow preference never extends the window', () => {
  let now = 1000;
  const tracking = createTrackingController({mode:'after-click',now:()=>now});
  tracking.notePrimaryInteraction();
  now = 10000;
  tracking.behavior({followCursor:true});tracking.behavior({followCursor:false});tracking.setMode('after-click');
  assert.equal(tracking.status().remainingMs,1000);
  tracking.notePrimaryInteraction();
  assert.equal(tracking.status().remainingMs,10000);
  now = 20000;
  assert.equal(tracking.status().active,false);
});

test('clearing a sleep-interrupted interaction preserves the tracking mode', () => {
  const tracking = createTrackingController({ now: () => 100 });
  tracking.notePrimaryInteraction();
  assert.equal(tracking.status().active, true);
  tracking.clearInteraction();
  assert.equal(tracking.status().remainingMs, 0);
  assert.equal(tracking.behavior({ followCursor: true }).chase, false);
  tracking.notePrimaryInteraction();
  assert.equal(tracking.behavior().gaze, true);
  tracking.setMode('always');
  tracking.clearInteraction();
  assert.equal(tracking.behavior().gaze, true);
});

test('off/mode transitions/restart clear temporary permission and explicit dragging does not enable automatic gaze or chase', () => {
  let now = 0;
  const tracking = createTrackingController({mode:'after-click',now:()=>now});
  tracking.notePrimaryInteraction();
  assert.deepEqual(tracking.behavior({followCursor:true,dragging:true}), {active:true,gaze:false,chase:false});
  now = 11000;
  assert.deepEqual(tracking.behavior({followCursor:true,dragging:true}), {active:false,gaze:false,chase:false});
  tracking.setMode('off');tracking.notePrimaryInteraction();assert.equal(tracking.status().active,false);
  tracking.setMode('always');assert.equal(tracking.status().active,true);
  tracking.setMode('after-click');assert.equal(tracking.status().active,false);
  assert.equal(createTrackingController({mode:'after-click',now:()=>now}).status().active,false);
});

test('tracking mode is accepted through validated MCP and local control configuration', () => {
  assert.deepEqual(commandForTool('pet_configure',{trackingMode:'after-click',followCursor:true}),{action:'configure',trackingMode:'after-click',followCursor:true});
  assert.deepEqual(validateCommand({action:'configure',trackingMode:'off'}),{action:'configure',trackingMode:'off'});
  assert.throws(()=>commandForTool('pet_configure',{trackingMode:'forever'}),/trackingMode/);
});
