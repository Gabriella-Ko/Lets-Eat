#!/usr/bin/env node
// Let's Eat! Integration · brief v1 · agent id: integration
// Spec: docs/specs/integration.md. Rules: scripts/rules.json (from docs/game_bible.md).
//
// Usage: node scripts/integrate.js
// Writes logs/integration_audit.log. Exit 0 = SUCCESS, 1 = FAILED_BUILD.
// Deterministic: no LLM calls. It only reports and never fixes content.
//
// Approved levels come from logs/run_log.json entries with step "approval" and result "approved".

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const rules = readJson(path.join(__dirname, 'rules.json'));

const problems = []; // fail the build
const notes = [];    // reported, but do not fail the build
const problem = (check, msg) => problems.push(`[check ${check}] ${msg}`);
const note = (check, msg) => notes.push(`[check ${check}] note: ${msg}`);

const ALL_LEVELS = Array.from({ length: 20 }, (_, i) => `level_${String(i + 1).padStart(2, '0')}`);
const levelsDir = path.join(ROOT, 'content', 'levels');
const registryDir = path.join(ROOT, 'content', 'registry');
const built = ALL_LEVELS.filter((id) => fs.existsSync(path.join(levelsDir, id, `spec_${id}.json`)));

// ---------- approvals ----------
let approved = new Set();
try {
  const log = readJson(path.join(ROOT, 'logs', 'run_log.json'));
  approved = new Set(log.filter((e) => e.step === 'approval' && e.result === 'approved').map((e) => e.level));
} catch (e) {
  problem(1, `cannot read logs/run_log.json to find approved levels: ${e.message}`);
}
for (const id of approved) {
  if (!built.includes(id)) problem(1, `${id} is marked approved in the run log but its files are missing`);
}
for (const id of built) if (!approved.has(id)) note(1, `${id} is built but not approved yet; validated, but its failures don't fail the build`);

// ---------- check 1: re-run the Validator on every built level ----------
for (const id of built) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'validate.js'), id], { cwd: ROOT, encoding: 'utf8' });
  if (r.status === 0) continue;
  const first = (r.stdout || r.stderr || '').split('\n').find((l) => l.startsWith('[check')) || 'see its validation log';
  const msg = `${id} fails the Validator (logs/validation_${id}.log). First failure: ${first}`;
  if (approved.has(id)) problem(1, msg);
  else note(1, msg);
}

// ---------- check 2: appearances match the outline and the guardrails ----------
let outline = null;
try {
  outline = readJson(path.join(ROOT, 'content', 'campaign', 'campaign_outline.json'));
} catch (e) {
  problem(2, `cannot read content/campaign/campaign_outline.json: ${e.message}`);
}
if (outline) {
  if (outline.status !== 'approved') problem(2, `campaign outline status is "${outline.status}", not "approved"`);
  const rows = new Map((outline.levels || []).map((r) => [r.level_id, r]));
  for (const id of ALL_LEVELS) if (!rows.has(id)) problem(2, `campaign outline has no row for ${id}`);

  // Guardrails over the whole outline.
  const chars = Object.keys(rules.characters);
  const app = Object.fromEntries(chars.map((c) => [c, { total: 0, 1: 0, 2: 0, 3: 0, 4: 0 }]));
  for (const r of rows.values()) {
    const ch = rules.chapters[String(r.chapter)];
    const n = Number(r.level_id.slice(6));
    if (!ch) { problem(2, `${r.level_id}: unknown chapter ${r.chapter}`); continue; }
    if (n < ch.levels[0] || n > ch.levels[1]) problem(2, `${r.level_id}: outline puts it in chapter ${r.chapter}`);
    if (r.district !== ch.district) problem(2, `${r.level_id}: outline district "${r.district}" but chapter ${r.chapter} is "${ch.district}"`);
    if (r.guests.length < ch.guests[0] || r.guests.length > ch.guests[1]) problem(2, `${r.level_id}: ${r.guests.length} guests in the outline; chapter ${r.chapter} allows ${ch.guests[0]}-${ch.guests[1]}`);
    for (const g of r.guests) {
      if (!app[g]) { problem(2, `${r.level_id}: unknown character "${g}" in the outline`); continue; }
      app[g].total++; app[g][r.chapter]++;
    }
  }
  for (const [c, a] of Object.entries(app)) {
    if (a.total < 4) problem(2, `${c} appears in ${a.total} levels; the bible requires at least 4`);
    for (const ch of [2, 3, 4]) if (!a[ch]) problem(2, `${c} has no level in chapter ${ch}`);
  }
  const firstRoxy = [...rows.values()].find((r) => r.guests.includes('roxy'));
  if (!firstRoxy || firstRoxy.level_id !== 'level_06') problem(2, `Roxy must debut in level_06 (first appearance: ${firstRoxy ? firstRoxy.level_id : 'none'})`);
  const minaLiam = [...rows.values()].filter((r) => r.chapter === 1 && [...r.guests].sort().join() === 'liam,mina');
  if (minaLiam.length !== 1) problem(2, `chapter 1 needs exactly one Mina + Liam only level (found ${minaLiam.length})`);

  // Each built level's spec must match its outline row.
  for (const id of built) {
    const r = rows.get(id);
    if (!r) continue;
    let spec;
    try { spec = readJson(path.join(levelsDir, id, `spec_${id}.json`)); } catch { continue; } // the Validator reports it
    const hard = [...(spec.hard?.allergies || []).map((t) => `allergy:${t}`), ...(spec.hard?.diets || []).map((t) => `diet:${t}`)];
    const diffs = [];
    if (spec.chapter !== r.chapter) diffs.push(`chapter ${spec.chapter} vs ${r.chapter}`);
    if (spec.district !== r.district) diffs.push(`district ${spec.district} vs ${r.district}`);
    if (spec.difficulty !== r.clue_style) diffs.push(`difficulty ${spec.difficulty} vs clue_style ${r.clue_style}`);
    if ([...(spec.guests || [])].sort().join() !== [...r.guests].sort().join()) diffs.push(`guests [${spec.guests}] vs [${r.guests}]`);
    if ([...hard].sort().join() !== [...r.hard_constraints].sort().join()) diffs.push(`hard constraints [${hard}] vs [${r.hard_constraints}]`);
    for (const d of diffs) {
      const msg = `${id} spec does not match its outline row: ${d}`;
      if (approved.has(id)) problem(2, msg); else note(2, msg);
    }
  }
}

