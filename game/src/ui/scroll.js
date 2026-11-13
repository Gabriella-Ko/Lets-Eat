/** A press that moves less than this (px) counts as a click, not a drag. */
export const DRAG_THRESHOLD = 6;

/**
 * A masked scrollable area: mouse wheel, drag (mouse or touch) and `.scrollBy()` for keys.
 * Add children to `.content` at y >= 0, then call `.setContentHeight(h)`.
 */
export function scrollArea(scene, x, y, w, h) {
  const content = scene.add.container(x, y);
  const maskShape = scene.make.graphics({}, false).fillStyle(0xffffff).fillRect(x, y, w, h);
  content.setMask(maskShape.createGeometryMask());

  let contentHeight = 0;
  let offset = 0;
  const listeners = [];
  const maxOffset = () => Math.max(0, contentHeight - h);
  /** byUser: true when the player scrolled (wheel, drag, scrollBy), false for code-driven moves. */
  const apply = (byUser = false) => {
    offset = Math.min(Math.max(offset, 0), maxOffset());
    content.y = y - offset;
    const fraction = maxOffset() ? offset / maxOffset() : 0;
    for (const fn of listeners) fn(fraction, byUser);
  };

  const inside = (p) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;

  scene.input.on('wheel', (pointer, objs, dx, dy) => {
    if (inside(pointer)) {
      offset += dy * 0.6;
      apply(true);
    }
  });

  // Drag to scroll. It only starts once the press has moved DRAG_THRESHOLD px, so taps stay taps.
  let drag = null;
  scene.input.on('pointerdown', (p) => {
    drag = inside(p) ? { startY: p.y, startOffset: offset, active: false } : null;
  });
  scene.input.on('pointermove', (p) => {
    if (!drag || !p.isDown) return;
    if (!drag.active && Math.abs(p.y - drag.startY) < DRAG_THRESHOLD) return;
    drag.active = true;
    offset = drag.startOffset - (p.y - drag.startY);
    apply(true);
  });
  scene.input.on('pointerup', () => {
    drag = null;
  });

  return {
    content,
    /** Scroll by dy px (positive = down). */
    scrollBy(dy) {
      offset += dy;
      apply(true);
    },
    /** Scroll by dy px on the game's own account (auto-scrolling): listeners get byUser = false. */
    drift(dy) {
      offset += dy;
      apply(false);
    },
    /** Back to the top on the game's own account. */
    toTop() {
      offset = 0;
      apply(false);
    },
    /** Visible height, for page-sized key scrolling. */
    viewHeight: h,
    /** Call fn(fraction, byUser) whenever the view moves: fraction 0 at the top, 1 scrolled to the bottom. */
    onScroll(fn) {
      listeners.push(fn);
    },
    setContentHeight(hgt) {
      contentHeight = hgt;
      apply();
    },
    scrollToBottom() {
      offset = maxOffset();
      apply();
    },
    /** True when the view shows the end of the content (or everything fits). */
    atBottom() {
      return offset >= maxOffset() - 4;
    },
    /** Scroll so content-space y sits near the top third of the view. */
    scrollTo(cy) {
      offset = cy - h / 3;
      apply();
    },
  };
}
