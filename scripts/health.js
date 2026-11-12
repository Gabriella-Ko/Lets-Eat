#!/usr/bin/env node
// Let's Eat! pipeline health · agent id: orchestrator (reporting only)
//
// Usage: node scripts/health.js
// Reads logs/run_log.json, every version of logs/critique_level_XX.json in git history, the playtest logs
// and each level's spec, and writes logs/pipeline_health.json: retries per agent per level, tokens,
// critic findings by check (and which keep coming back), playtest results. Feeds the Pipeline Health page.
// Deterministic apart from "generated_at"; read-only on content. Never changes anything but its own output.

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const runLog = readJson('logs/run_log.json');
const levelIds = fs.readdirSync(path.join(ROOT, 'content/levels')).filter((d) => /^level_\d\d$/.test(d)).sort();
const CREW = ['puzzle_architect', 'narrative_writer', 'map_seeder', 'critic', 'blind_playtester'];

// ---------- per level ----------
const levels = levelIds.map((id) => {
  const spec = readJson(`content/levels/${id}/spec_${id}.json`);
  const entries = runLog.filter((e) => e.level === id);
  // Retries: the highest retry count each agent reached on this level (the brief caps it at 3).
  const retries = Object.fromEntries(CREW.map((a) => [a, Math.max(0, ...entries.filter((e) => e.agent_id === a).map((e) => e.retries || 0))]));
  const tokens = entries.reduce((s, e) => s + (e.tokens || 0), 0);
  const tokensLogged = entries.filter((e) => e.tokens != null).length;
  const approval = entries.filter((e) => e.agent_id.startsWith('human:') && e.step === 'approval').map((e) => e.timestamp).sort().pop() || null;

  // Critique history: every committed version, oldest first.
  const file = `logs/critique_${id}.json`;
  const hashes = fs.existsSync(path.join(ROOT, file)) ? git('log', '--format=%h', '--', file).trim().split('\n').filter(Boolean).reverse() : [];
  const critiques = hashes.map((h) => {
    let c;
    try { c = JSON.parse(git('show', `${h}:${file}`).replace(/^﻿/, '')); } catch { return null; }
    const f = c.findings || [];
    return {
      commit: h,
      verdict: c.verdict,
      must_fix: f.filter((x) => x.severity === 'must_fix').length,
      suggestions: f.filter((x) => x.severity === 'suggestion').length,
      findings: f.map((x) => ({ severity: x.severity, check: x.check, agent: x.agent })),
    };
  }).filter(Boolean);

  // Final playtests (the files on disk are the last runs).
  const runs = [1, 2, 3].map((n) => `logs/playtest_${id}_run${n}.json`).filter((p) => fs.existsSync(path.join(ROOT, p))).map((p) => {
    const r = readJson(p);
    return { run: r.run, pick: r.pick, correct: r.pick === spec.solution_id, constraints_found: (r.constraints_found || []).length, difficulty: r.difficulty ?? null };
  });
  const needs = spec.hard.allergies.length + spec.hard.diets.length + (spec.hard.budget_max ? 1 : 0) +
    (spec.soft.craving ? 1 : 0) + spec.soft.vibe.length + spec.soft.intolerances.length;

  return {
    id, number: Number(id.slice(6)), chapter: spec.chapter, difficulty: spec.difficulty, guests: spec.guests.length,
    needs, steps: entries.length, retries, total_retries: Object.values(retries).reduce((a, b) => a + b, 0),
    tokens, tokens_logged: tokensLogged, approved_at: approval,
    critique_rounds: critiques.length,
    first_must_fix: critiques[0]?.must_fix ?? null, final_must_fix: critiques.at(-1)?.must_fix ?? null,
    final_suggestions: critiques.at(-1)?.suggestions ?? null,
    critiques,
    playtests: runs, playtests_correct: runs.filter((r) => r.correct).length,
  };
});

// ---------- critic findings across all rounds ----------
const byCheck = {};
for (const l of levels) {
  for (const c of l.critiques) {
    for (const f of c.findings) {
      const k = (byCheck[f.check] ||= { check: f.check, must_fix: 0, suggestion: 0, levels: new Set(), agents: {} });
      k[f.severity === 'must_fix' ? 'must_fix' : 'suggestion']++;
      k.levels.add(l.id);
      if (f.agent) k.agents[f.agent] = (k.agents[f.agent] || 0) + 1;
    }
  }
}
const findings = Object.values(byCheck)
  .map((k) => ({ ...k, levels: [...k.levels].sort(), recurring: k.levels.size >= 3 }))
  .sort((a, b) => b.must_fix - a.must_fix || b.suggestion - a.suggestion);

