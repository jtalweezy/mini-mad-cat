'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HIT_ALPHA, spritePoint, isSpritePoint, anchorInWindow, opaqueBounds, nearOpaqueBounds } = require('../lib/pointer.cjs');

const layout = { width: 512, height: 400, petX: 160, petY: 180, petWidth: 192, petHeight: 208 };

test('hit testing follows the actual content size on a scaled secondary monitor', () => {
  const content = { x: -1400, y: -900, width: 1536, height: 1000 };
  const point = spritePoint({ x: -635, y: -200 }, content, layout);
  assert.deepEqual(point, { x: 95, y: 100 });
  assert.ok(isSpritePoint(point, layout));
  assert.deepEqual(anchorInWindow(point, content, { x: -1410, y: -920 }, layout), { x: 775, y: 720 });
  assert.ok(!isSpritePoint(spritePoint({ x: -1400, y: -900 }, content, layout), layout));
  assert.ok(!isSpritePoint({ x: Infinity, y: 2 }, layout));
});

test('the hover band tracks artwork bounds and allows a wider exit margin', () => {
  const pixels = Buffer.alloc(4 * 40 * 44);
  pixels[(4 * 40 + 2) * 4 + 3] = HIT_ALPHA - 1;
  pixels[(12 * 40 + 16) * 4 + 3] = HIT_ALPHA;
  pixels[(28 * 40 + 23) * 4 + 3] = 255;
  const bounds = opaqueBounds(pixels, 40, 44);
  assert.deepEqual(bounds, { left: 16, top: 12, right: 24, bottom: 29 });
  assert.ok(!nearOpaqueBounds({ x: 3, y: 19 }, bounds, 10));
  assert.ok(nearOpaqueBounds({ x: 3, y: 19 }, bounds, 18));
  assert.ok(!nearOpaqueBounds({ x: 2, y: 4 }, bounds, 0));
});
