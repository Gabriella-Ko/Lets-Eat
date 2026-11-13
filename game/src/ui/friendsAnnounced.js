// Friends already announced with the "A new friend has joined!" card (localStorage, per browser), so each
// friend is welcomed once: the first time the player finishes a level they're in. Reset progress clears it.

const KEY = 'lets-eat-friends-announced-v1';
let memory = null; // fallback when storage is blocked

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(saved)) return saved;
  } catch {
    /* blocked or corrupt */
  }
  return [...(memory || [])];
}

/** The guests not announced yet, in the level's order. */
export function newFriends(guests) {
  const seen = new Set(load());
  return (guests || []).filter((g) => !seen.has(g));
}

/** Remember these friends as announced. */
export function markAnnounced(ids) {
  if (!ids.length) return;
  const all = [...new Set([...load(), ...ids])];
  memory = all;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* kept in memory for this session */
  }
}
