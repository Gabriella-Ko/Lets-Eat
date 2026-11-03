#!/usr/bin/env node
// Let's Eat! Validator · brief v1 · agent id: validator
// Spec: docs/specs/validator.md. Rules: scripts/rules.json (from docs/game_bible.md).
//
// Usage: node scripts/validate.js level_XX
// Writes logs/validation_level_XX.log. Exit 0 = PASS, 1 = FAIL, 2 = bad usage.
// Deterministic: no LLM calls, no network, no randomness. It only reports and never fixes content.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

// ---------- arguments ----------
const levelId = process.argv[2];
if (!levelId || !/^level_\d{2}$/.test(levelId)) {
  console.error('Usage: node scripts/validate.js level_XX   (two digits, e.g. level_01)');
  process.exit(2);
}
const levelNum = Number(levelId.slice(6));

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules.json'), 'utf8'));

// ---------- failure collection ----------
const failures = [];
const fileAgent = {}; // rel path -> generated_by (or expected writer when unknown)

function fail(check, file, msg) {
  failures.push({ check, file, agent: fileAgent[file] || 'unknown', msg });
}

// ---------- small helpers ----------
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isStrArr = (v) => Array.isArray(v) && v.every(isStr);
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');
const dupes = (arr) => arr.filter((x, i) => arr.indexOf(x) !== i);
const fmt = (arr) => (arr.length ? arr.join(', ') : 'nothing');

const V = rules.vocabulary;
const HUMAN_RE = new RegExp(rules.crew.human_pattern);
const VENUE_ID_RE = /^[a-z]+(_[a-z0-9]+)+$/;
const CHAR_IDS = Object.keys(rules.characters);
const KNOWN_DIETARY_TAGS = new Set(
  ['allergy', 'diet', 'intolerance'].flatMap((k) => Object.values(rules.dietary_tags[k]).flat())
);

// Every allowed fails_on value, and every allowed clue tag.
const FAILS_ON = new Set([
  ...V.allergy.map((t) => `allergy:${t}`),
  ...V.diet.map((t) => `diet:${t}`),
  ...V.vibe.map((t) => `vibe:${t}`),
  ...V.intolerance.map((t) => `intolerance:${t}`),
  'budget_hard', 'budget_soft', 'craving',
]);
const CLUE_TAGS = new Set([...[...FAILS_ON].filter((t) => !t.startsWith('budget_')), 'budget']);
const HARD_FAILS = (f) => f.startsWith('allergy:') || f.startsWith('diet:') || f === 'budget_hard';
const toClueTag = (f) => (f.startsWith('budget_') ? 'budget' : f);

// ---------- loading ----------
const levelDir = path.join(ROOT, 'content', 'levels', levelId);
const files = {
  spec: path.join(levelDir, `spec_${levelId}.json`),
  dialogue: path.join(levelDir, `dialogue_${levelId}.json`),
  outcomes: path.join(levelDir, `outcomes_${levelId}.json`),
  venues: path.join(levelDir, `venues_${levelId}.json`),
};

