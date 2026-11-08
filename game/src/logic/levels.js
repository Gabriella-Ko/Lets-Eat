// Turns the raw content files into one playable level model.
// Pure: the browser feeds it bundled JSON (src/content.js), the Node boot test feeds it files from disk.

/**
 * @param {Record<string, object>} files    path -> parsed JSON, paths ending in e.g. "level_03/spec_level_03.json"
 * @param {object[]} registries              parsed venue_registry_<district>.json files
 * @returns {{ levels: object[], problems: string[] }}  levels sorted by id; problems explain any level that was skipped
 */
export function buildLevels(files, registries) {
  const venueIndex = new Map();
  for (const reg of registries) for (const v of reg.venues) venueIndex.set(v.id, { ...v, district: reg.district });

  const byLevel = new Map();
  for (const [path, data] of Object.entries(files)) {
    const m = path.match(/(spec|dialogue|outcomes|venues)_(level_\d\d)\.json$/);
    if (!m) continue;
    const [, type, id] = m;
    if (!byLevel.has(id)) byLevel.set(id, {});
    byLevel.get(id)[type] = data;
  }

  const levels = [];
  const problems = [];
  for (const id of [...byLevel.keys()].sort()) {
    const f = byLevel.get(id);
    const missingFiles = ['spec', 'dialogue', 'outcomes', 'venues'].filter((t) => !f[t]);
    if (missingFiles.length) {
      problems.push(`${id}: skipped, missing ${missingFiles.join(', ')}`);
      continue;
    }
    const venues = [];
    for (const v of f.venues.venues) {
      const entry = venueIndex.get(v.id);
      if (!entry) {
        problems.push(`${id}: venue "${v.id}" is not in any registry`);
        continue;
      }
      venues.push({ ...entry, reviews: v.reviews || [] });
    }
    if (venues.length !== f.venues.venues.length) continue;

    levels.push({
      id,
      number: Number(id.slice(-2)),
      chapter: f.spec.chapter,
      district: f.spec.district,
      guests: f.spec.guests,
      spec: f.spec,
      script: f.dialogue.script,
      outcomes: f.outcomes.by_venue,
      venues,
    });
  }
  return { levels, problems };
}
