# Assignment #7: Complete AI Dev Pipeline

## DELIVERABLE 1: PLAYABLE LINK

Playable Game Link: https://peculiarium.itch.io/lets-eat

## Deliverable 2: Pipeline Source Code & Engine Integration

Pipeline Run Video Link: https://youtu.be/fKhoMp44wyU

## Integration Breakdown

### **Target Game Engine:** Phaser

### Automated Flow Description

The agents write plain JSON in the exact shape the game reads, so there is no export or copy step between the crew and the Phaser game. A level merged into `master` is playable the next time the game starts.

1. **One shared format.** The bible defines each file's fields: `spec_`, `dialogue_`, `outcomes_` and `venues_level_XX.json`, plus the district registries and `ending.json`. The agents write to that format, and `validate.js` rejects anything that breaks it before a level can be approved.
2. **The game reads the crew's folders directly.** `game/src/content.js` uses Vite's `import.meta.glob` to bundle every file in `content/levels/`, `content/registry/` and `content/campaign/ending.json`, plus `scripts/rules.json`. No one copies or reformats anything.
3. **One loader turns the files into a level.** `buildLevels()` (`game/src/logic/levels.js`) groups the four files by level id, joins each venue to its registry entry, and returns ready-to-play levels. A broken or half-finished level is skipped with a clear message instead of crashing the game.
4. **The scenes use the fields as they are.** For example:
   - Each chat line's `speaker` and `emotion` choose the portrait.
   - Its `clue` tag drives the Notebook and the clue recap.
   - Its `callback` unlocks a Scrapbook page.
   - The spec's `solution_id` and decoy reasons score the pick and choose the Outcome reaction.
5. **Art and sound follow the same idea.**
   - `slice_portraits.py` cuts the art and writes `asset_manifest.json`, which the Boot scene loads by key.
   - `sync_assets.mjs` copies the music and sound effects in before every run, build and test.
6. **It's checked automatically.** `npm run boot-test` loads every level through the same loader and scoring code the game uses, then boots the real game in a headless browser and opens each level's chat, results and outcomes. Integration (`integrate.js`) runs this check, and the feature agent only keeps a change if it passes.

Game code takes the same path. The feature agent writes straight into `game/src/`, checks that the requirement is now met, runs the boot test, and commits. The bug hunters then play the result in a real browser, and their findings go back into `requirements.json`.

## DELIVERABLE 3: PIPELINE AUDIT & COST ANALYSIS

Let's Eat! was built by a pipeline of AI agents with me as the approver. This audit looks at what each part of that pipeline cost, where the money and tokens went, what was wasted, and what I would change. It covers 3–25 November 2026: 20 levels, the ending, the game's features, two bug hunts, the art drafts and the trailer.

## Where the numbers come from

| Source | What it records |
| --- | --- |
| `logs/run_log.json` | 571 content-pipeline steps (one per agent run, check or approval), with retries. 296 of them also record the agent's tokens. |
| `logs/pipeline_health.json` | A snapshot from 12 November (levels 1–10), with token totals taken from the session transcripts, including the orchestrator's own session. |
| `game/tools/feature-agent/feature_agent.log` | Every feature agent round, with its dollar cost as reported by Claude Code headless. |
| `logs/bughunt/` | Both bug hunt runs: 7 reports per run. |
| `logs/pixellab_drafts.json`, `logs/gemini_prompts_progress.json` | The art drafts. |

**One limit up front:** the content crew and the bug hunts ran inside a Claude Code subscription, so they have token counts but no dollar bill. The feature agent ran headless, so it reports a dollar cost for each round. This audit gives dollars where they exist and tokens elsewhere, and doesn't convert one into the other.

## The pipeline at a glance

| Stage | Who does it | AI? | How it's measured |
| --- | --- | --- | --- |
| Campaign outline, level specs | Puzzle Architect | Yes | Tokens |
| Chat, outcomes, venues | Narrative Writer, Map Seeder | Yes | Tokens |
| Rules check | `validate.js` | No | Free |
| Quality review | Critic | Yes | Tokens |
| Playtest (3 runs per level) | Blind Playtester | Yes | Tokens |
| Cross-level check, lineage | `integrate.js`, `provenance.js` | No | Free |
| Game features and fixes | Feature agent (Claude Code headless) | Yes | Dollars |
| Bug hunting | 7 bug-hunter agents | Yes | Tokens |
| Draft art | PixelLab (badges), Gemini app (outcomes, by hand) | Yes | Free credits and my time |
| Approval at every stage | Me | No | My time |

## Cost by stage

### 1. Content crew: about 7.9 million logged agent tokens

| Agent | Logged runs | Tokens | Share |
| --- | --- | --- | --- |
| Narrative Writer | 61 | 2,231,313 | 28% |
| Blind Playtester | 146 | 2,029,247 | 26% |
| Critic | 32 | 1,597,671 | 20% |
| Map Seeder | 33 | 1,135,818 | 14% |
| Puzzle Architect | 23 | 873,488 | 11% |
| Art Generator | 1 | 48,322 | 1% |
| **Total** | **296** | **7,915,859** | |

**Levels cost more as the game grew.** Level 1 used 118k tokens. Chapter 3 and 4 levels used 580k–680k each, for three reasons:
- **More to write.** Later levels have up to 7 venues, each with reviews and an outcome reaction.
- **More to keep consistent.** Every new level is checked against everything before it, so the Critic reads more each time.
- **More retries.** Levels 8, 12, 13 and 14 each needed 6–7 retried steps.

**The orchestrator was the hidden cost.** The 12 November snapshot (levels 1–10) counted every token in the session transcripts:

