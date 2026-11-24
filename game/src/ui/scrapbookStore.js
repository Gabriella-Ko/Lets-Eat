// Unlocked scrapbook pages, saved per browser like the stars (localStorage).
// Bible: a page unlocks the first time the player reads a line tagged with its callback id,
// and stays unlocked across levels and replays.

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
