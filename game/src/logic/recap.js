// Clue recap for the Outcome screen: each scored need of the level, whether the pick met it,
// and the chat line(s) that gave it away. Pure: no Phaser, so Node tests can run it too.

/** Every scored need in a spec, as clue tags (the strings dialogue lines carry in `clue`). */
export function scoredTags(spec) {
  const tags = [];
  for (const a of spec.hard.allergies) tags.push(`allergy:${a}`);
  for (const d of spec.hard.diets) tags.push(`diet:${d}`);
  if (spec.hard.budget_max) tags.push('budget');
  if (spec.soft.craving) tags.push('craving');
  for (const v of spec.soft.vibe) tags.push(`vibe:${v}`);
  for (const i of spec.soft.intolerances) tags.push(`intolerance:${i}`);
  return tags;
}

/**
 * @param {object} level  level model (spec, script)
 * @param {object} score  result of scorePick
 * @returns {{ tag: string, met: boolean, kind: 'must-have'|'limit'|'nice-to-have', lines: { index: number, line: object }[] }[]}
 *   kind: allergies and diets are must-haves; the budget is a limit (1 tier over costs a star, 2+ fails);
 *   craving, vibes and intolerances are nice-to-haves.
 *   After a fail only the broken needs are listed (the hint already names them), so a retry isn't handed
 *   the whole answer. After a cleared level every need is listed, missed ones first.
 */
export function recapRows(level, score) {
  const missed = new Set(score.missed);
  const kindOf = (tag) => (tag === 'budget' ? 'limit' : /^(allergy|diet):/.test(tag) ? 'must-have' : 'nice-to-have');
  let tags = scoredTags(level.spec);
  if (score.result === 'fail') tags = tags.filter((t) => missed.has(t));
  const rows = tags.map((tag) => ({
    tag,
    met: !missed.has(tag),
    kind: kindOf(tag),
    lines: level.script.map((line, index) => ({ index, line })).filter((x) => x.line.clue === tag),
  }));
  return [...rows.filter((r) => !r.met), ...rows.filter((r) => r.met)];
}
