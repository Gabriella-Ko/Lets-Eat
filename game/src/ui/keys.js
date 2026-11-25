/**
 * Keyboard listeners that act once per key press (bug hunt run 1, SF-03).
 * Phaser can hand the same native keydown to a listener twice when keys come quickly (same frame),
 * so six quick ↓ used to skip rows and ↑ then → could change the wrong row. Each listener here
 * remembers the last native event it acted on and ignores a repeat of it.
 * While the volume panel is open (registry 'hudPanelOpen') the key is ignored, unless { panel: true }
 * (the Hud itself, which owns those keys).
 *
 * onKey(scene, name, fn, { panel }) registers keydown-<name> and returns a function that removes it.
 */
export function onKey(scene, name, fn, { panel = false } = {}) {
  const kb = scene.input?.keyboard;
  if (!kb) return () => {};
  const event = `keydown-${name}`;
  let last = null;
  const handler = (e) => {
    if (e && e === last) return;
    if (!panel && scene.registry.get('hudPanelOpen')) return;
    last = e ?? null;
    fn(e);
  };
  kb.on(event, handler);
  return () => kb.off(event, handler);
}
