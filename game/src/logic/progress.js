// Star totals (bible: Scoring rules, 0-3 stars a level; Campaign structure, 4 chapters of 5 levels).
// Pure: no Phaser, shared with the Node boot test.

export const MAX_STARS = 3;

/**
 * Totals per chapter and for the campaign. Counts only built levels (the ones passed in),
 * each worth MAX_STARS, and each level's best stars from `progress` ({ <level_id>: stars }).
 * `perfect` is true for a chapter where every built level has 3 stars.
 * @returns {{ byChapter: Object<string, { earned: number, max: number, perfect: boolean }>, earned: number, max: number }}
 */
export function starTotals(levels, progress) {
  const byChapter = {};
  let earned = 0;
  let max = 0;
  for (const lvl of levels || []) {
    const raw = Number((progress || {})[lvl.id]) || 0;
    const best = Math.max(0, Math.min(MAX_STARS, Math.floor(raw)));
    const c = (byChapter[lvl.chapter] ||= { earned: 0, max: 0, perfect: true });
    c.earned += best;
    c.max += MAX_STARS;
    if (best < MAX_STARS) c.perfect = false;
    earned += best;
    max += MAX_STARS;
  }
  return { byChapter, earned, max };
}
