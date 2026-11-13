#!/usr/bin/env node
// Let's Eat! feature agent: a goal-oriented coding loop for the game.
//
//   1. Gap detection  scan() checks the code in game/ against requirements.json (what the GDD requires).
//   2. Priority       priority_score() orders the missing features.
//   3. Code writing   writeFeature() has Claude Code (headless) build the top missing feature.
//   4. Iteration      main() re-scans after every write and stops when every requirement is met,
//                     when a step fails, or after --max-rounds.
//
// Usage (from game/):
//   node tools/feature-agent/feature_agent.mjs --dry-run          scan + score + print the plan, write nothing
//   node tools/feature-agent/feature_agent.mjs --max-rounds 1     build the top missing feature, verify, commit
//   options: --budget <usd per round, default 3>  --model <model>
//            --resume-at 14:30   when the usage limit is hit and Claude's message gives no reset time, resume then
//            --max-pauses 3      how many usage-limit pauses before giving up
//            --on-limit stop     at the usage limit, undo the unfinished round and exit instead of waiting;
//                                run the agent again to continue (finished features are already committed)
// Usage limit: the agent undoes the files the unfinished round touched, waits until the limit resets (+1 min) and
// retries the same feature. Keep the computer awake while it waits.
// Needs the Claude Code CLI: on PATH as `claude`, set in CLAUDE_BIN, or the copy bundled with the VS Code extension.
// Every round is appended to tools/feature-agent/feature_agent.log (JSON lines).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..');
const REPO = path.resolve(GAME, '..');
const REQS = JSON.parse(fs.readFileSync(path.join(HERE, 'requirements.json'), 'utf8')).requirements;
const LOG = path.join(HERE, 'feature_agent.log');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const DRY = args.includes('--dry-run');
const MAX_ROUNDS = Number(opt('--max-rounds', 5));
const BUDGET = opt('--budget', '3');
const MODEL = opt('--model', null);
const RESUME_AT = opt('--resume-at', null); // e.g. 14:30 or 2:30pm: used when a limit message gives no reset time
const MAX_PAUSES = Number(opt('--max-pauses', 3));
const ON_LIMIT = opt('--on-limit', 'wait'); // wait: sleep until the reset, then resume; stop: undo the round and exit (code 3)

const log = (entry) => fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');

// ---------------------------------------------------------------- 1. gap detection

const read = (rel) => { try { return fs.readFileSync(path.join(GAME, rel), 'utf8'); } catch { return null; } };
const walk = (rel) => {
  const abs = path.join(GAME, rel);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((d) => {
    const r = path.join(rel, d.name);
    return d.isDirectory() ? walk(r) : /\.(m?js)$/.test(d.name) ? [r] : [];
  });
};

/** One detection rule: { file } exists, { contains, pattern } matches, { absent, pattern } matches nowhere in a folder. */
function checkRule(rule) {
  if (rule.file) return { ok: fs.existsSync(path.join(GAME, rule.file)), what: `file ${rule.file}` };
  if (rule.contains) {
    const text = read(rule.contains);
    return { ok: text !== null && new RegExp(rule.pattern).test(text), what: `${rule.contains} matches /${rule.pattern}/` };
  }
  if (rule.absent) {
    const re = new RegExp(rule.pattern);
    const hits = walk(rule.absent).filter((f) => re.test(read(f)));
    return { ok: hits.length === 0, what: `nothing in ${rule.absent} matches /${rule.pattern}/${hits.length ? ` (found in ${hits.join(', ')})` : ''}` };
  }
  return { ok: false, what: `unknown rule ${JSON.stringify(rule)}` };
}

/** Scan the codebase: which requirements are met, and which rules fail for the rest. */
export function scan() {
  return REQS.map((r) => {
    const results = r.detect.map(checkRule);
    return { ...r, met: results.every((x) => x.ok), failing: results.filter((x) => !x.ok).map((x) => x.what) };
  });
}

// ---------------------------------------------------------------- 2. priority scoring

const STATUS_WEIGHT = { Locked: 2, Proposed: 1, Open: 0.5 };

/**
 * Higher runs first. 0 = not ready (already met, or waiting on an unmet dependency).
 *   (impact × status weight + 0.5 × gaps it unblocks) ÷ effort
 * Locked GDD items outweigh Proposed ones; a cheap feature that unblocks others goes early.
 */
