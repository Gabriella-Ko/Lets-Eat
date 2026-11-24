// Unlocked scrapbook pages, saved per browser like the stars (localStorage).
// A page unlocks on the first win (1+ stars) of a level whose chat line tagged with its callback id the
// player read (Bug hunt run 2, WA-02, WA-03), and stays unlocked across levels and replays.

import { readSaved } from './safeStore.js';

const KEY = 'lets-eat-scrapbook-v1';
let memory = null; // fallback when storage is blocked, so pages still stick for this session

/** { <callback id>: <level id where it unlocked> } */
export function loadPages() {
  const saved = readSaved(KEY, 'object'); // a string, number or array counts as no pages
  if (saved) return saved;
  return { ...(memory || {}) };
}

/** Forget every unlocked page (Options > Reset progress). */
export function clearPages() {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: nothing saved to clear */
  }
}

// Pages unlocked but not yet announced by their "NEW SCRAPBOOK PAGE!" card (Bug hunt run 1, QT-03, WA-01).
// Saved, so leaving the level, reloading or going back to the map before the Outcome still gets the card
// on the next Outcome. A page leaves the list only once its card has shown.
const PENDING_KEY = 'lets-eat-pending-pages-v1';
let pendingMemory = null;

/** Page ids still waiting for their card, in unlock order. */
export function loadPending() {
  const saved = readSaved(PENDING_KEY, 'array');
  if (saved) return saved.filter((id) => typeof id === 'string');
  return [...(pendingMemory || [])];
}

function savePending(ids) {
  pendingMemory = ids;
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(ids));
  } catch {
    /* storage blocked: kept in memory for this session */
  }
}

/** Queue a page for its card (once). */
export function addPending(id) {
  const ids = loadPending();
  if (!ids.includes(id)) savePending([...ids, id]);
}

/** A page's card has shown: stop waiting for it. */
export function removePending(id) {
  const ids = loadPending();
  if (ids.includes(id)) savePending(ids.filter((x) => x !== id));
}

/** Forget every waiting card (Options > Reset progress). */
export function clearPending() {
  pendingMemory = null;
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage blocked: nothing saved to clear */
  }
}

// Pages whose callback line was read but not yet earned (Bug hunt run 2, WA-02, WA-03). Reading the line only
// remembers it here, per level; the page unlocks on the Outcome of a win (1+ stars) of that same level.
// Saved, so leaving the level or reloading before the win still counts (keeps WA-01 fixed).
const HEARD_KEY = 'lets-eat-heard-pages-v1';
let heardMemory = null;

function loadHeardAll() {
  const saved = readSaved(HEARD_KEY, 'object'); // a damaged value counts as nothing heard
  if (saved) return saved;
  return { ...(heardMemory || {}) };
}

function saveHeardAll(all) {
  heardMemory = all;
  try {
    localStorage.setItem(HEARD_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: kept in memory for this session */
  }
}

/** Page ids heard in this level's chat, waiting for its win. */
export function loadHeard(levelId) {
  const ids = loadHeardAll()[levelId];
  return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
}

/** The player read a callback line in this level's chat: remember the page (once). */
export function hearPage(id, levelId) {
  const all = loadHeardAll();
  const ids = loadHeard(levelId);
  if (ids.includes(id)) return;
  all[levelId] = [...ids, id];
  saveHeardAll(all);
}

/** Forget the pages heard in this level (called once the win has unlocked them). */
export function forgetHeard(levelId) {
  const all = loadHeardAll();
  if (!(levelId in all)) return;
  delete all[levelId];
  saveHeardAll(all);
}

/** Forget every heard page (Options > Reset progress). */
export function clearHeard() {
  heardMemory = null;
  try {
    localStorage.removeItem(HEARD_KEY);
  } catch {
    /* storage blocked: nothing saved to clear */
  }
}

/** Unlock a page. Returns true only the first time. */
export function unlockPage(id, levelId) {
  const pages = loadPages();
  if (id in pages) return false;
  pages[id] = levelId;
  memory = pages;
  addPending(id);
  try {
    localStorage.setItem(KEY, JSON.stringify(pages));
  } catch {
    /* storage blocked: kept in memory for this session */
  }
  return true;
}
