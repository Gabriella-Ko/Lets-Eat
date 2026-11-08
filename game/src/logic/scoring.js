// Scoring, as the bible's "Scoring rules" section defines it.
// Pure functions: no Phaser, no DOM, so the Node boot test can run them too.
// Tag mapping and thresholds come from scripts/rules.json, the same file the Validator uses,
// so the game and the Validator can never disagree about what a venue can serve.

const TIERS = ['$', '$$', '$$$'];

/**
 * Score one pick.
 * @param {object} spec   the level spec (hard + soft constraints)
 * @param {object} venue  the venue's registry entry
 * @param {object} rules  scripts/rules.json
 * @returns {{ stars: number, result: 'perfect'|'partial'|'fail', hardMisses: string[], softMisses: string[], missed: string[] }}
 *   hardMisses / softMisses use the spec's `fails_on` strings (allergy:peanut, budget_soft, vibe:quiet ...).
 *   missed uses the clue-tag strings the outcomes and dialogue files use (budget instead of budget_soft/hard).
 */
export function scorePick(spec, venue, rules) {
  const tagMap = rules.dietary_tags;
  const serves = (kind, tag) => (tagMap[kind][tag] || []).some((t) => venue.dietary_tags.includes(t));
  const hardMisses = [];
  const softMisses = [];

  // 1. Hard check: allergies, strict diets, 2+ tiers over budget.
  for (const a of spec.hard.allergies) if (!serves('allergy', a)) hardMisses.push(`allergy:${a}`);
  for (const d of spec.hard.diets) if (!serves('diet', d)) hardMisses.push(`diet:${d}`);
  if (spec.hard.budget_max) {
    const over = TIERS.indexOf(venue.price_tier) - TIERS.indexOf(spec.hard.budget_max);
    if (over >= rules.scoring.budget_hard_tiers_over) hardMisses.push('budget_hard');
    else if (over >= rules.scoring.budget_soft_tiers_over) softMisses.push('budget_soft');
  }

  // 3. Soft misses: craving, each vibe, each intolerance (budget_soft added above).
  if (spec.soft.craving && venue.cuisine !== spec.soft.craving) softMisses.push('craving');
  for (const v of spec.soft.vibe) if (!venue.vibe_tags.includes(v)) softMisses.push(`vibe:${v}`);
  for (const i of spec.soft.intolerances) if (!serves('intolerance', i)) softMisses.push(`intolerance:${i}`);

  if (hardMisses.length) {
    return { stars: 0, result: 'fail', hardMisses, softMisses, missed: hardMisses.map(toClueTag) };
  }
  // 2 + 4. Start at 3, lose one per soft miss, never below 1.
  const stars = Math.max(rules.scoring.floor_stars, rules.scoring.start_stars - softMisses.length);
  return {
    stars,
    result: stars === rules.scoring.start_stars ? 'perfect' : 'partial',
    hardMisses,
    softMisses,
    missed: softMisses.map(toClueTag),
  };
}

/** fails_on string -> clue tag string (bible naming rules: budget lines use `budget`). */
export function toClueTag(failsOn) {
  return failsOn === 'budget_soft' || failsOn === 'budget_hard' ? 'budget' : failsOn;
}

/** Player-facing name for a constraint, used in hints and the Notebook. */
export function describeTag(tag) {
  if (!tag) return '';
  const [kind, value] = tag.split(':');
  const pretty = (s) => s.replace(/_/g, ' ');
  switch (kind) {
    case 'craving': return "Today's craving";
    case 'budget':
    case 'budget_soft':
    case 'budget_hard': return 'Budget';
    case 'allergy': return `Allergy: ${pretty(value)}`;
    case 'diet': return `Diet: ${pretty(value)}`;
    case 'intolerance': return `Intolerance: ${pretty(value)}`;
    case 'vibe': return `Vibe: ${pretty(value)}`;
    default: return pretty(tag);
  }
}