export function priority_score(req, scanned) {
  if (req.met) return 0;
  const byId = Object.fromEntries(scanned.map((r) => [r.id, r]));
  if ((req.depends || []).some((d) => !byId[d]?.met)) return 0;
  const unblocks = scanned.filter((r) => !r.met && (r.depends || []).includes(req.id)).length;
  const score = (req.impact * (STATUS_WEIGHT[req.status] ?? 1) + 0.5 * unblocks) / Math.max(1, req.effort);
  return Math.round(score * 100) / 100;
}

const plan = (scanned) => scanned.filter((r) => !r.met)
  .map((r) => ({ ...r, score: priority_score(r, scanned) }))
  .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

// ---------------------------------------------------------------- 3. code writing

/** The Claude Code CLI as { cmd, pre } (pre = arguments before ours). CLAUDE_BIN may also be a .js/.mjs stand-in for testing. */
function claudeBin() {
  const env = process.env.CLAUDE_BIN;
  if (env) return /\.m?js$/.test(env) ? { cmd: process.execPath, pre: [env] } : { cmd: env, pre: [] };
  const onPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
  if (onPath.status === 0 && onPath.stdout.trim()) return { cmd: onPath.stdout.trim().split(/\r?\n/)[0], pre: [] };
  const ext = path.join(os.homedir(), '.vscode', 'extensions');
  const found = fs.existsSync(ext) ? fs.readdirSync(ext).filter((d) => d.startsWith('anthropic.claude-code-')).sort().reverse() : [];
  for (const d of found) {
    const exe = path.join(ext, d, 'resources', 'native-binary', process.platform === 'win32' ? 'claude.exe' : 'claude');
    if (fs.existsSync(exe)) return { cmd: exe, pre: [] };
  }
  return null;
}

// ---- usage limits: pause, then resume when the limit resets

const LIMIT_RE = /usage limit|limit reached|rate[ -]?limit|too many requests|\b429\b|out of (?:tokens|usage)|quota/i;

/** The next time the local clock shows h:m (today, or tomorrow if that's past). */
export function nextLocal(h, m, now = new Date()) {
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

/** "14:30", "2:30pm", "2pm" -> { h, m }, or null. */
export function parseClock(s) {
  const x = String(s || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!x) return null;
  let h = Number(x[1]);
  const m = Number(x[2] || 0);
  if (x[3]) h = (h % 12) + (x[3].toLowerCase() === 'pm' ? 12 : 0);
  return h < 24 && m < 60 ? { h, m } : null;
}

/**
 * If an error says the usage limit was hit, when to resume: the reset time in the message
 * ("…|1731420600" epoch seconds, or "resets 2:30pm"), else --resume-at, else in an hour. null if it isn't a limit.
 */
export function limitReset(text, now = new Date(), resumeAt = null) {
  if (!LIMIT_RE.test(text || '')) return null;
  const epoch = String(text).match(/\|\s*(\d{10})\b/);
  if (epoch) return new Date(Number(epoch[1]) * 1000);
  const said = String(text).match(/resets?\s*(?:at\s*)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  const clock = parseClock(said?.[1]) || parseClock(resumeAt);
  return clock ? nextLocal(clock.h, clock.m, now) : new Date(now.getTime() + 60 * 60 * 1000);
}

function promptFor(req) {
  const done = req.detect.map((rule) => `- ${checkRule(rule).what}`).join('\n');
  return [
    `You are the feature agent for the Let's Eat! Phaser game. Your working folder is the game folder.`,
    `Read CLAUDE.md in this folder first and follow it. Build exactly this one missing requirement and nothing else.`,
    ``,
    `Requirement: ${req.id} — ${req.title}`,
    `From the GDD (docs/game_bible.md): ${req.bible}`,
    req.spec ? `What to build: ${req.spec}` : '',
    `It counts as done when all of these hold:`,
    done,
    ``,
    `Rules:`,
    `- Only change files in this folder. Never add network calls or runtime AI calls (the GDD forbids them).`,
    `- Match the existing code style; use the theme helpers (text, pixel, readText, C) and tween() from src/ui/motion.js for any animation.`,
    `- The harness will run "npm run boot-test" after you finish; keep every scene booting without console errors.`,
    `- Add one bullet for this feature to the "Decisions taken in the prototype" list in CLAUDE.md, ending with "(feature agent, ${new Date().toISOString().slice(0, 10)})".`,
    `When you are done, reply with one short paragraph naming the files you changed.`,
  ].filter((l) => l !== '').join('\n');
}

/** Have Claude Code (headless) write the code for one requirement. */
function writeFeature(req) {
  const bin = claudeBin();
  if (!bin) return { ok: false, error: 'Claude Code CLI not found (set CLAUDE_BIN)' };
  const cli = [...bin.pre, '-p', promptFor(req), '--output-format', 'json', '--permission-mode', 'acceptEdits',
    '--max-budget-usd', String(BUDGET), '--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep'];
  if (MODEL) cli.push('--model', MODEL);
  const run = spawnSync(bin.cmd, cli, { cwd: GAME, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60 * 1000 });
  let out = null;
  try { out = JSON.parse(run.stdout); } catch { /* not JSON */ }
  if (run.status !== 0 || !out || out.is_error) {
    const error = (out?.result || [run.stdout, run.stderr].filter(Boolean).join('\n') || run.error?.message || `exit ${run.status}`).slice(0, 800);
    return { ok: false, error, cost: out?.total_cost_usd, resumeAt: limitReset(error, new Date(), RESUME_AT) };
  }
  return { ok: true, summary: out.result, cost: out.total_cost_usd, turns: out.num_turns, usage: out.usage };
}

// ---------------------------------------------------------------- verification helpers

const git = (...a) => spawnSync('git', a, { cwd: REPO, encoding: 'utf8' });
const changedFiles = () => git('status', '--porcelain', '--untracked-files=all').stdout.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''));
/** git status as a map: path -> status code ("??" = untracked). */
const statusMap = () => new Map(git('status', '--porcelain', '--untracked-files=all').stdout.split('\n').filter(Boolean)
  .map((l) => [l.slice(3).replace(/^"|"$/g, ''), l.slice(0, 2)]));

