'use strict';
const { STATES } = require('./atlas.cjs');
const { TRACKING_MODES } = require('./tracking.cjs');
function exactKeys(object, keys) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new TypeError('An object is required');
  const unknown = Object.keys(object).filter(key => !keys.includes(key));
  if (unknown.length) throw new TypeError('Unknown field: ' + unknown.join(', '));
}
function validateCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new TypeError('Command must be an object');
  switch (command.action) {
    case 'animate':
      exactKeys(command, ['action', 'state', 'durationMs']);
      if (!STATES.includes(command.state)) throw new TypeError('Unknown animation state');
      if (command.durationMs !== undefined && (!Number.isInteger(command.durationMs) || command.durationMs < 100 || command.durationMs > 300000)) throw new TypeError('durationMs must be an integer from 100 to 300000');
      return { action: 'animate', state: command.state, durationMs: command.durationMs ?? 7000 };
    case 'configure': {
      exactKeys(command, ['action', 'followCursor', 'trackingMode', 'clickThrough', 'scale', 'reducedMotion', 'contextBubbles']);
      for (const field of ['followCursor', 'clickThrough', 'reducedMotion', 'contextBubbles']) if (command[field] !== undefined && typeof command[field] !== 'boolean') throw new TypeError(field + ' must be boolean');
      if (command.scale !== undefined && (!Number.isFinite(command.scale) || command.scale < .5 || command.scale > 2)) throw new TypeError('scale must be from 0.5 to 2');
      if (command.trackingMode !== undefined && !TRACKING_MODES.includes(command.trackingMode)) throw new TypeError('trackingMode must be always, after-click, or off');
      return { ...command };
    }
    case 'react': {
      const { validateReaction } = require('./reactions.cjs');
      const {action,...event}=command;
      return { action, ...validateReaction(event) };
    }
    case 'reset': case 'quit': exactKeys(command, ['action']); return { action: command.action };
    default: throw new TypeError('Unknown action');
  }
}
module.exports = { exactKeys, validateCommand };