| | Tokens |
| --- | --- |
| Subagents (the crew) | 10.2 million |
| Orchestrator session | 201.7 million |
| of which cache reads | 205.0 million (of 212 million in total) |
| Output tokens | 1.25 million |

The crew's own work was a small slice of the total. Most tokens were the orchestrator re-reading its long conversation, the bible and the logs on every turn. Cache reads are much cheaper than new input, so this costs less than the raw count suggests. It still uses up usage limits, and it grows with the length of the session.

### 2. Feature agent: $67.51 for 87 requirements

| Date | Rounds | Cost | What it built |
| --- | --- | --- | --- |
| 12 Nov | 1 | $0.30 | First credits file |
| 13 Nov | 19 | $11.05 | Credits, music, Options, star totals, intros, map, keyboard play, Friends page |
| 23 Nov | 25 | $15.73 | Second round of game features and polish |
| 24 Nov | 55 | $40.42 | Ending rules, Results keys, and 41 fixes from the two bug hunts |
| **Total** | **100** | **$67.51** | 97 rounds committed |

- **Per round:** $0.68 on average, and about 17 Claude turns.
- **Reliability:** 97 of 100 rounds passed every check and were committed. One failure was a flaky boot test, not a real problem (see below).
- **Bug fixes:** fixing 41 bugs from two bug hunts cost about $40, under $1 per bug, each one tested and committed separately.

### 3. Bug hunts: about 0.9 million tokens per run

There were two runs of 7 agents each, all running at the same time on separate ports. Run 2 used 101k–156k tokens per agent, about 907k in total. Each agent took 11–19 minutes.

| Run | Bugs found | Majors | Result |
| --- | --- | --- | --- |
| 1 (final draft) | 31 | 8 | All turned into requirements and fixed |
| 2 (after fixes) | 16 new | 0 | 28 of the 31 run 1 bugs confirmed fixed |

### 4. Art: $0, paid for in my time

- **PixelLab (badges and icons):** 40 drafts on free credits, $0 spent. The script stopped itself when the credits ran out, as designed, and nothing was lost.
- **Outcome illustrations:** Nano Banana 2's API has no free tier for images, so the Art Generator wrote the prompts and I made the images by hand in the free Nano Banana 2. All 20 levels are done. This had no API cost, but it was the most manual part of the whole pipeline.
- **Trailer:** recorded and edited inside Chrome with scripts, with no extra tools and no cost.

## Audit findings

### What worked

1. **Free checks run before paid ones.** The Validator, Integration and the feature agent's gap scan are plain scripts. They catch broken files before any AI review runs, so the Critic and Playtesters never spend tokens on a level that would fail the rules anyway.
2. **Failures go back to one agent, not the whole crew.** A failing file goes back only to the agent that wrote it. 73 of 571 steps were retries, and none of them meant rebuilding a whole level.
3. **Usage limits are handled.** When the 5-hour limit hit mid-round, the feature agent undid the half-finished change and stopped cleanly. Re-running it carried on from where it left off.
4. **Every AI change is checked before it counts.** The boot test plays every level in a real browser, so a feature agent round can't break the game and still get committed.

### Where money and tokens were wasted

| Problem | Cost | Cause |
| --- | --- | --- |
| Feature agent rebuilt features that already worked | 13 repeat rounds, $7.27 (11% of feature agent spend) | About 9 rounds came from detection rules that looked for exact code text. When one fix changed how keys are registered, older checks no longer matched, so the agent "rebuilt" working features. The other repeats were deliberate changes I asked for. |
| One false boot-test failure | One round stopped, then re-checked by hand | The browser boot test timed out once. It passed on the next run. |
| Orchestrator context | Most of the total tokens | One long session per batch of levels, re-reading its whole history on every turn. |
| Token logging gaps | Can't put an exact cost on the content crew | Only 296 of 571 steps logged tokens. Scripts don't need to, but some agent steps were logged as `null`. |
| Playtests on easy levels | About 2 million tokens in total | Every level gets 3 playtests, even early levels that scored 3/3 every time. They're cheap per run, but they add up. |

## Recommendations

1. **Write detection rules about behaviour, not exact code text.** Have rules check that a key is bound by any means (a pattern for either form), or better, have them run a small test. This alone would have saved most of the $7.27.
2. **Start a fresh orchestrator session for each level.** The bible and the logs give it everything it needs, so a new session per level would cut most of the cache-read volume.
3. **Retry a failed boot test once automatically** before stopping the run, so one timeout doesn't halt the loop.
4. **Log tokens for every agent step**, plus a cost estimate, so the content crew can be costed in dollars like the feature agent.
5. **Scale playtests to difficulty.** Run 2 playtests on early "stated clue" levels and add the third only on a split result. Keep 3 for the later, harder levels.
6. **Use a cheaper model where judgement is light.** The Playtester and the bug hunters mainly follow scripts and report, so a smaller model could do much of that work. Keep the strongest model for the Narrative Writer, Critic and Puzzle Architect, where quality matters most.

## Bottom line

The pipeline produced 20 playtested levels, an ending, a full feature set and two bug hunts:
- **Money:** $67.51 for all the game code, $0 for art and the trailer.
- **Tokens:** about 8 million agent tokens for the content, plus a much larger but mostly cached orchestrator overhead.
- **Biggest saving available:** shorter orchestrator sessions.
- **Biggest avoidable waste:** detection rules tied to exact code text.
- **Highest human cost:** the art. Making images by hand and approving every pick took more of my time than any other stage, and that was my choice: I wanted a say in every image.

