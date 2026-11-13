// Friends page: who the player has met and which permanent needs they have earned the right to see.
// Pure: no Phaser, so Node tests can run it too.

/** A friend's permanent needs (rules.json characters.<id>.permanent) as clue tags with a label. */
export function permanentNeeds(permanent = {}) {
  const needs = [];
  for (const a of permanent.allergies || []) needs.push({ tag: `allergy:${a}`, label: `Allergic to ${a.replace(/_/g, ' ')}` });
  for (const d of permanent.diets || []) needs.push({ tag: `diet:${d}`, label: `Eats ${d.replace(/_/g, ' ')}` });
  for (const i of permanent.intolerances || []) needs.push({ tag: `intolerance:${i}`, label: `Can't do ${i.replace(/_/g, ' ')}` });
  for (const v of permanent.vibe || []) needs.push({ tag: `vibe:${v}`, label: `Likes it ${v.replace(/_/g, ' ')}` });
  if (permanent.budget_max) needs.push({ tag: 'budget', label: 'Watches the budget', budget: true });
  return needs; // must-haves first, then nice-to-haves, then the budget
}

/** Budget for a chapter: budget_max_by_chapter overrides budget_max (rules.json _budget_note). */
const budgetFor = (permanent, chapter) => (permanent.budget_max_by_chapter || {})[chapter] || permanent.budget_max;

/**
 * @param {object[]} levels          level models (guests, chapter, script)
 * @param {object} characters        rules.json characters
 * @param {Record<string, number>} progress  best stars per level id
 * @param {string[]} opened          level ids the player has opened
 * @returns {{ id: string, met: boolean, needs: { label: string|null, known: boolean }[], noNeeds: boolean }[]}
 *   met: a guest in an opened level. A need is known only once the player has cleared (1+ stars) a level where
 *   the friend is a guest and the chat has a line tagged with it (the generic 'budget' tag must be the friend's
 *   own line). Unknown needs carry no label, so nothing leaks before the player has earned it. A friend with no
 *   permanent needs says so only after clearing one of their levels.
 */
export function friendCards(levels, characters, progress = {}, opened = []) {
  const openedSet = new Set(opened);
  return Object.entries(characters || {}).map(([id, ch]) => {
    const permanent = ch.permanent || {};
    const theirs = levels.filter((l) => (l.guests || []).includes(id));
    const met = theirs.some((l) => openedSet.has(l.id));
    const cleared = theirs.filter((l) => (progress[l.id] || 0) > 0);
    const needs = permanentNeeds(permanent).map((n) => {
      const proof = cleared.filter((l) => (l.script || []).some((line) => line.clue === n.tag && (!n.budget || line.speaker === id)));
      if (!met || !proof.length) return { label: null, known: false };
      if (n.budget) {
        const chapter = Math.max(...proof.map((l) => l.chapter));
        return { label: `Budget: ${budgetFor(permanent, chapter)} max`, known: true };
      }
      return { label: n.label, known: true };
    });
    const noNeeds = met && needs.length === 0 && cleared.length > 0;
    return { id, met, needs, noNeeds };
  });
}
