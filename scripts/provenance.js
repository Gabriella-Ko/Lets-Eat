#!/usr/bin/env node
// Let's Eat! Provenance · brief v1 · agent id: provenance
// Spec: docs/specs/provenance.md.
//
// Usage: node scripts/provenance.js
// Reads git history, each content file's generated_by / edited_by, and logs/run_log.json,
// then writes logs/provenance_manifest.json: one entry per file with author id, brief version,
// timestamp and commit hash, plus its full commit lineage.
// It never edits content and never overwrites the record of a human edit. Exit 0, or 2 if git is unavailable.

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const HUMAN_RE = /^human:[a-z][a-z0-9_]*$/;

try { git('rev-parse', '--git-dir'); } catch {
  console.error('Provenance needs git: run it inside the repository.');
  process.exit(2);
}

// Files that carry generated_by / edited_by: all content JSON (except the playtest copies) and playtest reports.
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}
const relPath = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const files = [
  ...walk(path.join(ROOT, 'content')).filter((p) => p.endsWith('.json') && !relPath(p).startsWith('content/playtest_input/')),
  ...walk(path.join(ROOT, 'logs')).filter((p) => /playtest_level_\d{2}_run\d+\.json$/.test(p)),
].map(relPath).sort();

let runLog = [];
try { runLog = readJson(path.join(ROOT, 'logs', 'run_log.json')); } catch { /* reported per file as brief_version null */ }

// Commits older than the first [agent_id]-tagged commit predate the pipeline: treat them as the baseline, not as issues.
const allCommits = git('log', '--reverse', '--format=%H%x09%s').split('\n').filter(Boolean).map((l) => l.split('\t'));
const firstTaggedIdx = allCommits.findIndex(([, s]) => /^\[[^\]]+\]/.test(s));
const baseline = new Set((firstTaggedIdx === -1 ? [] : allCommits.slice(0, firstTaggedIdx)).map(([h]) => h));

const levelOf = (f) => (f.match(/level_\d{2}/) || [])[0] || (f.startsWith('content/campaign/') ? 'campaign' : null);
const tagOf = (subject) => (subject.match(/^\[([^\]]+)\]/) || [])[1] || null;

function briefVersion(agent, level) {
  if (!agent || HUMAN_RE.test(agent)) return null;
  const hits = runLog.filter((e) => e.agent_id === agent && e.brief_version);
  const forLevel = hits.filter((e) => e.level === level);
  const pick = (forLevel.length ? forLevel : hits).slice(-1)[0];
  return pick ? pick.brief_version : null;
}

const dirty = new Set(
  git('status', '--porcelain', '--', 'content', 'logs').split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''))
);

const entries = [];
const issues = [];
for (const f of files) {
  let data = null;
  try { data = readJson(path.join(ROOT, f)); } catch (e) { issues.push(`${f}: not valid JSON (${e.message})`); }
  const generatedBy = data && typeof data.generated_by === 'string' ? data.generated_by : null;
  const editedBy = data && 'edited_by' in data ? data.edited_by : null;

  const log = git('log', '--follow', '--no-merges', '--format=%H%x09%aI%x09%an%x09%s', '--', f).split('\n').filter(Boolean)
    .map((l) => { const [hash, timestamp, author, subject] = l.split('\t'); return { hash, timestamp, author, agent_tag: tagOf(subject), subject }; });
  const last = log[0] || null;
  const level = levelOf(f);

  if (!generatedBy) issues.push(`${f}: no generated_by`);
  if (editedBy !== null && !(typeof editedBy === 'string' && HUMAN_RE.test(editedBy))) issues.push(`${f}: edited_by must be null or human:<name>, got ${JSON.stringify(editedBy)}`);
  if (!last) issues.push(`${f}: never committed`);
  if (dirty.has(f)) issues.push(`${f}: has uncommitted changes, so this entry reflects the last commit, not the file on disk`);
  // A human edit must be on record in the file, and its commit must carry the human tag.
  const humanCommits = log.filter((c) => c.agent_tag && HUMAN_RE.test(c.agent_tag) && c.agent_tag !== generatedBy);
  if (humanCommits.length && !editedBy) issues.push(`${f}: commit ${humanCommits[0].hash.slice(0, 7)} is a human edit (${humanCommits[0].agent_tag}) but edited_by is null`);
  if (editedBy && !log.some((c) => c.agent_tag === editedBy)) issues.push(`${f}: edited_by is ${editedBy} but no commit is tagged [${editedBy}]`);
  for (const c of log) {
    if (!c.agent_tag && !baseline.has(c.hash)) issues.push(`${f}: commit ${c.hash.slice(0, 7)} ("${c.subject}") has no [agent_id] tag`);
  }

  entries.push({
    file: f,
    level,
    author_id: generatedBy,
    edited_by: editedBy,
    brief_version: briefVersion(generatedBy, level),
    timestamp: last ? last.timestamp : null,
    commit: last ? last.hash : null,
    last_commit_by: last ? last.agent_tag : null,
    uncommitted_changes: dirty.has(f),
    history: log.map(({ hash, timestamp, agent_tag, subject }) => ({ commit: hash, timestamp, agent_tag, subject, pre_pipeline: baseline.has(hash) })),
  });
}

const manifest = {
  generated_by: 'provenance',
  head: git('rev-parse', 'HEAD').trim(),
  files: entries,
  issues,
};
const out = path.join(ROOT, 'logs', 'provenance_manifest.json');
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Provenance: ${entries.length} files, ${issues.length} issue${issues.length === 1 ? '' : 's'}`);
for (const e of entries) console.log(`  ${e.file}  ${e.author_id}${e.edited_by ? ` (edited by ${e.edited_by})` : ''}  ${e.brief_version || '-'}  ${e.commit ? e.commit.slice(0, 7) : 'uncommitted'}`);
for (const i of issues) console.log(`  issue: ${i}`);
console.log(`\nManifest written to logs/provenance_manifest.json`);
