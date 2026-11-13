// Which levels the player has opened (localStorage, per browser). Powers "met" on the Friends page.

const KEY = 'lets-eat-opened-v1';
let memory = []; // fallback when storage is blocked

/** Level ids the player has opened, in the order first opened. */
export function loadOpened() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(saved)) return saved;
  } catch {
    /* storage blocked or corrupt */
  }
  return [...memory];
}

/** The player opened this level's chat. */
export function recordOpened(levelId) {
  const opened = loadOpened();
  if (opened.includes(levelId)) return;
  opened.push(levelId);
  memory = opened;
  try {
    localStorage.setItem(KEY, JSON.stringify(opened));
  } catch {
    /* kept in memory for this session */
  }
}

/** Forget every opened level (Options > Reset progress). */
export function clearOpened() {
  memory = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: nothing saved to clear */
  }
}
