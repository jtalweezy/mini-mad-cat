'use strict';

const HIT_ALPHA = 24;

function isFinitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function isUsableRect(rect) {
  return isFinitePoint(rect) && Number.isFinite(rect.width) && rect.width > 0 &&
    Number.isFinite(rect.height) && rect.height > 0;
}

function spritePoint(point, content, layout) {
  if (!isFinitePoint(point) || !isUsableRect(content)) return null;
  const projected = {
    x: (point.x - content.x) * layout.width / content.width - layout.petX,
    y: (point.y - content.y) * layout.height / content.height - layout.petY
  };
  return isFinitePoint(projected) ? projected : null;
}

function isSpritePoint(point, layout) {
  return isFinitePoint(point) &&
    point.x >= 0 && point.x < layout.petWidth && point.y >= 0 && point.y < layout.petHeight;
}

function anchorInWindow(point, content, windowBounds, layout) {
  return {
    x: content.x - windowBounds.x + (layout.petX + point.x) * content.width / layout.width,
    y: content.y - windowBounds.y + (layout.petY + point.y) * content.height / layout.height
  };
}

function opaqueBounds(bitmap, width, height) {
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bitmap[(y * width + x) * 4 + 3] < HIT_ALPHA) continue;
      left = Math.min(x, left); top = Math.min(y, top);
      right = Math.max(x + 1, right); bottom = Math.max(y + 1, bottom);
    }
  }
  return left < right && top < bottom ? { left, top, right, bottom } : null;
}

function nearOpaqueBounds(point, bounds, margin) {
  return !!point && !!bounds && point.x >= bounds.left - margin && point.x < bounds.right + margin &&
    point.y >= bounds.top - margin && point.y < bounds.bottom + margin;
}

module.exports = { HIT_ALPHA, isFinitePoint, isUsableRect, spritePoint, isSpritePoint, anchorInWindow, opaqueBounds, nearOpaqueBounds };
