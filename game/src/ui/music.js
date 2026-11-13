// Background music (bible: Game identity > Audio). Plays only the tracks listed in the registry's
// credits.music, in a shuffled order (every track once before any repeats, a different first track each
// visit), at the player's volume. Tracks load one at a time when needed (the next one is fetched while the
// current one plays), so the game doesn't download every song at startup. The host is the always-on Hud
// scene. Browsers block autoplay, so nothing plays until the player's first click or key press.
// An empty list, or a file that fails to load, never breaks the game.

const KEY = 'lets-eat-music-v1';
const VOLUME_KEY = 'lets-eat-music-volume-v1';
const DEFAULT_VOLUME = 0.25;

let enabled = readEnabled();
let volume = readVolume();
let host = null; // the Hud scene: its loader and the game's sound manager outlive every other scene
let files = new Map(); // key -> file path
let tracks = []; // keys still playable
let order = []; // shuffled play order (keys)
let current = null;
let currentKey = null;
let unlocked = false;
let listening = false;
let pending = null; // key being loaded to play next
const volumeListeners = [];

export const musicKey = (file) => `music:${file}`;

function readEnabled() {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

function readVolume() {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    const v = Number(raw);
    return raw !== null && v >= 0 && v <= 1 ? v : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
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
  for (const fn of volumeListeners) fn(volume, enabled);
}

/** Music volume, 0 to 1. */
export function getVolume() {
  return volume;
}

/** Set the music volume (0 to 1); saved, and applied to the playing track at once. */
export function setVolume(v) {
  volume = Math.min(1, Math.max(0, Number(v) || 0));
  try {
    window.localStorage.setItem(VOLUME_KEY, String(Math.round(volume * 100) / 100));
  } catch {
    /* storage blocked: keep it for this visit only */
  }
  try {
    current?.setVolume(volume);
  } catch {
    /* already gone */
  }
  for (const fn of volumeListeners) fn(volume, enabled);
}

/** Call fn(volume, enabled) whenever either changes (keeps every music control in step). */
export function onVolume(fn) {
  volumeListeners.push(fn);
}

/** The key of the track playing now, or null (for tests and the Hud). */
export const nowPlaying = () => (current ? currentKey : null);

/** Start with the always-on host scene, once the registry holds 'credits'. Safe to call again. */
export function start(scene) {
  try {
    host = scene;
    const music = scene.registry.get('credits')?.music;
    files = new Map((Array.isArray(music) ? music : []).filter((m) => m?.file).map((m) => [musicKey(m.file), m.file]));
    tracks = [...files.keys()];
    order = order.filter((k) => files.has(k));
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

/** A fresh shuffle of every playable track, never starting with the one just played. */
function refill() {
  order = [...tracks];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length > 1 && order[0] === currentKey) order.push(order.shift());
}

/** The next track to play (refilling the shuffle once it's used up). */
function nextKey() {
  if (!order.length) refill();
  return order.shift();
}

/** Load a track if needed, then call done(ok). */
function ensureLoaded(key, done) {
  if (!host || !files.has(key)) return done(false);
  if (host.cache.audio.exists(key)) return done(true);
  const ok = () => { off(); done(true); };
  const fail = (file) => { if (file?.key !== key) return; off(); done(false); };
  const off = () => {
    host.load.off(`filecomplete-audio-${key}`, ok);
    host.load.off('loaderror', fail);
  };
  host.load.once(`filecomplete-audio-${key}`, ok);
  host.load.on('loaderror', fail);
  host.load.audio(key, files.get(key));
  if (!host.load.isLoading()) host.load.start();
}

function play() {
  if (!enabled || !unlocked || !host || !tracks.length || current || pending) return;
  const key = nextKey();
  if (!key) return;
  pending = key;
  ensureLoaded(key, (ok) => {
    pending = null;
    if (!ok) {
      // A file that won't load is dropped for this visit; try the next one.
      tracks = tracks.filter((k) => k !== key);
      return play();
    }
    if (!enabled || current) return;
    try {
      const sound = host.sound.add(key, { volume });
      current = sound;
      currentKey = key;
      sound.once('complete', () => {
        sound.destroy();
        if (current !== sound) return;
        current = null;
        play();
      });
      sound.play();
      // Fetch the following track now, so there's no gap when this one ends.
      if (!order.length) refill();
      const upcoming = order[0];
      if (upcoming && upcoming !== key) ensureLoaded(upcoming, () => {});
    } catch {
      current = null;
    }
  });
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
