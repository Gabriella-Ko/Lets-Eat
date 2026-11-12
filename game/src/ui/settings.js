// Accessibility options, saved per browser (localStorage), applied across the game.
// Kept free of Phaser so theme.js can read it while building text styles.

const KEY = 'lets-eat-settings-v1';

const osReducedMotion = () => {
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export const OPTIONS = {
  textSize: [
    { id: 'normal', label: 'Normal', scale: 1 },
    { id: 'large', label: 'Large', scale: 1.2 },
  ],
  chatPace: [
    { id: 'quick', label: 'Quick', ms: 1000 }, // Gabriella's default, 2026-11-11
    { id: 'relaxed', label: 'Relaxed', ms: 2000 },
    { id: 'tap', label: 'Tap to continue', ms: null },
  ],
  contrast: [
    { id: 'normal', label: 'Off' },
    { id: 'high', label: 'On' },
  ],
  motion: [
    { id: 'full', label: 'Off' },
    { id: 'reduced', label: 'On' },
  ],
};

const defaults = () => ({ textSize: 'normal', chatPace: 'quick', contrast: 'normal', motion: osReducedMotion() ? 'reduced' : 'full' });

let memory = null; // fallback when storage is blocked
let cache = null;

export function getSettings() {
  if (cache) return cache;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY));
  } catch {
    /* blocked or corrupt */
  }
  const s = { ...defaults(), ...(memory || {}), ...(saved || {}) };
  // Drop values that no longer exist.
  for (const k of Object.keys(OPTIONS)) if (!OPTIONS[k].some((o) => o.id === s[k])) s[k] = defaults()[k];
  cache = s;
  return s;
}

export function setSetting(key, id) {
  const s = { ...getSettings(), [key]: id };
  cache = s;
  memory = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* kept in memory for this session */
  }
  return s;
}

const opt = (key) => OPTIONS[key].find((o) => o.id === getSettings()[key]);
export const textScale = () => opt('textSize').scale;
/** Milliseconds between chat messages, or null for tap-to-continue. */
export const chatPaceMs = () => opt('chatPace').ms;
export const highContrast = () => getSettings().contrast === 'high';
export const reduceMotion = () => getSettings().motion === 'reduced';
