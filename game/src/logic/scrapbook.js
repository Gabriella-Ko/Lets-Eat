// Scrapbook (bible: Callbacks, Scrapbook). Pure helpers: no Phaser, no DOM, so Node tests can use them.
// Page data comes from scripts/rules.json "callbacks", which mirrors the bible's Callbacks table.

/** Callbacks in the order the campaign introduces them (by first_level). */
export function scrapbookPages(rules) {
  return Object.entries(rules.callbacks || {})
    .map(([id, cb]) => ({ id, ...cb }))
    .sort((a, b) => a.first_level.localeCompare(b.first_level));
}

/** Page text, plus any page_from_chapter lines for chapters the player has reached. */
export function pageText(page, reachedChapter) {
  const extra = Object.entries(page.page_from_chapter || {})
    .filter(([ch]) => reachedChapter >= Number(ch))
    .map(([, line]) => line);
  return [page.page, ...extra];
}

/** Callback ids a level's chat can unlock, in chat order. */
export function callbacksIn(script) {
  return [...new Set(script.map((l) => l.callback).filter(Boolean))];
}
