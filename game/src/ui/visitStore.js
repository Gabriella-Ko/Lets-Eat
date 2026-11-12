// Which venues the player has seen in search results, and picked, per level (localStorage, per browser).
// Powers the "been here before" badge on recurring venues (bible Guardrails: a recurring venue keeps its id).

const KEY = 'lets-eat-venues-v1';
let memory = null; // fallback when storage is blocked

/** { <venue id>: { seen: [level ids], picked: [level ids] } } */
export function loadVisits() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) return saved;
  } catch {
    /* storage blocked or corrupt */
  }
  return JSON.parse(JSON.stringify(memory || {}));
}

function save(visits) {
  memory = visits;
  try {
    localStorage.setItem(KEY, JSON.stringify(visits));
  } catch {
    /* kept in memory for this session */
  }
}

const add = (visits, venueId, kind, levelId) => {
  const v = (visits[venueId] ||= { seen: [], picked: [] });
  if (!v[kind].includes(levelId)) v[kind].push(levelId);
};

/** The player opened this level's search results: every venue in it counts as seen. */
export function recordSeen(levelId, venueIds) {
  const visits = loadVisits();
  for (const id of venueIds) add(visits, id, 'seen', levelId);
  save(visits);
}

/** The player recommended this venue in this level. */
export function recordPick(levelId, venueId) {
  const visits = loadVisits();
  add(visits, venueId, 'seen', levelId);
  add(visits, venueId, 'picked', levelId);
  save(visits);
}
