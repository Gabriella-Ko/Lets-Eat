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

if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log(`boot test passed: ${requested.length} level(s) loaded in order`);
