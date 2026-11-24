// One screen change at a time (bible: Bug hunt run 1, SC-01, SC-02).
// Phaser's scene.start() only queues the switch, so two inputs in the same
// frame (or a key pressed while the switch is under way) used to start two
// screens, and the thrown-away one could use up one-time cards.
// goScene() starts the new screen on the first call from a scene instance and
// ignores every later call until that instance shuts down. Phaser reuses scene
// objects, so the guard is cleared on shutdown, ready for the next visit.

const SWITCHING = '__letsEatSwitching';

export function goScene(scene, key, data) {
  if (!scene || scene[SWITCHING]) return false;
  scene[SWITCHING] = true;
  scene.events.once('shutdown', () => { scene[SWITCHING] = false; });
  scene.scene.start(key, data);
  return true;
}

// True while this scene instance has already asked for a screen change.
export function isSwitching(scene) {
  return !!scene?.[SWITCHING];
}