// ---------- per agent ----------
const agents = CREW.map((a) => {
  const e = runLog.filter((x) => x.agent_id === a);
  const versions = [...new Set(e.map((x) => x.brief_version).filter(Boolean))];
  return {
    agent: a,
    steps: e.length,
    retries: levels.reduce((s, l) => s + l.retries[a], 0),
    levels_with_retries: levels.filter((l) => l.retries[a] > 0).map((l) => l.id),
    tokens: e.reduce((s, x) => s + (x.tokens || 0), 0),
    brief_versions: versions,
  };
});

const out = {
  generated_by: 'orchestrator',
  generated_at: new Date().toISOString(),
  source: 'logs/run_log.json, git history of logs/critique_level_XX.json, logs/playtest_level_XX_runN.json, content/levels/*/spec',
  totals: {
    levels: levels.length,
    approved: levels.filter((l) => l.approved_at).length,
    run_log_entries: runLog.length,
    retries: levels.reduce((s, l) => s + l.total_retries, 0),
    tokens: runLog.reduce((s, e) => s + (e.tokens || 0), 0),
    tokens_logged_entries: runLog.filter((e) => e.tokens != null).length,
    critique_rounds: levels.reduce((s, l) => s + l.critique_rounds, 0),
    must_fix_total: levels.reduce((s, l) => s + l.critiques.reduce((t, c) => t + c.must_fix, 0), 0),
    playtests_correct: levels.reduce((s, l) => s + l.playtests_correct, 0),
    playtests_total: levels.reduce((s, l) => s + l.playtests.length, 0),
  },
  levels,
  agents,
  findings,
};

const dest = path.join(ROOT, 'logs', 'pipeline_health.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');

// Row-shaped copies for the Pipeline Health page (one file per dataset; each an array of flat rows).
const rowsDir = path.join(ROOT, 'logs', 'health');
fs.mkdirSync(rowsDir, { recursive: true });
const writeRows = (name, rows) => fs.writeFileSync(path.join(rowsDir, `${name}.json`), JSON.stringify(rows, null, 2) + '\n');
writeRows('levels', levels.map((l) => ({
  level: l.id, number: l.number, chapter: l.chapter, difficulty: l.difficulty, guests: l.guests, needs: l.needs,
  steps: l.steps, retries: l.total_retries, tokens: l.tokens, tokens_logged: l.tokens_logged,
  critique_rounds: l.critique_rounds, first_suggestions: l.critiques[0]?.suggestions ?? 0,
  final_suggestions: l.final_suggestions ?? 0, must_fix: l.critiques.reduce((t, c) => t + c.must_fix, 0),
  playtests_correct: l.playtests_correct, playtests: l.playtests.length,
})));
writeRows('retries', levels.flatMap((l) => CREW.map((a) => ({ level: l.id, number: l.number, agent: a, retries: l.retries[a] }))));
writeRows('findings', findings.map((f) => ({
  check: f.check, must_fix: f.must_fix, suggestion: f.suggestion, total: f.must_fix + f.suggestion,
  levels: f.levels.length, recurring: f.recurring,
  main_agent: Object.entries(f.agents).sort((a, b) => b[1] - a[1])[0]?.[0]?.replace(/ \(.*\)$/, '') ?? null,
})));
writeRows('agents', agents.map((a) => ({
  agent: a.agent, steps: a.steps, retries: a.retries, levels_with_retries: a.levels_with_retries.length,
  tokens: a.tokens, latest_brief: a.brief_versions.at(-1) ?? null, brief_versions: a.brief_versions.length,
})));
writeRows('totals', [{ ...out.totals, suggestions_total: levels.reduce((s, l) => s + l.critiques.reduce((t, c) => t + c.suggestions, 0), 0), generated_at: out.generated_at }]);
const t = out.totals;
console.log(`pipeline health: ${t.levels} levels (${t.approved} approved), ${t.retries} retries, ${t.must_fix_total} must-fix findings over ${t.critique_rounds} critique rounds, playtests ${t.playtests_correct}/${t.playtests_total} correct, ${t.tokens} tokens logged`);
console.log(`written to ${path.relative(ROOT, dest)}`);
