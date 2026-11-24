// Reads saved JSON from localStorage only when it has the expected shape (Bug hunt run 2, QT-05, QT-06).
// A damaged save (a string, a number, the wrong kind of value) counts as nothing saved, so it can't freeze a screen.

/**
 * The parsed value under `key` if it is a plain object (`kind` 'object', arrays excluded)
 * or an array (`kind` 'array'); otherwise null. Never throws (storage blocked, bad JSON, missing key).
 */
export function readSaved(key, kind) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (kind === 'array') return Array.isArray(value) ? value : null;
    if (kind === 'object') {
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
    }
  } catch {
    /* storage blocked or corrupt */
  }
  return null;
}
