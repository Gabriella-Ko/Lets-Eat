// Background music (bible: Game identity > Audio). Plays only the tracks listed in the
// registry's credits.music, in order, looping the list at a low volume. BootScene loads
// each listed file under musicKey(entry.file). Browsers block autoplay, so nothing plays
// until the player's first click or key press. An empty list does nothing.

const KEY = 'lets-eat-music-v1';
const VOLUME = 0.25;

let enabled = readEnabled();
let game = null; // Phaser game; its sound manager outlives every scene
let tracks = []; // audio cache keys that actually loaded
let index = 0;
let current = null;
let unlocked = false;
let listening = false;

export const musicKey = (file) => `music:${file}`;

function readEnabled() {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function isEnabled() {
  return enabled;
}

export function setEnabled(on) {
  enabled = !!on;
  try {
    window.localStorage.setItem(KEY, enabled ? 'on' : 'off');
  } catch {
    /* storage blocked: keep it for this visit only */
  }
  if (!enabled) stopCurrent();
  else play();
}

// Call once the registry holds 'credits' (BootScene does). Safe to call again.
export function start(scene) {
  try {
    game = scene.game;
    const music = scene.registry.get('credits')?.music;
    const list = Array.isArray(music) ? music : [];
    tracks = list.map((m) => m && m.file && musicKey(m.file)).filter((k) => k && scene.cache.audio.exists(k));
    if (!tracks.length || listening || unlocked) return;
    listening = true;
    window.addEventListener('pointerdown', onFirstInput, true);
    window.addEventListener('keydown', onFirstInput, true);
  } catch {
    /* music is optional; never break the game over it */
  }
}

function onFirstInput() {
  window.removeEventListener('pointerdown', onFirstInput, true);
  window.removeEventListener('keydown', onFirstInput, true);
  listening = false;
  unlocked = true;
  play();
}

function play() {
  if (!enabled || !unlocked || !game || !tracks.length || current) return;
  try {
    const key = tracks[index % tracks.length];
    const sound = game.sound.add(key, { volume: VOLUME });
    current = sound;
    sound.once('complete', () => {
      sound.destroy();
      if (current !== sound) return;
      current = null;
      index = (index + 1) % tracks.length;
      play();
    });
    sound.play();
  } catch {
    current = null;
  }
}

function stopCurrent() {
  if (!current) return;
  const sound = current;
  current = null;
  try {
    sound.stop();
    sound.destroy();
  } catch {
    /* already gone */
  }
}
