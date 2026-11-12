// Sorting and filtering the restaurant list. Pure (no Phaser), so the Node boot test can use it.
// Only uses what the cards already show (name, cuisine, price tier), so it can never reveal the hidden
// dietary or vibe tags (bible: Constraint vocabulary, venue cards).

const TIERS = ['$', '$$', '$$$'];

export const SORTS = [
  { id: 'mixed', label: 'Mixed' }, // the level's fixed shuffle, so the answer isn't always on top
  { id: 'price', label: 'Cheapest' },
  { id: 'name', label: 'A–Z' },
];

/** Price tiers and cuisines present in a level, in a stable order. */
export function filterOptions(venues) {
  const prices = TIERS.filter((t) => venues.some((v) => v.price_tier === t));
  const cuisines = [...new Set(venues.map((v) => v.cuisine))].sort();
  return { prices, cuisines };
}

/**
 * @param {object[]} venues  in the level's mixed order
 * @param {{sort?: string, prices?: string[], cuisines?: string[]}} view  empty lists mean "all"
 * @returns {object[]} the venues to show, in order (sorts are stable, so ties keep the mixed order)
 */
export function applyView(venues, view = {}) {
  const prices = view.prices || [];
  const cuisines = view.cuisines || [];
  const kept = venues.filter((v) => (!prices.length || prices.includes(v.price_tier)) && (!cuisines.length || cuisines.includes(v.cuisine)));
  const indexed = kept.map((v, i) => ({ v, i }));
  if (view.sort === 'price') indexed.sort((a, b) => TIERS.indexOf(a.v.price_tier) - TIERS.indexOf(b.v.price_tier) || a.i - b.i);
  else if (view.sort === 'name') indexed.sort((a, b) => a.v.name.localeCompare(b.v.name) || a.i - b.i);
  return indexed.map((x) => x.v);
}
