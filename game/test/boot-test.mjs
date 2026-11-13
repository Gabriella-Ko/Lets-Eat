// Boot test for scripts/integrate.js (check 5).
// Contract: loads the levels listed in LETS_EAT_LEVELS (comma-separated, in order) through the same
// loader and scoring code the game uses, and exits 1 on any problem.
//
// Prototype limit: this runs the game's data and scoring layer in Node, not the Phaser canvas.
// A real headless-browser boot (Playwright) is a later step; see game/CLAUDE.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLevels } from '../src/logic/levels.js';
import { scorePick } from '../src/logic/scoring.js';
import { recapRows } from '../src/logic/recap.js';
import { pastVisit } from '../src/logic/beenHere.js';
import { filterOptions, applyView } from '../src/logic/resultsView.js';
import { starTotals } from '../src/logic/progress.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const rules = readJson(path.join(ROOT, 'scripts', 'rules.json'));
const files = {};
const levelsDir = path.join(ROOT, 'content', 'levels');
for (const dir of fs.readdirSync(levelsDir)) {
  for (const f of fs.readdirSync(path.join(levelsDir, dir))) {
    if (f.endsWith('.json')) files[`${dir}/${f}`] = readJson(path.join(levelsDir, dir, f));
  }
}
const regDir = path.join(ROOT, 'content', 'registry');
const registries = fs.readdirSync(regDir).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(regDir, f)));

const { levels, problems: loadProblems } = buildLevels(files, registries);
const byId = new Map(levels.map((l) => [l.id, l]));
const requested = (process.env.LETS_EAT_LEVELS || levels.map((l) => l.id).join(','))
  .split(',').map((s) => s.trim()).filter(Boolean);

const problems = [];
for (const id of requested) {
  const level = byId.get(id);
  if (!level) {
    const why = loadProblems.find((p) => p.startsWith(`${id}:`));
    problems.push(why || `${id}: could not be loaded`);
    continue;
  }
  let perfect = 0;
  let hardFail = 0;
  for (const venue of level.venues) {
    const score = scorePick(level.spec, venue, rules);
    if (score.stars === 3) perfect++;
    if (score.stars === 0) hardFail++;
    const outcome = level.outcomes[venue.id];
    if (!outcome) { problems.push(`${id}: no outcome for "${venue.id}"`); continue; }
    if (outcome.result !== score.result) {
      problems.push(`${id}: "${venue.id}" scores ${score.stars} star(s) (${score.result}) but its outcome says "${outcome.result}"`);
    }
    const a = [...outcome.missed].sort().join(',');
    const b = [...score.missed].sort().join(',');
    if (a !== b) problems.push(`${id}: "${venue.id}" misses [${b}] in the game but [${a}] in its outcome`);
    if (!outcome.lines || !outcome.lines.length) problems.push(`${id}: "${venue.id}" has no reaction lines`);
    // Clue recap: every row points at a chat line, and its ✓/✗ agrees with the score.
    const rows = recapRows(level, score);
    if (!rows.length) problems.push(`${id}: "${venue.id}" clue recap is empty`);
    for (const r of rows) {
      if (!r.lines.length) problems.push(`${id}: clue recap for "${r.tag}" finds no chat line tagged with it`);
      if (r.met === score.missed.includes(r.tag)) problems.push(`${id}: "${venue.id}" recap marks "${r.tag}" ${r.met ? 'met' : 'missed'}, scoring disagrees`);
    }
    if (score.result === 'fail' && rows.some((r) => r.met)) problems.push(`${id}: "${venue.id}" fail recap shows needs beyond the broken one`);
  }
  if (perfect !== 1) problems.push(`${id}: ${perfect} venues score 3 stars, expected exactly 1`);
  if (hardFail < 1) problems.push(`${id}: no hard-fail trap`);
  const solution = level.venues.find((v) => v.id === level.spec.solution_id);
  if (!solution || scorePick(level.spec, solution, rules).stars !== 3) problems.push(`${id}: the spec's solution does not score 3 stars`);
  if (!level.script.length) problems.push(`${id}: empty chat`);
  console.log(`${problems.length ? '…' : 'ok'} ${id}: ${level.venues.length} venues, ${level.script.length} messages`);
}