function load(kind, abs) {
  const r = rel(abs);
  fileAgent[r] = rules.crew.writer_of[kind];
  if (!fs.existsSync(abs)) {
    fail(1, r, `file is missing (expected ${path.basename(abs)})`);
    return null;
  }
  let data;
  try {
    // Strip a UTF-8 BOM: Windows editors and PowerShell add one, and JSON.parse rejects it.
    data = JSON.parse(fs.readFileSync(abs, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    fail(1, r, `not valid JSON: ${e.message}`);
    return null;
  }
  if (!isObj(data)) {
    fail(1, r, 'top level must be a JSON object');
    return null;
  }
  if (isStr(data.generated_by)) fileAgent[r] = data.generated_by;
  checkProvenanceFields(kind, r, data);
  return data;
}

function checkProvenanceFields(kind, r, data) {
  const g = data.generated_by;
  const expected = rules.crew.writer_of[kind];
  const humanOk = rules.crew.allow_human_generated_by && isStr(g) && HUMAN_RE.test(g);
  if (!isStr(g)) fail(1, r, '"generated_by" is missing');
  else if (g !== expected && !humanOk) {
    fail(1, r, `"generated_by" is "${g}"; this file must be written by "${expected}"`);
  }
  if (!('edited_by' in data)) fail(1, r, '"edited_by" is missing (use null when unedited)');
  else if (data.edited_by !== null && !(isStr(data.edited_by) && HUMAN_RE.test(data.edited_by))) {
    fail(1, r, `"edited_by" must be null or "human:<name>", got ${JSON.stringify(data.edited_by)}`);
  }
}

// Naming: level number range and stray files in the level folder.
if (levelNum < 1 || levelNum > 20) fail(1, rel(levelDir), `level id ${levelId} is outside level_01..level_20`);
if (fs.existsSync(levelDir)) {
  const expectedNames = new Set(Object.values(files).map((f) => path.basename(f)));
  for (const name of fs.readdirSync(levelDir)) {
    if (!expectedNames.has(name)) {
      fileAgent[rel(path.join(levelDir, name))] = 'unknown';
      fail(1, rel(path.join(levelDir, name)), `unexpected file; level files are named <type>_${levelId}.json`);
    }
  }
} else {
  fileAgent[rel(levelDir)] = 'orchestrator';
  fail(1, rel(levelDir), 'level folder does not exist');
}

const spec = load('spec', files.spec);
const dialogue = load('dialogue', files.dialogue);
const outcomes = load('outcomes', files.outcomes);
const venuesFile = load('venues', files.venues);
const R = {
  spec: rel(files.spec), dialogue: rel(files.dialogue), outcomes: rel(files.outcomes), venues: rel(files.venues),
};

for (const [kind, data] of [['spec', spec], ['dialogue', dialogue], ['outcomes', outcomes], ['venues', venuesFile]]) {
  if (data && data.level_id !== levelId) fail(1, R[kind], `"level_id" is ${JSON.stringify(data.level_id)}, expected "${levelId}"`);
}

// ---------- check 1: schemas ----------
let specOk = false;
if (spec) {
  const f = R.spec;
  const before = failures.length;
  if (!Number.isInteger(spec.chapter)) fail(1, f, '"chapter" must be an integer');
  if (!isStr(spec.district)) fail(1, f, '"district" must be a string');
  if (!isStr(spec.difficulty)) fail(1, f, '"difficulty" must be a string');
  if (!isStrArr(spec.guests) || spec.guests.length === 0) fail(1, f, '"guests" must be a non-empty array of character ids');
  if (!isObj(spec.hard)) fail(1, f, '"hard" must be an object');
  else {
    if (!(spec.hard.budget_max === null || isStr(spec.hard.budget_max))) fail(1, f, '"hard.budget_max" must be a tier string or null');
    if (!Array.isArray(spec.hard.allergies) || !spec.hard.allergies.every(isStr)) fail(1, f, '"hard.allergies" must be an array of strings');
    if (!Array.isArray(spec.hard.diets) || !spec.hard.diets.every(isStr)) fail(1, f, '"hard.diets" must be an array of strings');
  }
  if (!isObj(spec.soft)) fail(1, f, '"soft" must be an object');
  else {
    if (!(spec.soft.craving === null || isStr(spec.soft.craving))) fail(1, f, '"soft.craving" must be a cuisine string or null');
    if (!Array.isArray(spec.soft.vibe) || !spec.soft.vibe.every(isStr)) fail(1, f, '"soft.vibe" must be an array of strings');
    if (!Array.isArray(spec.soft.intolerances) || !spec.soft.intolerances.every(isStr)) fail(1, f, '"soft.intolerances" must be an array of strings');
  }
  if (!isStr(spec.solution_id)) fail(1, f, '"solution_id" must be a venue id');
  if (!Array.isArray(spec.decoys) || !spec.decoys.every((d) => isObj(d) && isStr(d.id) && isStr(d.fails_on))) {
    fail(1, f, '"decoys" must be an array of { id, fails_on }');
  }
  specOk = failures.length === before;
  if (specOk) {
    const ids = [spec.solution_id, ...spec.decoys.map((d) => d.id)];
    for (const id of ids) if (!VENUE_ID_RE.test(id)) fail(1, f, `venue id "${id}" is not lowercase snake case`);
    for (const id of new Set(dupes(ids))) fail(1, f, `venue id "${id}" is listed more than once (solution + decoys)`);
    for (const g of new Set(dupes(spec.guests))) fail(1, f, `guest "${g}" is listed more than once`);
  }
}

let dialogueOk = false;
if (dialogue) {
  const f = R.dialogue;
  if (!Array.isArray(dialogue.script) || dialogue.script.length === 0) fail(1, f, '"script" must be a non-empty array');
  else {
    dialogueOk = true;
    dialogue.script.forEach((line, i) => {
      if (!isObj(line) || !isStr(line.speaker) || !isStr(line.text) || !isStr(line.emotion) || !('clue' in line) ||
          !(line.clue === null || isStr(line.clue))) {
        fail(1, f, `script[${i}] must have speaker, text, emotion (strings) and clue (string or null)`);
        dialogueOk = false;
      }
    });
  }
}

let outcomesOk = false;
if (outcomes) {
  const f = R.outcomes;
  if (!isObj(outcomes.by_venue)) fail(1, f, '"by_venue" must be an object keyed by venue id');
  else {
    outcomesOk = true;
    for (const [id, o] of Object.entries(outcomes.by_venue)) {
      if (!isObj(o) || !isStr(o.result) || !Array.isArray(o.missed) || !o.missed.every(isStr) ||
          !Array.isArray(o.lines) || o.lines.length === 0) {
        fail(1, f, `by_venue.${id} must have result (string), missed (array) and a non-empty lines array`);
        outcomesOk = false;
        continue;
      }
      o.lines.forEach((l, i) => {
        if (!isObj(l) || !isStr(l.speaker) || !isStr(l.text) || !isStr(l.emotion)) {
          fail(1, f, `by_venue.${id}.lines[${i}] must have speaker, text and emotion (strings)`);
          outcomesOk = false;
        }
      });
    }
  }
}

let venuesOk = false;
if (venuesFile) {
  const f = R.venues;
  const before = failures.length;
  if (!isStr(venuesFile.district)) fail(1, f, '"district" must be a string');
  if (!Array.isArray(venuesFile.venues) || venuesFile.venues.length === 0) fail(1, f, '"venues" must be a non-empty array');
  else {
    venuesFile.venues.forEach((v, i) => {
      if (!isObj(v) || !isStr(v.id)) fail(1, f, `venues[${i}] must have an "id"`);
      else if (!isStrArr(v.reviews) || v.reviews.length === 0) fail(1, f, `venue "${v.id}" must have a non-empty "reviews" array of strings`);
    });
    if (failures.length === before) {
      for (const id of new Set(dupes(venuesFile.venues.map((v) => v.id)))) fail(1, f, `venue "${id}" is listed more than once`);
    }
  }
  venuesOk = failures.length === before;
}

// ---------- registry ----------
const district = (spec && isStr(spec.district) && spec.district) || (venuesFile && venuesFile.district) || null;
const registryDir = path.join(ROOT, 'content', 'registry');
const registry = new Map(); // venue id -> { entry, file }
let registryFile = null;

function loadRegistry(d) {
  const abs = path.join(registryDir, `venue_registry_${d}.json`);
  const data = load('registry', abs);
  if (!data) return;
  const f = rel(abs);
  if (data.district !== d) fail(1, f, `"district" is ${JSON.stringify(data.district)}, expected "${d}"`);
  if (!Array.isArray(data.venues)) { fail(1, f, '"venues" must be an array'); return; }
  for (const e of data.venues) {
    if (!isObj(e) || !isStr(e.id)) { fail(1, f, 'every registry entry needs an "id"'); continue; }
    if (registry.has(e.id)) fail(1, f, `venue id "${e.id}" appears more than once in the registry`);
    registry.set(e.id, { entry: e, file: f, district: d });
  }
  return f;
}

if (district && rules.districts[district]) {
  if (district === 'night_market' && rules.districts.night_market.imports_from_any_district) {
    for (const d of Object.keys(rules.districts)) {
      if (fs.existsSync(path.join(registryDir, `venue_registry_${d}.json`)) || d === 'night_market') {
        const f = loadRegistry(d);
        if (d === district) registryFile = f;
      }
    }
  } else {
    registryFile = loadRegistry(district);
  }
}

// Registry entry schema + vocabulary (only entries used by this level).
function checkRegistryEntry(id) {
  const { entry: e, file: f, district: d } = registry.get(id);
  const prof = rules.districts[d];
  if (!VENUE_ID_RE.test(e.id)) fail(1, f, `venue id "${e.id}" is not lowercase snake case`);
  if (!e.id.startsWith(`${d}_`)) fail(1, f, `venue id "${e.id}" must start with "${d}_"`);
  if (!isStr(e.name)) fail(1, f, `venue "${id}" is missing "name"`);
  if (!V.cuisine.includes(e.cuisine)) fail(2, f, `venue "${id}" has unknown cuisine ${JSON.stringify(e.cuisine)}`);
  else if (prof.cuisines !== 'any' && !prof.cuisines.includes(e.cuisine)) fail(10, f, `venue "${id}" cuisine "${e.cuisine}" is not in the ${d} district profile`);
  if (!V.price_tier.includes(e.price_tier)) fail(2, f, `venue "${id}" has unknown price_tier ${JSON.stringify(e.price_tier)}`);
  else if (prof.price_tiers !== 'any' && !prof.price_tiers.includes(e.price_tier)) fail(10, f, `venue "${id}" price tier "${e.price_tier}" is not in the ${d} district profile`);
  if (!Array.isArray(e.dietary_tags)) fail(1, f, `venue "${id}" "dietary_tags" must be an array`);
  else for (const t of e.dietary_tags) if (!KNOWN_DIETARY_TAGS.has(t)) fail(2, f, `venue "${id}" has unknown dietary tag "${t}"`);
  if (!Array.isArray(e.vibe_tags)) fail(1, f, `venue "${id}" "vibe_tags" must be an array`);
  else for (const t of e.vibe_tags) if (!V.vibe.includes(t)) fail(2, f, `venue "${id}" has unknown vibe tag "${t}"`);
  if (!(isStr(e.first_level) && /^level_\d{2}$/.test(e.first_level))) fail(1, f, `venue "${id}" "first_level" must be level_XX`);
  return Array.isArray(e.dietary_tags) && Array.isArray(e.vibe_tags) && V.price_tier.includes(e.price_tier);
}

// ---------- check 2: tags, emotions, character ids ----------
if (specOk) {
  const f = R.spec;
  if (!rules.districts[spec.district]) fail(2, f, `unknown district "${spec.district}"`);
  for (const g of spec.guests) if (!CHAR_IDS.includes(g)) fail(2, f, `unknown character id "${g}"`);
  if (spec.hard.budget_max !== null && !V.price_tier.includes(spec.hard.budget_max)) fail(2, f, `unknown budget tier "${spec.hard.budget_max}"`);
  for (const t of spec.hard.allergies) if (!V.allergy.includes(t)) fail(2, f, `unknown allergy "${t}"`);
  for (const t of spec.hard.diets) if (!V.diet.includes(t)) fail(2, f, `unknown diet "${t}"`);
  if (spec.soft.craving !== null && !V.cuisine.includes(spec.soft.craving)) fail(2, f, `unknown cuisine "${spec.soft.craving}"`);
  for (const t of spec.soft.vibe) if (!V.vibe.includes(t)) fail(2, f, `unknown vibe "${t}"`);
  for (const t of spec.soft.intolerances) if (!V.intolerance.includes(t)) fail(2, f, `unknown intolerance "${t}"`);
  for (const d of spec.decoys) if (!FAILS_ON.has(d.fails_on)) fail(2, f, `decoy "${d.id}" has unknown fails_on "${d.fails_on}"`);
}
const guests = specOk ? spec.guests : null;

function checkLine(f, where, line) {
  if (!CHAR_IDS.includes(line.speaker)) fail(2, f, `${where}: unknown character id "${line.speaker}"`);
  else if (guests && !guests.includes(line.speaker)) fail(2, f, `${where}: "${line.speaker}" speaks but is not a guest in this level`);
  if (!rules.emotions.includes(line.emotion)) fail(2, f, `${where}: unknown emotion "${line.emotion}"`);
}
if (dialogueOk) {
  dialogue.script.forEach((line, i) => {
    checkLine(R.dialogue, `script[${i}]`, line);
    if (line.clue !== null && !CLUE_TAGS.has(line.clue)) fail(2, R.dialogue, `script[${i}]: unknown clue tag "${line.clue}"`);
  });
}
if (outcomesOk) {
  for (const [id, o] of Object.entries(outcomes.by_venue)) {
    o.lines.forEach((l, i) => checkLine(R.outcomes, `by_venue.${id}.lines[${i}]`, l));
    for (const m of o.missed) if (!CLUE_TAGS.has(m)) fail(2, R.outcomes, `by_venue.${id}: unknown missed tag "${m}"`);
  }
}

// ---------- check 3: budget_max and permanent traits ----------
if (specOk && guests.every((g) => CHAR_IDS.includes(g))) {
  const f = R.spec;
  const budgetGuests = guests.filter((g) => rules.characters[g].permanent.budget_max);
  const expectedBudget = budgetGuests.length ? rules.characters[budgetGuests[0]].permanent.budget_max : null;
  if (spec.hard.budget_max !== expectedBudget) {
    fail(3, f, `"hard.budget_max" is ${JSON.stringify(spec.hard.budget_max)} but must be ${JSON.stringify(expectedBudget)} ` +
      (expectedBudget ? `(${budgetGuests.join(', ')} is a guest)` : '(Maya is not a guest)'));
  }
  // Permanent constraints apply in every level the character appears in.
  for (const g of guests) {
    const p = rules.characters[g].permanent;
    for (const t of p.allergies || []) if (!spec.hard.allergies.includes(t)) fail(3, f, `${g} is a guest, so "hard.allergies" must include "${t}"`);
    for (const t of p.diets || []) if (!spec.hard.diets.includes(t)) fail(3, f, `${g} is a guest, so "hard.diets" must include "${t}"`);
    for (const t of p.intolerances || []) if (!spec.soft.intolerances.includes(t)) fail(3, f, `${g} is a guest, so "soft.intolerances" must include "${t}"`);
    for (const t of p.vibe || []) if (!spec.soft.vibe.includes(t)) fail(3, f, `${g} is a guest, so "soft.vibe" must include "${t}"`);
  }
}

// ---------- check 4: chapter fit ----------
if (specOk) {
  const f = R.spec;
  const ch = rules.chapters[String(spec.chapter)];
  if (!ch) fail(4, f, `unknown chapter ${spec.chapter}`);
  else {
    if (levelNum < ch.levels[0] || levelNum > ch.levels[1]) fail(4, f, `${levelId} is not in chapter ${spec.chapter} (levels ${ch.levels[0]}-${ch.levels[1]})`);
    if (spec.district !== ch.district) fail(4, f, `chapter ${spec.chapter} is district "${ch.district}", not "${spec.district}"`);
    if (!ch.difficulty.includes(spec.difficulty)) fail(4, f, `difficulty "${spec.difficulty}" is not allowed in chapter ${spec.chapter} (${ch.difficulty.join(', ')})`);
    const n = spec.guests.length;
    if (n < ch.guests[0] || n > ch.guests[1]) fail(4, f, `${n} guests; chapter ${spec.chapter} allows ${ch.guests[0]}-${ch.guests[1]}`);
    const venueCount = 1 + spec.decoys.length;
    if (venueCount !== ch.venues) fail(4, f, `${venueCount} venues (solution + decoys); chapter ${spec.chapter} needs ${ch.venues}`);
    if (venuesOk && venuesFile.venues.length !== ch.venues) fail(4, R.venues, `${venuesFile.venues.length} venues; chapter ${spec.chapter} needs ${ch.venues}`);
    const hardCount = spec.hard.allergies.length + spec.hard.diets.length;
    if (hardCount > ch.max_hard) fail(4, f, `${hardCount} hard constraints (allergies + diets); chapter ${spec.chapter} allows at most ${ch.max_hard}`);
    if (dialogueOk) {
      const m = dialogue.script.length;
      if (m < ch.messages[0] || m > ch.messages[1]) fail(4, R.dialogue, `${m} messages; chapter ${spec.chapter} allows ${ch.messages[0]}-${ch.messages[1]}`);
    }
  }
}

// ---------- check 10: venues match registry ----------
const scorable = new Map(); // venue id -> registry entry with valid fields
if (venuesOk) {
  const f = R.venues;
  if (specOk && venuesFile.district !== spec.district) fail(10, f, `"district" is "${venuesFile.district}" but the spec says "${spec.district}"`);
  for (const v of venuesFile.venues) {
    if (!registryFile) break; // registry missing or unreadable: already reported under check 1
    if (!registry.has(v.id)) {
      fail(10, f, `venue "${v.id}" is not in ${registryFile || `venue_registry_${district}.json`}`);
      continue;
    }
    const { entry, district: home } = registry.get(v.id);
    if (home !== district && district !== 'night_market') fail(10, f, `venue "${v.id}" belongs to ${home}, not ${district}`);
    for (const [k, val] of Object.entries(v)) {
      if (k === 'id' || k === 'reviews') continue;
      if (!(k in entry)) fail(10, f, `venue "${v.id}" has field "${k}", which the registry does not define`);
      else if (JSON.stringify(val) !== JSON.stringify(entry[k])) {
        fail(10, f, `venue "${v.id}" ${k} is ${JSON.stringify(val)} but the registry says ${JSON.stringify(entry[k])}`);
      }
    }
    if (checkRegistryEntry(v.id)) scorable.set(v.id, entry);
  }
}

// Solution + decoys must be exactly the venues in the venues file.
if (specOk && venuesOk) {
  const specIds = [spec.solution_id, ...spec.decoys.map((d) => d.id)];
  const fileIds = venuesFile.venues.map((v) => v.id);
  for (const id of specIds) if (!fileIds.includes(id)) fail(1, R.venues, `venue "${id}" is in the spec but not in this venues file`);
  for (const id of fileIds) if (!specIds.includes(id)) fail(6, R.spec, `venue "${id}" is in the venues file but is neither the solution nor a decoy`);
}

// ---------- scoring (bible: Scoring rules) ----------
function score(entry) {
  const hard = [];
  const soft = [];
  const tagMap = rules.dietary_tags;
  const serves = (kind, t) => (tagMap[kind][t] || []).some((x) => entry.dietary_tags.includes(x));
  for (const t of spec.hard.allergies) if (!serves('allergy', t)) hard.push(`allergy:${t}`);
  for (const t of spec.hard.diets) if (!serves('diet', t)) hard.push(`diet:${t}`);
  if (spec.hard.budget_max !== null) {
    const over = V.price_tier.indexOf(entry.price_tier) - V.price_tier.indexOf(spec.hard.budget_max);
    if (over >= rules.scoring.budget_hard_tiers_over) hard.push('budget_hard');
    else if (over >= rules.scoring.budget_soft_tiers_over) soft.push('budget_soft');
  }
  if (spec.soft.craving !== null && entry.cuisine !== spec.soft.craving) soft.push('craving');
  for (const t of spec.soft.vibe) if (!entry.vibe_tags.includes(t)) soft.push(`vibe:${t}`);
  for (const t of spec.soft.intolerances) if (!serves('intolerance', t)) soft.push(`intolerance:${t}`);
  const stars = hard.length ? 0 : Math.max(rules.scoring.floor_stars, rules.scoring.start_stars - soft.length);
  return { hard, soft, stars };
}

const scores = new Map();
if (specOk) for (const [id, entry] of scorable) scores.set(id, score(entry));
const allScored = specOk && venuesOk && scorable.size === venuesFile.venues.length;
const regFileOf = (id) => (registry.has(id) ? registry.get(id).file : R.venues);

// ---------- check 5: exactly one 3-star venue, and it is the solution ----------
if (allScored) {
  const threeStar = [...scores].filter(([, s]) => s.stars === 3).map(([id]) => id);
  if (threeStar.length !== 1 || threeStar[0] !== spec.solution_id) {
    const sol = scores.get(spec.solution_id);
    if (sol && sol.stars !== 3) {
      fail(5, regFileOf(spec.solution_id), `solution "${spec.solution_id}" scores ${sol.stars} stars, not 3 (misses: ${fmt([...sol.hard, ...sol.soft])})`);
    }
    for (const id of threeStar.filter((x) => x !== spec.solution_id)) {
      fail(5, regFileOf(id), `"${id}" also scores 3 stars; only the solution "${spec.solution_id}" may`);
    }
  }
}

// ---------- check 6: each decoy fails on exactly its declared fails_on ----------
if (allScored) {
  for (const d of spec.decoys) {
    const s = scores.get(d.id);
    if (!s) continue;
    const actual = [...s.hard, ...s.soft];
    if (!(actual.length === 1 && actual[0] === d.fails_on)) {
      fail(6, regFileOf(d.id), `decoy "${d.id}" should fail only on "${d.fails_on}" but fails on: ${fmt(actual)}`);
    }
  }
}

// ---------- check 7: at least one hard-fail trap and one near miss ----------
if (specOk) {
  if (!spec.decoys.some((d) => HARD_FAILS(d.fails_on))) fail(7, R.spec, 'no hard-fail trap (a decoy failing on allergy, diet or budget_hard)');
  if (!spec.decoys.some((d) => !HARD_FAILS(d.fails_on))) fail(7, R.spec, 'no near miss (a decoy with exactly one soft miss)');
}

// ---------- check 8: every scoring constraint has a clue line ----------
if (specOk && dialogueOk) {
  const needed = [
    ...spec.hard.allergies.map((t) => `allergy:${t}`),
    ...spec.hard.diets.map((t) => `diet:${t}`),
    ...(spec.hard.budget_max !== null ? ['budget'] : []),
    ...(spec.soft.craving !== null ? ['craving'] : []),
    ...spec.soft.vibe.map((t) => `vibe:${t}`),
    ...spec.soft.intolerances.map((t) => `intolerance:${t}`),
  ];
  const tagged = new Set(dialogue.script.map((l) => l.clue).filter((c) => c !== null));
  for (const t of needed) if (!tagged.has(t)) fail(8, R.dialogue, `no dialogue line is tagged "${t}"`);
  dialogue.script.forEach((l, i) => {
    if (l.clue !== null && CLUE_TAGS.has(l.clue) && !needed.includes(l.clue)) {
      fail(8, R.dialogue, `script[${i}] is tagged "${l.clue}", which is not a constraint in this level's spec`);
    }
  });
}

// ---------- check 9: outcomes cover every venue and match the score ----------
if (outcomesOk && venuesOk) {
  const f = R.outcomes;
  const fileIds = venuesFile.venues.map((v) => v.id);
  for (const id of fileIds) if (!(id in outcomes.by_venue)) fail(9, f, `no outcome for venue "${id}"`);
  for (const id of Object.keys(outcomes.by_venue)) if (!fileIds.includes(id)) fail(9, f, `outcome for "${id}", which is not a venue in this level`);
  if (allScored) {
    for (const [id, s] of scores) {
      const o = outcomes.by_venue[id];
      if (!o) continue;
      const expectedResult = rules.outcome_results[String(s.stars)];
      if (o.result !== expectedResult) fail(9, f, `"${id}" result is "${o.result}" but it scores ${s.stars} stars ("${expectedResult}")`);
      const expectedMissed = [...new Set((s.hard.length ? s.hard : s.soft).map(toClueTag))];
      if (!sameSet([...new Set(o.missed)], expectedMissed)) {
        fail(9, f, `"${id}" missed is [${o.missed.join(', ')}] but should be [${expectedMissed.join(', ')}]`);
      }
    }
  }
}

// ---------- write log ----------
const logsDir = path.join(ROOT, 'logs');
fs.mkdirSync(logsDir, { recursive: true });
const logPath = path.join(logsDir, `validation_${levelId}.log`);
failures.sort((a, b) => a.check - b.check);
const lines = failures.length
  ? [`FAIL ${levelId}: ${failures.length} failure${failures.length === 1 ? '' : 's'}`,
     ...failures.map((x) => `[check ${x.check}] ${x.file} (agent: ${x.agent}): ${x.msg}`)]
  : [`PASS ${levelId}`];
fs.writeFileSync(logPath, lines.join('\n') + '\n');

console.log(lines.join('\n'));
if (scores.size) {
  console.log('\nScores:');
  for (const [id, s] of scores) {
    const tag = specOk && id === spec.solution_id ? ' (solution)' : '';
    console.log(`  ${s.stars}★ ${id}${tag}  misses: ${fmt([...s.hard, ...s.soft])}`);
  }
}
console.log(`\nLog written to ${rel(logPath)}`);
process.exit(failures.length ? 1 : 0);
