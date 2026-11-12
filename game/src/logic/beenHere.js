// "Been here before": what the player already knows about a recurring venue from EARLIER levels.
// Pure (no Phaser, no storage) so Node tests can use it.
//
// Never reports how an earlier pick scored: a venue can be a decoy in one level and the answer in another
// (Koi Counter: decoy in level_06, answer in level_08), so a past result would steer the player.
// Only earlier levels count, so replaying an old level never shows reviews written for a later one.

/**
 * @param {object} visits   loadVisits() result
 * @param {object[]} levels level models (id, number, venues with reviews)
 * @param {string} venueId
 * @param {number} currentNumber the level being played
 * @returns {null | { kind: 'been'|'seen', last: { number, reviews }, pickedIn: number[] }}
 *   kind 'been' when the player picked it in an earlier level, 'seen' when it was only in the results.
 *   last = the most recent earlier level they saw it in, with that level's reviews.
 */
export function pastVisit(visits, levels, venueId, currentNumber) {
  const v = visits[venueId];
  if (!v) return null;
  const num = (id) => levels.find((l) => l.id === id)?.number;
  const earlier = (ids) => ids.map(num).filter((n) => n !== undefined && n < currentNumber).sort((a, b) => a - b);
  const seenIn = earlier(v.seen || []);
  if (!seenIn.length) return null;
  const pickedIn = earlier(v.picked || []);
  const lastNum = seenIn[seenIn.length - 1];
  const lastLevel = levels.find((l) => l.number === lastNum);
  const reviews = lastLevel?.venues.find((x) => x.id === venueId)?.reviews || [];
  return { kind: pickedIn.length ? 'been' : 'seen', last: { number: lastNum, reviews }, pickedIn };
}
