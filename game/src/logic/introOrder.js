/**
 * Which intros show before a level's chat starts, in order (pure, shared with tests).
 * The chapter card comes first, then How to play (level 1 only) (Gabriella, 2026-11-13).
 * @param {number} levelNumber the level's number in the campaign (1 = level_01)
 * @param {{ howToPlay: boolean, chapter: boolean }} seen which intros the player has already seen
 * @returns {Array<'chapter'|'howToPlay'>}
 */
export function introSteps(levelNumber, seen = {}) {
  const steps = [];
  if (!seen.chapter) steps.push('chapter');
  if (levelNumber === 1 && !seen.howToPlay) steps.push('howToPlay');
  return steps;
}
