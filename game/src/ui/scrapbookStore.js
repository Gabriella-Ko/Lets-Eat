// Unlocked scrapbook pages, saved per browser like the stars (localStorage).
// Bible: a page unlocks the first time the player reads a line tagged with its callback id,
// and stays unlocked across levels and replays.

const KEY = 'lets-eat-scrapbook-v1';
let memory = null; // fallback when storage is blocked, so pages still stick for this session

/** { <callback id>: <level id where it unlocked> } */
export function loadPages() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) return saved;
  } catch {
    /* storage blocked or corrupt */
  }
  return { ...(memory || {}) };
}

/** Unlock a page. Returns true only the first time. */
export function unlockPage(id, levelId) {
  const pages = loadPages();
  if (id in pages) return false;
  pages[id] = levelId;
  memory = pages;
  try {
    localStorage.setItem(KEY, JSON.stringify(pages));
  } catch {
    /* storage blocked: kept in memory for this session */
  }
  return true;
}
