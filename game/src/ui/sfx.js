// Sound effects (bible: Sound effects, Gabriella 2026-11-23). Files live in public/sfx/ (a copy of assets/sfx/
// made by npm run sync-assets) and are loaded by BootScene under `sfx:<file>`. Effects follow the Music volume
// and On/Off setting (src/ui/music.js); nothing plays before the player's first click or key press. Where a
// row lists two files, one is picked at random each time. A file that failed to load is skipped silently.
// The bible's Open rows (chat message appears, pick a venue, level unlocked on map) stay silent.
import { getVolume, isEnabled } from './music.js';

export const SFX = {
  click: ['floraphonic-multi-pop-2-188167.mp3'],
  outcome_perfect: ['freesound_community-success-1-6297.mp3'],
  outcome_partial: ['benkirb-shine-8-268901.mp3', 'benkirb-shine-7-268909.mp3'],
  outcome_fail: ['mori_sound-fx-error-piano-514787.mp3', 'mori_sound-fx-loose-cartoon-521523.mp3'],
  star: ['benkirb-shine-6-268910.mp3', 'benkirb-shine-11-268907.mp3'],
  page_unlocked: ['universfield-bright-notifications-151766.mp3'],
  page_turn: ['floraphonic-newspaper-foley-15-196732.mp3'],
  badge_stuck: ['vadim_makes_sound-achievement-badge-pop-sound-1-547860.mp3'],
};

export const sfxKey = (file) => `sfx:${file}`;

/** Every sound file, once (for BootScene to load). */
export const sfxFiles = () => [...new Set(Object.values(SFX).flat())];

let unlocked = false;
let queue = [];
let flushing = false;
let host = null;

function onFirstInput() {
  unlocked = true;
  window.removeEventListener('pointerdown', onFirstInput, true);
  window.removeEventListener('keydown', onFirstInput, true);
}
try {
  window.addEventListener('pointerdown', onFirstInput, true);
  window.addEventListener('keydown', onFirstInput, true);
} catch {
  /* no window (Node tests): stay silent */
}

/** Load every effect through a scene's loader (BootScene, before its load starts). */
export function loadSfx(scene) {
  for (const file of sfxFiles()) scene.load.audio(sfxKey(file), `sfx/${file}`);
}

/**
 * Play the sound for an event. Sounds asked for during one action are played together at the end of it:
 * the same event only once, and a 'click' is dropped when the action also made another sound (a button
 * that turns a page plays only page_turn).
 */
export function play(scene, event) {
  try {
    if (!SFX[event] || !unlocked || !isEnabled() || getVolume() <= 0) return;
    host = scene?.sound ? scene : host;
    queue.push(event);
    if (flushing) return;
    flushing = true;
    setTimeout(flush, 0);
  } catch {
    /* sound is optional; never break the game over it */
  }
}

function flush() {
  flushing = false;
  let events = [...new Set(queue)];
  queue = [];
  if (events.length > 1) events = events.filter((e) => e !== 'click');
  for (const e of events) playNow(e);
}

function playNow(event) {
  try {
    const sound = host?.sound;
    if (!sound || sound.locked) return;
    const files = SFX[event].filter((f) => host.cache.audio.exists(sfxKey(f)));
    if (!files.length) return; // failed to load: skip silently
    const file = files[Math.floor(Math.random() * files.length)];
    sound.play(sfxKey(file), { volume: getVolume() });
  } catch {
    /* sound is optional; never break the game over it */
  }
}
