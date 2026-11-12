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

// ---------- exact tokens from Claude Code session transcripts ----------
// Claude Code keeps every session (and each subagent run) as JSONL under ~/.claude/projects/<project slug>/.
// Each API call there carries its usage. We count each call once (one call can span several lines) and split
// it into new input, cache writes, cache reads and output. Subagent runs are exact; the Orchestrator's own
// calls are given to a level by time (its window in run_log, first entry to approval), so they're estimates.
// Set LETS_EAT_TRANSCRIPTS to another folder if the transcripts live elsewhere. Without them, run_log tokens are used.
const os = require('os');
const slug = ROOT.replace(/[^A-Za-z0-9]/g, '-');
const TRANSCRIPTS = process.env.LETS_EAT_TRANSCRIPTS || path.join(os.homedir(), '.claude', 'projects', slug);
const AGENT_OF = { 'puzzle-architect': 'puzzle_architect', 'narrative-writer': 'narrative_writer', 'map-seeder': 'map_seeder', critic: 'critic', 'blind-playtester': 'blind_playtester' };
const zero = () => ({ input: 0, cache_write: 0, cache_read: 0, output: 0, calls: 0 });
const addUsage = (t, u) => { t.input += u.input_tokens || 0; t.cache_write += u.cache_creation_input_tokens || 0; t.cache_read += u.cache_read_input_tokens || 0; t.output += u.output_tokens || 0; t.calls++; };
const readJsonl = (p) => fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const usageCalls = (lines) => {
  const m = new Map();
  for (const l of lines) if (l.type === 'assistant' && l.message?.usage) m.set(l.message.id || l.uuid, { usage: l.message.usage, at: l.timestamp });
  return [...m.values()];
};
// Bucket for a subagent run, from its description (the prompt can mention other levels).
const bucketOf = (desc) => {
  if (/outline/i.test(desc)) return 'campaign_outline';
  if (/levels?\s*\d\d\s*[-–]\s*\d\d/i.test(desc)) return 'retrofit_callbacks';
  return desc.match(/level_\d\d/)?.[0] || 'other';
};
// Level windows for the Orchestrator estimate.
const windows = levelIds.map((id) => {
  const ts = runLog.filter((e) => e.level === id).map((e) => e.timestamp).sort();
  const appr = runLog.filter((e) => e.level === id && e.step === 'approval').map((e) => e.timestamp).sort();
  return { id, from: ts[0], to: appr[0] || ts.at(-1) };
}).filter((w) => w.from);
const windowOf = (at) => windows.filter((w) => at >= w.from && at <= w.to).sort((a, b) => (a.from < b.from ? 1 : -1))[0]?.id || 'other';

const tokenRows = []; // {bucket, agent, kind, input, cache_write, cache_read, output, calls, runs}
let tokensSource = 'run_log';
if (fs.existsSync(TRANSCRIPTS)) {
  tokensSource = 'transcripts';
  const acc = new Map();
  const bump = (bucket, agent, kind, u, run) => {
    const k = `${bucket}|${agent}|${kind}`;
    const t = acc.get(k) || { bucket, agent, kind, ...zero(), runs: new Set() };
    addUsage(t, u);
    if (run) t.runs.add(run);
    acc.set(k, t);
  };
  for (const s of fs.readdirSync(TRANSCRIPTS)) {
    const sub = path.join(TRANSCRIPTS, s, 'subagents');
    if (!fs.existsSync(sub)) continue;
    let crew = false;
    for (const f of fs.readdirSync(sub).filter((x) => x.endsWith('.jsonl'))) {
      const metaPath = path.join(sub, f.replace(/\.jsonl$/, '.meta.json'));
      const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
      const agent = AGENT_OF[meta.agentType];
      if (!agent) continue; // not a crew agent (e.g. Explore)
      crew = true;
      for (const c of usageCalls(readJsonl(path.join(sub, f)))) bump(bucketOf(meta.description || ''), agent, 'subagent', c.usage, f);
    }
    // The main session of a session that ran the crew is the Orchestrator.
    const main = path.join(TRANSCRIPTS, `${s}.jsonl`);
    if (crew && fs.existsSync(main)) {
      for (const c of usageCalls(readJsonl(main))) bump(windowOf(c.at), 'orchestrator', 'orchestrator_estimated', c.usage, null);
    }
  }
  for (const t of acc.values()) tokenRows.push({ ...t, runs: t.runs.size, total: t.input + t.cache_write + t.cache_read + t.output });
} else {
  for (const e of runLog.filter((x) => x.tokens != null)) {
    tokenRows.push({ bucket: e.level, agent: e.agent_id, kind: 'run_log', input: 0, cache_write: 0, cache_read: 0, output: 0, calls: 0, runs: 1, total: e.tokens });
  }
}
const tokOf = (bucket) => {
  const rows = tokenRows.filter((r) => r.bucket === bucket);
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  return { total: sum('total'), output: sum('output'), new_input: sum('input') + sum('cache_write'), cache_read: sum('cache_read'),
    subagent_total: rows.filter((r) => r.kind === 'subagent').reduce((s, r) => s + r.total, 0) };
};
for (const l of levels) l.tok = tokOf(l.id);

