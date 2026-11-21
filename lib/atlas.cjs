'use strict';
const manifest = require('../assets/manifest.json');
const STATES = Object.freeze(Object.keys(manifest.states));
function directionForOffset(dx, dy, deadzone = 60) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new TypeError('Finite cursor coordinates required');
  if (Math.hypot(dx, dy) <= deadzone) return null;
  const degrees = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  return Math.round(degrees / 22.5) % 16;
}
function animationCell(state, elapsedMs, { loop = true } = {}) {
  const spec = manifest.states[state];
  if (!spec) throw new RangeError('Unknown animation state');
  const total = spec.durations.reduce((a, b) => a + b, 0);
  let elapsed = loop ? Math.max(0, elapsedMs) % total : Math.min(total - 1, Math.max(0, elapsedMs));
  let column = 0;
  while (column < spec.durations.length - 1 && elapsed >= spec.durations[column]) elapsed -= spec.durations[column++];
  return { row: spec.row, column };
}
function lookCell(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 16) throw new RangeError('Direction must be 0..15');
  return { row: 9 + Math.floor(index / 8), column: index % 8 };
}
function clampPosition(x, y, width, height, area) {
  return {
    x: Math.round(Math.max(area.x, Math.min(x, area.x + Math.max(0, area.width - width)))),
    y: Math.round(Math.max(area.y, Math.min(y, area.y + Math.max(0, area.height - height))))
  };
}
module.exports = { manifest, STATES, directionForOffset, animationCell, lookCell, clampPosition };
