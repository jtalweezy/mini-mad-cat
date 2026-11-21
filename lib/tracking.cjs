'use strict';
const { performance } = require('node:perf_hooks');

const TRACKING_MODES = Object.freeze(['always', 'after-click', 'off']);
const DEFAULT_TRACKING_MODE = 'after-click';
const TRACKING_WINDOW_MS = 10000;

function createTrackingController({ mode = DEFAULT_TRACKING_MODE, now = () => performance.now() } = {}) {
  if (!TRACKING_MODES.includes(mode)) throw new TypeError('Unknown mouse tracking mode');
  let currentMode = mode;
  let activeUntil = 0;

  return {
    setMode(value) {
      if (!TRACKING_MODES.includes(value)) throw new TypeError('Unknown mouse tracking mode');
      if (value !== currentMode) activeUntil = 0;
      currentMode = value;
    },
    notePrimaryInteraction() {
      if (currentMode === 'after-click') activeUntil = now() + TRACKING_WINDOW_MS;
    },
    status() {
      const remainingMs = currentMode === 'after-click' ? Math.max(0, activeUntil - now()) : 0;
      return { mode: currentMode, active: currentMode === 'always' || remainingMs > 0, remainingMs: Math.ceil(remainingMs), windowMs: TRACKING_WINDOW_MS };
    },
    behavior({ available = true, followCursor = false, dragging = false } = {}) {
      const active = available && this.status().active;
      return { active, gaze: active && !dragging, chase: active && followCursor && !dragging };
    }
  };
}

module.exports = { DEFAULT_TRACKING_MODE, TRACKING_MODES, TRACKING_WINDOW_MS, createTrackingController };