/**
 * Undo a half-finished write: only files in game/ that changed since `before` (a statusMap taken just before the
 * write), and never anything in the agent's own folder. Anything already uncommitted before the write is left alone.
 */
function discardPartial(before) {
  const undone = [];
  for (const [f, code] of statusMap()) {
    if (!f.startsWith('game/') || f.startsWith('game/tools/feature-agent/') || before.has(f)) continue;
    if (code === '??') fs.rmSync(path.join(REPO, f), { force: true });
    else git('checkout', '--', f);
    undone.push(f);
  }
  return undone;
}

const fmtTime = (d) => d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
/** Wait until a time, saying how long is left now and then. */
async function sleepUntil(when) {
  for (;;) {
    const left = when.getTime() - Date.now();
    if (left <= 0) return;
    console.log(`  paused: ${Math.ceil(left / 60000)} min until ${fmtTime(when)}`);
    await new Promise((r) => setTimeout(r, Math.min(left, 15 * 60 * 1000)));
  }
}

const bootTest = () => {
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'boot-test'], { cwd: GAME, encoding: 'utf8', shell: process.platform === 'win32', timeout: 15 * 60 * 1000 });
  return { ok: r.status === 0, tail: `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-6).join('\n') };
};

// ---------------------------------------------------------------- 4. iteration loop

function printScan(scanned) {
  for (const r of scanned) console.log(`  ${r.met ? '✓' : '✗'} ${r.id.padEnd(30)} ${r.met ? '' : r.failing[0] || ''}`);
}

async function main() {
  console.log(`feature agent: ${REQS.length} requirements from the GDD${DRY ? ' (dry run)' : `, up to ${MAX_ROUNDS} round(s), $${BUDGET} per round`}`);
  let pauses = 0;
  const before = changedFiles().filter((f) => !f.startsWith('game/tools/feature-agent/'));
  if (!DRY && before.length) {
    console.log(`stop: uncommitted changes would mix with the agent's work:\n  ${before.join('\n  ')}`);
    return 1;
  }
  for (let round = 1; ; round++) {
    const scanned = scan();
    const todo = plan(scanned);
    console.log(`\nround ${round}: scan — ${scanned.length - todo.length} met, ${todo.length} missing`);
    printScan(scanned);
    if (!todo.length) { log({ round, event: 'done', met: scanned.length }); console.log('\nall requirements met. stopping.'); return 0; }
    console.log('\npriority:');
    for (const r of todo) console.log(`  ${String(r.score).padStart(5)}  ${r.id}${r.score === 0 ? '  (waiting on ' + r.depends.filter((d) => !scanned.find((s) => s.id === d)?.met).join(', ') + ')' : ''}`);
    const next = todo[0];
    log({ round, event: 'scan', missing: todo.map((r) => ({ id: r.id, score: r.score })), next: next.score > 0 ? next.id : null });
    if (next.score === 0) { console.log('\nstop: every missing requirement is waiting on another.'); return 1; }
    if (DRY) { console.log(`\ndry run: next would be "${next.id}". nothing written.`); return 0; }
    if (round > MAX_ROUNDS) { console.log(`\nstop: reached --max-rounds ${MAX_ROUNDS}; next would be "${next.id}".`); return 0; }

    console.log(`\nround ${round}: writing "${next.id}" with Claude Code…`);
    let w;
    for (;;) {
      const beforeWrite = statusMap();
      w = writeFeature(next);
      log({ round, event: 'write', id: next.id, ok: w.ok, cost_usd: w.cost ?? null, turns: w.turns ?? null, error: w.error, summary: w.summary });
      if (w.ok || !w.resumeAt) break;
      // --on-limit stop: undo what this attempt half-wrote and stop; running the agent again continues from here.
      if (ON_LIMIT === 'stop') {
        const undone = discardPartial(beforeWrite);
        log({ round, event: 'paused', id: next.id, mode: 'stop', reset: w.resumeAt.toISOString(), undone });
        console.log(`\npaused: usage limit reached while writing "${next.id}" (${w.error.split('\n')[0]}).`);
        if (undone.length) console.log(`  undid unfinished edits: ${undone.join(', ')}`);
        console.log(`  the limit resets around ${fmtTime(w.resumeAt)}. run the agent again to continue; finished features are already committed.`);
        return 3;
      }
      // Usage limit: undo what this attempt half-wrote, wait for the reset (+1 min), then try the same requirement again.
      if (pauses >= MAX_PAUSES) { console.log(`stop: hit the usage limit ${pauses + 1} times (--max-pauses ${MAX_PAUSES}).`); return 1; }
      pauses++;
      const until = new Date(w.resumeAt.getTime() + 60 * 1000);
      const undone = discardPartial(beforeWrite);
      console.log(`  usage limit reached: ${w.error.split('\n')[0]}`);
      if (undone.length) console.log(`  undid unfinished edits: ${undone.join(', ')}`);
      log({ round, event: 'paused', id: next.id, until: until.toISOString(), undone });
      await sleepUntil(until);
      log({ round, event: 'resumed', id: next.id });
      console.log(`  resumed at ${fmtTime(new Date())}; trying "${next.id}" again…`);
    }
    if (!w.ok) { console.log(`stop: the write step failed: ${w.error}`); return 1; }
    console.log(`  ${w.summary}\n  cost: $${(w.cost ?? 0).toFixed(2)}, ${w.turns} turns`);

    // Verify: only game/ changed, the requirement now passes, and the game still boots.
    const outside = changedFiles().filter((f) => !f.startsWith('game/'));
    const now = scan().find((r) => r.id === next.id);
    const boot = bootTest();
    log({ round, event: 'verify', id: next.id, outside, met: now.met, failing: now.failing, boot_test: boot.ok });
    if (outside.length) { console.log(`stop: files outside game/ changed: ${outside.join(', ')}`); return 1; }
    if (!now.met) { console.log(`stop: "${next.id}" still not met: ${now.failing.join('; ')}`); return 1; }
    if (!boot.ok) { console.log(`stop: boot test failed after "${next.id}":\n${boot.tail}`); return 1; }

    git('add', '-A', 'game');
    const msg = `[feature_agent] ${next.id}: ${next.title}\n\nBuilt by the feature agent (round ${round}, priority ${next.score}) with Claude Code headless.\nVerified: requirement detected in the code, npm run boot-test passed.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
    const c = git('commit', '-q', '-m', msg);
    log({ round, event: 'commit', id: next.id, ok: c.status === 0 });
    console.log(c.status === 0 ? `  committed "${next.id}". re-scanning…` : `stop: commit failed: ${c.stderr}`);
    if (c.status !== 0) return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then((code) => process.exit(code));
