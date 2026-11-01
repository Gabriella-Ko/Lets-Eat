# Let's Eat! — agent crew

## What game is this crew for?

**Let's Eat!** is a cozy deduction puzzle game for the web, built in Phaser 3. The player is a map assistant reading a group chat between six friends (Maya, Liam, Mina, Roxy, Cyrus and Brooke) and recommending the one restaurant that suits everyone's cravings, allergies, budget and vibe. The campaign has 20 levels across 4 chapters, each set in a different neighbourhood of a fictional city, and every pick earns 0–3 stars.

## What does the crew produce?

The crew produces the game's **content**, not its code. Everything it makes is a static file that the game loads at startup, so the finished game never calls an AI.

| Output | Made by | Used by |
| --- | --- | --- |
| `campaign_outline.json`: the plan for all 20 levels | Puzzle Architect | Every level build |
| `spec_level_XX.json`: each level's answer, decoys and rules | Puzzle Architect | Writer, Seeder, Validator |
| `dialogue_level_XX.json`: the group chat, with clue tags | Narrative Writer | ChatScene and the Notebook sidebar |
| `outcomes_level_XX.json`: reactions to every possible pick | Narrative Writer | OutcomeScene |
| `venues_level_XX.json` + `venue_registry_<district>.json`: restaurant cards and reviews | Map Seeder | ResultsListScene |
| `asset_manifest.json` + processed portraits and icons | Art Asset Agent | BootScene (preloading) |
| Validation, playtest and integration reports | Validator, Blind Playtester, Integration | The Orchestrator and Gabriella |
| `run_log.json` + `provenance_manifest.json` | Orchestrator, Provenance | Reviewing cost and who made what |

**Not produced by the crew:** the Phaser game code (built by Gabriella with Claude Code), music (hand-picked from Bensound and Pixabay) and source art (supplied by Gabriella or an image tool).

## Where each file goes
Drop this whole folder into the root of your game project (the folder you open Claude Code in).

| File | What it is | How Claude Code uses it |
| --- | --- | --- |
| `CLAUDE.md` | Orchestrator brief | Claude Code reads it automatically at the start of every session, so your main session *is* the Orchestrator |
| `.claude/agents/*.md` | Subagent briefs (Architect, Writer, Seeder, Playtester, Art) | Auto-detected as project subagents; see them with `/agents` |
| `docs/specs/*.md` | Specs for the Validator, Integration and Provenance scripts | Ask Claude Code to build each script from its spec |
| `docs/game_bible.md` | Placeholder | Replace with the Markdown export of the game bible doc |
| `content/levels/level_01/` | Gold-standard level 1 | Style reference for every agent |
| `content/registry/venue_registry_campus.json` | Starter venue registry | The Seeder reuses and extends it |
| `content/campaign/campaign_outline.json` | Outline template | The Architect fills all 20 rows |
| `logs/playtest_level_01_run1.example.json` | Example playtest report | Shows the Playtester's output format |

## First run, in order
1. Export the game bible doc as Markdown and save it over `docs/game_bible.md`.
2. Open Claude Code in the project folder and run `/agents` to confirm the five subagents appear.
3. Say: "Build scripts/validate.js and scripts/rules.json from docs/specs/validator.md."
4. Say: "Validate level_01." The gold level must pass. If it doesn't, fix the script or the rule, not the level.
5. Say: "Plan the campaign." Review and approve the outline.
6. Say: "Build level_02." Then repeat per level.

## What makes level 1 the gold standard
- 2 guests, 4 venues, stated clues: matches the chapter 1 row.
- One hard trap (Satay Spot: peanuts), two near misses (Noodle Cellar: no patio; Pizza Corner: wrong craving).
- Every decoy is a minimal pair of Noodle Nook: exactly one attribute differs.
- Every scoring constraint has a tagged chat line; reviews hint at tags without naming them.
- No budget limit here, since Maya isn't a guest; level 2 is a good place to introduce Maya and her budget.