// ---------- cast and brief versions ----------
const cast = levels.flatMap((l) => readJson(`content/levels/${l.id}/spec_${l.id}.json`).guests.map((g) => ({ level: l.id, number: l.number, chapter: l.chapter, character: g })));
const vnum = (v) => Number(String(v).replace(/^v/, '')) || 0;
const briefs = [];
for (const a of [...CREW, 'orchestrator']) {
  const e = runLog.filter((x) => x.agent_id === a && x.brief_version).sort((x, y) => (x.timestamp < y.timestamp ? -1 : 1));
  const byV = new Map();
  for (const x of e) {
    const b = byV.get(x.brief_version) || { agent: a, version: x.brief_version, n: vnum(x.brief_version), first_at: x.timestamp, first_level: x.level, last_at: x.timestamp, steps: 0 };
    b.last_at = x.timestamp; b.steps++;
    byV.set(x.brief_version, b);
  }
  briefs.push(...[...byV.values()].sort((x, y) => x.n - y.n));
}

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
  steps: l.steps, retries: l.total_retries,
  tokens: l.tok.total, tokens_output: l.tok.output, tokens_new_input: l.tok.new_input, tokens_cache_read: l.tok.cache_read,
  tokens_subagents: l.tok.subagent_total, tokens_run_log: l.tokens, tokens_logged: l.tokens_logged,
  playtest_difficulty: l.playtests.length && l.playtests.every((r) => typeof r.difficulty === 'number')
    ? Math.round((l.playtests.reduce((s, r) => s + r.difficulty, 0) / l.playtests.length) * 10) / 10 : null,
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
writeRows('agents', agents.map((a) => {
  const rows = tokenRows.filter((r) => r.agent === a.agent);
  return {
    agent: a.agent, steps: a.steps, retries: a.retries, levels_with_retries: a.levels_with_retries.length,
    runs: rows.reduce((s, r) => s + r.runs, 0), tokens: tokensSource === 'transcripts' ? rows.reduce((s, r) => s + r.total, 0) : a.tokens,
    tokens_output: rows.reduce((s, r) => s + r.output, 0),
    latest_brief: a.brief_versions.at(-1) ?? null, brief_versions: a.brief_versions.length,
  };
}));
const tsum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
const sub = tokenRows.filter((r) => r.kind === 'subagent');
writeRows('totals', [{
  ...out.totals,
  suggestions_total: levels.reduce((s, l) => s + l.critiques.reduce((t, c) => t + c.suggestions, 0), 0),
  tokens_source: tokensSource,
  tokens_all: tsum(tokenRows, 'total'), tokens_output: tsum(tokenRows, 'output'),
  tokens_new_input: tsum(tokenRows, 'input') + tsum(tokenRows, 'cache_write'), tokens_cache_read: tsum(tokenRows, 'cache_read'),
  tokens_subagents: tsum(sub, 'total'), subagent_runs: sub.reduce((s, r) => s + r.runs, 0),
  tokens_orchestrator: tsum(tokenRows.filter((r) => r.agent === 'orchestrator'), 'total'),
  generated_at: out.generated_at,
}]);
const chapterOf = Object.fromEntries(levels.map((l) => [l.id, l.chapter]));
writeRows('tokens', tokenRows.map((r) => ({
  bucket: r.bucket, chapter: chapterOf[r.bucket] ?? null, agent: r.agent, kind: r.kind, runs: r.runs, calls: r.calls,
  new_input: r.input + r.cache_write, cache_read: r.cache_read, output: r.output, total: r.total,
})).sort((a, b) => (a.bucket + a.agent < b.bucket + b.agent ? -1 : 1)));
writeRows('cast', cast);
writeRows('briefs', briefs);
const t = out.totals;
console.log(`pipeline health: ${t.levels} levels (${t.approved} approved), ${t.retries} retries, ${t.must_fix_total} must-fix findings over ${t.critique_rounds} critique rounds, playtests ${t.playtests_correct}/${t.playtests_total} correct, ${t.tokens} tokens logged`);
console.log(`written to ${path.relative(ROOT, dest)}`);
