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
  }
  if (perfect !== 1) problems.push(`${id}: ${perfect} venues score 3 stars, expected exactly 1`);
  if (hardFail < 1) problems.push(`${id}: no hard-fail trap`);
  const solution = level.venues.find((v) => v.id === level.spec.solution_id);
  if (!solution || scorePick(level.spec, solution, rules).stars !== 3) problems.push(`${id}: the spec's solution does not score 3 stars`);
  if (!level.script.length) problems.push(`${id}: empty chat`);
  console.log(`${problems.length ? '…' : 'ok'} ${id}: ${level.venues.length} venues, ${level.script.length} messages`);
}

if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log(`boot test passed: ${requested.length} level(s) loaded in order`);