// ---------- registries ----------
const registries = {}; // district -> { file, data }
if (fs.existsSync(registryDir)) {
  for (const name of fs.readdirSync(registryDir).sort()) {
    const m = name.match(/^venue_registry_([a-z_]+)\.json$/);
    if (!m) { problem(4, `content/registry/${name} does not follow venue_registry_<district>.json`); continue; }
    try {
      registries[m[1]] = { file: `content/registry/${name}`, data: readJson(path.join(registryDir, name)) };
    } catch (e) {
      problem(3, `content/registry/${name} is not valid JSON: ${e.message}`);
    }
  }
}

// ---------- check 4: no duplicate ids across registries or levels ----------
const homeOf = new Map(); // venue id -> district
for (const [d, { file, data }] of Object.entries(registries)) {
  for (const e of data.venues || []) {
    if (homeOf.has(e.id)) problem(4, `venue id "${e.id}" is in both venue_registry_${homeOf.get(e.id)}.json and ${file}`);
    else homeOf.set(e.id, d);
    if (!e.id.startsWith(`${d}_`)) problem(3, `${file}: venue "${e.id}" must start with "${d}_"`);
  }
}
const names = new Map();
for (const [d, { data }] of Object.entries(registries)) {
  for (const e of data.venues || []) {
    const key = String(e.name || '').toLowerCase();
    if (key && names.has(key)) problem(4, `venue name "${e.name}" is used by both "${names.get(key)}" and "${e.id}"`);
    else names.set(key, e.id);
  }
}
if (outline) {
  for (const id of new Set((outline.levels || []).map((r) => r.level_id).filter((x, i, a) => a.indexOf(x) !== i))) {
    problem(4, `level id ${id} appears more than once in the campaign outline`);
  }
}

// ---------- check 3: recurring venues match the registry; district rules ----------
const FIXED = ['id', 'name', 'cuisine', 'price_tier', 'dietary_tags', 'vibe_tags', 'first_level'];
const chapterOfDistrict = Object.fromEntries(Object.entries(rules.chapters).map(([n, c]) => [c.district, Number(n)]));
const usedIn = new Map(); // venue id -> [level ids]
for (const id of built) {
  let venues, spec;
  try {
    venues = readJson(path.join(levelsDir, id, `venues_${id}.json`));
    spec = readJson(path.join(levelsDir, id, `spec_${id}.json`));
  } catch { continue; } // the Validator reports it
  for (const v of venues.venues || []) {
    (usedIn.get(v.id) || usedIn.set(v.id, []).get(v.id)).push(id);
    const home = homeOf.get(v.id);
    if (!home) { problem(3, `${id} uses venue "${v.id}", which is in no registry`); continue; }
    if (home === spec.district) continue;
    if (spec.district !== 'night_market') {
      problem(3, `${id} (${spec.district}) uses "${v.id}" from ${home}; only the Night Market can bring back venues from other districts`);
    } else if (!(chapterOfDistrict[home] < chapterOfDistrict.night_market)) {
      problem(3, `${id} (night_market) brings back "${v.id}" from ${home}, which is not an earlier chapter`);
    }
  }
}