// Sort and filter on the restaurant list (logic/resultsView.js), for every level.
{
  const TIERS = ['$', '$$', '$$$'];
  for (const l of levels) {
    const vs = l.venues;
    const ids = (a) => a.map((v) => v.id).join(',');
    if (ids(applyView(vs, { sort: 'mixed' })) !== ids(vs)) problems.push(`${l.id}: "Mixed" sort changes the order`);
    const byPrice = applyView(vs, { sort: 'price' });
    if (byPrice.some((v, i) => i && TIERS.indexOf(v.price_tier) < TIERS.indexOf(byPrice[i - 1].price_tier))) problems.push(`${l.id}: "Cheapest" isn't in price order`);
    const byName = applyView(vs, { sort: 'name' });
    if (byName.some((v, i) => i && v.name.localeCompare(byName[i - 1].name) < 0)) problems.push(`${l.id}: "A–Z" isn't alphabetical`);
    const opts = filterOptions(vs);
    for (const p of opts.prices) {
      const got = applyView(vs, { prices: [p] });
      if (!got.length || got.some((v) => v.price_tier !== p)) problems.push(`${l.id}: price filter "${p}" keeps the wrong places`);
    }
    for (const c of opts.cuisines) {
      const got = applyView(vs, { cuisines: [c] });
      if (!got.length || got.some((v) => v.cuisine !== c)) problems.push(`${l.id}: cuisine filter "${c}" keeps the wrong places`);
    }
    const all = applyView(vs, { prices: opts.prices, cuisines: opts.cuisines, sort: 'name' });
    if (all.length !== vs.length || new Set(all.map((v) => v.id)).size !== vs.length) problems.push(`${l.id}: selecting every filter doesn't show every place exactly once`);
    if (Object.keys(opts).some((k) => !['prices', 'cuisines'].includes(k))) problems.push(`${l.id}: list filters offer a field the cards don't show`);
  }
}

// "Been here before" (logic/beenHere.js): only earlier levels count, and never a past score.
// Uses every venue that recurs across the loaded levels, with a made-up play history.
{
  const appearances = new Map();
  for (const l of levels) for (const v of l.venues) appearances.set(v.id, [...(appearances.get(v.id) || []), l]);
  for (const [vid, ls] of appearances) {
    if (ls.length < 2) continue;
    const [first, second] = ls;
    const visits = { [vid]: { seen: ls.map((l) => l.id), picked: [first.id] } };
    const atFirst = pastVisit(visits, levels, vid, first.number);
    const atSecond = pastVisit(visits, levels, vid, second.number);
    if (atFirst) problems.push(`been here: "${vid}" shows a badge in ${first.id}, its first appearance`);
    if (!atSecond || atSecond.kind !== 'been' || atSecond.last.number !== first.number) problems.push(`been here: "${vid}" in ${second.id} should point back to ${first.id} as BEEN HERE`);
    else if (JSON.stringify(atSecond.last.reviews) !== JSON.stringify(first.venues.find((v) => v.id === vid).reviews)) problems.push(`been here: "${vid}" shows the wrong level's reviews`);
    if (atSecond && Object.keys(atSecond).some((k) => /star|score|result/i.test(k))) problems.push(`been here: "${vid}" exposes a past score`);
    const seenOnly = pastVisit({ [vid]: { seen: [first.id], picked: [] } }, levels, vid, second.number);
    if (seenOnly?.kind !== 'seen') problems.push(`been here: "${vid}" seen but never picked should be SEEN BEFORE`);
  }
}

// Star totals (logic/progress.js): only built levels count, 3 stars each, best stars clamped to 0-3.
{
  const none = starTotals(levels, {});
  if (none.earned !== 0 || none.max !== levels.length * 3) problems.push(`star totals: empty progress gives ${none.earned} / ${none.max}, expected 0 / ${levels.length * 3}`);
  const full = starTotals(levels, Object.fromEntries(levels.map((l) => [l.id, 3])));
  if (full.earned !== full.max) problems.push('star totals: all 3-star progress is not full marks');
  for (const [c, t] of Object.entries(full.byChapter)) {
    const built = levels.filter((l) => String(l.chapter) === c).length;
    if (t.max !== built * 3 || !t.perfect) problems.push(`star totals: chapter ${c} should be ${built * 3} max and perfect`);
  }
  if (levels.length > 1) {
    const [first] = levels;
    const one = starTotals(levels, { [first.id]: 2, unbuilt_level: 3, [levels[levels.length - 1].id]: 9 });
    const expect = 2 + 3;
    if (one.earned !== expect) problems.push(`star totals: expected ${expect} earned (unbuilt ignored, best clamped to 3), got ${one.earned}`);
    if (one.byChapter[first.chapter].perfect) problems.push(`star totals: chapter ${first.chapter} marked perfect with a 2-star level`);
    const sum = Object.values(one.byChapter).reduce((n, t) => n + t.earned, 0);
    if (sum !== one.earned) problems.push('star totals: chapter totals don\'t add up to the campaign total');
  }
}

if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log(`boot test passed: ${requested.length} level(s) loaded in order`);
