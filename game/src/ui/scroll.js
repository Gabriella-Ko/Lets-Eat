/**
 * A masked, wheel-scrollable area. Add children to `.content` at y >= 0, then call `.setContentHeight(h)`.
 */
export function scrollArea(scene, x, y, w, h) {
  const content = scene.add.container(x, y);
  const maskShape = scene.make.graphics({}, false).fillStyle(0xffffff).fillRect(x, y, w, h);
  content.setMask(maskShape.createGeometryMask());

  let contentHeight = 0;
  let offset = 0;
  const listeners = [];
  const maxOffset = () => Math.max(0, contentHeight - h);
  const apply = () => {
    offset = Math.min(Math.max(offset, 0), maxOffset());
    content.y = y - offset;
    const fraction = maxOffset() ? offset / maxOffset() : 0;
    for (const fn of listeners) fn(fraction);
  };

  scene.input.on('wheel', (pointer, objs, dx, dy) => {
    if (pointer.x >= x && pointer.x <= x + w && pointer.y >= y && pointer.y <= y + h) {
      offset += dy * 0.6;
      apply();
    }
  });

  return {
    content,
    /** Call fn(fraction) whenever the view moves: 0 at the top, 1 scrolled to the bottom. */
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