// Registry entries must never change after they were first committed (only reviews may change, and those live in level files).
function gitShow(rev, file) {
  try { return execFileSync('git', ['show', `${rev}:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return null; }
}
let gitOk = true;
for (const { file, data } of Object.values(registries)) {
  let revs = [];
  try {
    revs = execFileSync('git', ['log', '--format=%h', '--reverse', '--', file], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch { gitOk = false; break; }
  const firstSeen = new Map(); // venue id -> { rev, entry }
  for (const rev of revs) {
    const text = gitShow(rev, file);
    if (!text) continue;
    let old;
    try { old = JSON.parse(text.replace(/^﻿/, '')); } catch { continue; }
    for (const e of old.venues || []) if (e && e.id && !firstSeen.has(e.id)) firstSeen.set(e.id, { rev, entry: e });
  }
  for (const e of data.venues || []) {
    const seen = firstSeen.get(e.id);
    if (!seen) { note(3, `${file}: "${e.id}" is not committed yet, so its history can't be checked`); continue; }
    for (const k of FIXED) {
      if (JSON.stringify(e[k]) !== JSON.stringify(seen.entry[k])) {
        problem(3, `${file}: "${e.id}" ${k} changed from ${JSON.stringify(seen.entry[k])} (commit ${seen.rev}) to ${JSON.stringify(e[k])}; fixed fields never change, so propose a new venue instead`);
      }
    }
  }
  for (const [vid, { rev }] of firstSeen) {
    if (!(data.venues || []).some((e) => e.id === vid)) problem(3, `${file}: venue "${vid}" (added in ${rev}) was removed from the registry`);
  }
}
if (!gitOk) problem(3, 'git history unavailable, so registry entries could not be checked for drift');

// first_level must be the first built level that uses the venue.
for (const [vid, levels] of usedIn) {
  const home = homeOf.get(vid);
  if (!home) continue;
  const entry = registries[home].data.venues.find((e) => e.id === vid);
  const first = [...levels].sort()[0];
  if (entry.first_level !== first) problem(3, `"${vid}" first_level is ${entry.first_level}, but it first appears in ${first}`);
}

// ---------- check 5: boot test ----------
const missing = ALL_LEVELS.filter((id) => !built.includes(id));
let bootLine;
const pkgPath = path.join(ROOT, 'package.json');
const pkg = fs.existsSync(pkgPath) ? readJson(pkgPath) : null;
if (pkg && pkg.scripts && pkg.scripts['boot-test']) {
  // Contract: `npm run boot-test` starts the Phaser build headlessly and loads the levels listed in LETS_EAT_LEVELS in order.
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', '--silent', 'boot-test'], {
    cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32',
    env: { ...process.env, LETS_EAT_LEVELS: built.join(',') },
  });
  if (r.status === 0) bootLine = `boot test: passed, loaded ${built.length} level(s) in order`;
  else problem(5, `boot test failed (exit ${r.status}): ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ')}`);
} else {
  bootLine = 'boot test: NOT RUN. No Phaser build yet (add a "boot-test" script to package.json)';
}
if (missing.length) note(5, `levels not built yet, skipped: ${missing.join(', ')}`);

// ---------- write log ----------
const header = problems.length
  ? `FAILED_BUILD: ${problems.length} problem${problems.length === 1 ? '' : 's'}`
  : 'SUCCESS';
const lines = [
  header,
  `built: ${built.join(', ') || 'none'} · approved: ${[...approved].sort().join(', ') || 'none'}`,
  ...(bootLine ? [bootLine] : []),
  ...problems,
  ...notes,
];
fs.mkdirSync(path.join(ROOT, 'logs'), { recursive: true });
const logPath = path.join(ROOT, 'logs', 'integration_audit.log');
fs.writeFileSync(logPath, lines.join('\n') + '\n');
console.log(lines.join('\n'));
console.log(`\nLog written to ${rel(logPath)}`);
process.exit(problems.length ? 1 : 0);
