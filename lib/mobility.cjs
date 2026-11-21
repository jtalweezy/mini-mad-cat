'use strict';
const mobility = require('../assets/mobility-manifest.json');
const { animationCell } = require('./atlas.cjs');

const HORIZONTAL_MODES = new Set(['running-left', 'running-right']);
const VERTICAL_MODES = new Set(['jumpjet', 'crouch']);
const AXIS_HYSTERESIS = 1.12;

function classifyMotion(dx, dy, previousMode = null) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new TypeError('Finite movement deltas required');
  const horizontal = Math.abs(dx), vertical = Math.abs(dy);
  if (Math.max(horizontal, vertical) < 0.01) return null;
  let verticalAxis = vertical > horizontal;
  if (HORIZONTAL_MODES.has(previousMode) && vertical <= horizontal * AXIS_HYSTERESIS) verticalAxis = false;
  if (VERTICAL_MODES.has(previousMode) && horizontal <= vertical * AXIS_HYSTERESIS) verticalAxis = true;
  return verticalAxis ? (dy < 0 ? 'jumpjet' : 'crouch') : (dx < 0 ? 'running-left' : 'running-right');
}

function canChase({ trackingAllowsChase = false, manualActive = false, dragging = false } = {}) {
  return trackingAllowsChase && !manualActive && !dragging;
}

function travelVisual(mode, elapsedMs, { mobilityAvailable = false, thrustAvailable = false, reducedMotion = false } = {}) {
  const spec = mobility.modes[mode];
  const state = spec ? spec.fallbackState : mode;
  if (!spec && !HORIZONTAL_MODES.has(mode)) throw new TypeError('Unknown travel mode');
  const elapsed = reducedMotion ? 0 : Math.max(0, elapsedMs);
  const fallback = animationCell(state, elapsed);
  const base = { ...fallback, sheet: 'core', state, motion: mode, thrust: false, reducedMotion, fallback };
  if (!spec || !mobilityAvailable) return base;
  const total = spec.durations.reduce((sum, value) => sum + value, 0);
  let remainder = spec.loop === false ? Math.min(elapsed,total-1) : elapsed % total, column = 0;
  while (column < spec.durations.length - 1 && remainder >= spec.durations[column]) remainder -= spec.durations[column++];
  const thrust = mode === 'jumpjet' && thrustAvailable && !reducedMotion;
  return {
    ...base, sheet: 'mobility', row: spec.row, column, thrust,
    ...(thrust ? { thrustSpec: {
      column: Math.floor(elapsed / mobility.thrust.frameDurationMs) % mobility.thrust.columns,
      sourceAnchor: mobility.thrust.sourceAnchor,
      scale: mobility.thrust.scale,
      attachments: mobility.thrust.attachments[column]
    } } : {})
  };
}

module.exports = { mobility, AXIS_HYSTERESIS, classifyMotion, canChase, travelVisual };
