# Assignment #5: Goal-Oriented Coding Agent

I built a goal-oriented feature agent for the game: `game/tools/feature-agent/` on the `game/prototype` branch. It works through a list of requirements taken from the game bible:

1. It finds the requirements the code doesn't meet yet.
2. It picks the most valuable one and has Claude Code write it.
3. It checks the result, then commits it.

It repeats this until every requirement is met. Before I built the agent, I used Claude Code in conversation to build a first set of features one at a time. Each section below covers the feature agent first, then those earlier features.

## How the feature agent works

1. **Requirements.** `requirements.json` holds 26 requirements. Each one quotes the bible and has:
   - a status taken from the bible (Locked, Proposed or Open)
   - an impact from 1 to 5, which I set
   - an effort score and its dependencies
   - a short spec, and detection rules
2. **Gap detection.** `scan()` checks each requirement's detection rules against the code: a file exists, a file contains a pattern, or a file no longer contains one. It uses no AI, so it's free and instant.
3. **Priority scoring.** `priority_score = (impact × status weight + 0.5 × missing features it unblocks) ÷ effort`. The status weights are Locked 2, Proposed 1 and Open 0.5. A requirement scores 0 while one of its dependencies is still missing.
4. **Code writing.** The top requirement's spec goes to Claude Code running headless (`claude -p`) inside `game/`. It can only use Read, Edit, Write, Glob and Grep, and has a spending cap per round.
5. **Checking and committing.** The round is kept only if all three checks pass:
   - only files in `game/` changed
   - the requirement is now detected
   - `npm run boot-test` passes

   A kept round is committed as `[feature_agent] <id>: <title>`. Otherwise the agent undoes it.
6. **Loop.** The agent rescans and repeats until nothing is missing.
   - If Claude's usage limit runs out mid-round, it undoes the half-finished work. It then either waits for the reset (`--resume-at`) or stops so I can rerun it later (`--on-limit stop`).
   - Every scan, score, write and check is logged in `feature_agent.log`.

## 1. What features did the agent build?

### The feature agent

20 rounds over 5 runs, $11.35 in total. All 26 requirements are now met. 9 of them describe the core game that was already built, so the agent's first scan confirmed those.

| Run (Nov 2026) | Features built | Rounds | Cost |
| --- | --- | --- | --- |
| 12 Nov, first real run | A first credits file for the music | 1 | $0.30 |
| 13 Nov, full run | **Credits file** generated from the music folder; **Credits screen**; **background music** from the credited tracks; **Music on/off** in Options; **star totals** and progress; **chapter intro cards** using the bible's calendar; **How to play** before level 1; **Reset progress**; **city map menu**; **keyboard play** on every screen; **Friends page** | 11 | $7.48 |
| 13 Nov, my first review | Chapter card shown before How to play; speaker icon with a slash when muted; game and tools read the new `assets/` folders; new friend cards with one line per friend (Liam, then Cyrus, in level 1) | 4 | $2.07 |
| 13 Nov, second review | White slash on the muted speaker; volume panel closes when you click outside it | 2 | $0.70 |
| 13 Nov, third review | Slash in the speaker button's border colour; Esc closes only the volume panel | 2 | $0.80 |

## 2. Why did the agent pick these features?

### The feature agent

The order came from `priority_score`, and the log records every round's ranking. I set each feature's impact, and its status comes from the bible. Claude Code drafted the effort scores and dependencies, and I approved them. The agent's formula then decided the order:

1. **Credits file first (score 5.5).** The audio rules are Locked in the bible, the impact is 5, and two other missing features (the Credits screen and the music player) needed it.
2. **Credits screen (5) and the music player (3.5).** The player needed more work (effort 3), which lowered its score.
3. **Music on/off jumped to 10** as soon as the player existed: Locked, impact 5 and effort 1.

**Proposed features.**

4. Star totals (3.5): cheap, and the city map needed it.
5. Chapter cards, How to play and Reset progress, tied at 2.
6. City map and keyboard play (1).
7. Friends page last (0.33): an Open idea in the bible, impact 2 and effort 3.

**Review runs.**

8. Chapter card before How to play came first (4): impact 4, effort 1.
9. Then the muted slash (3), the `assets/` folders (2.5) and the friend card wording (2).
10. **The two small HUD runs.** Both change the same HUD so the second feature scored 0 until the first was in.

### Built with Claude Code in conversation (before the feature agent)

When first reading the assignment, I missed the part about the autonomous loop and added features through conversation with Claude. I asked for suggestions, and had Claude rank the ideas by working time to payout ratio. I ended up completing the whole list one at a time. Despite doing the assignment "wrong" the first time, I ended up with more features that helped polish the game (and would've eventually added anyways). It also helped me learn how tedious it felt and why the autonomous loop seems so streamlined - especially the part where we update the requirements.json instead of prompting the agent. This way there's a cleaner record of our wants list and it slightly saves on tokens.

These were the features added through conversation with Claude:

1. **Chat pacing and the clue recap** were its top picks: small changes to code that already existed, but they change how the game feels. The recap reuses the clue tags every chat line already has.
2. **Notebook stars** came from the Critic. I had the agent run the Critic on the new chat pacing, and it pointed out that the Notebook copied exactly the clue lines, which gave away implied clues.
3. **The Scrapbook and "Been here before"** use things the campaign already had: the bible's callbacks and the restaurants that come back in later levels. Both reward players who come back, which the bible says callbacks should do. Before building, the agent checked that levels 1–10 had enough of each to test with.
4. **The clue-depth check** turns a bible rule that nothing checked yet ("buried mid-conversation") into a cheap script that runs before the expensive agent steps.
5. **The Pipeline Health page** makes the agent crew's work visible. It also surfaced something I hadn't noticed: the critic raised only 1 must-fix across 19 rounds, and all the extra fix rounds came from suggestions I chose to act on.
6. **Sort/filter and accessibility** were on the original list for later chapters (chapter 4 has 7 restaurants per level) and to make the game easier to read and play.

## 3. What manual changes did I make before accepting the code?

- **Small changes went back through the agent.** I added or edited a requirement in `requirements.json` and reran the loop; that's where the last three runs came from. Examples:
  - showing the chapter card before How to play
  - the muted slash and its colour
  - controls to closing the volume panel (with an outside click or Esc)
  - wording on character cards 
- **Bigger fixes after the full run were made in conversation with Claude Code,** in one commit:
  - The credits now roll up slowly.
  - The agent's music player only ever played one song. It now shuffles all the tracks and loads one at a time.
  - A music volume slider is available on every screen.
  - The chapter 1 card didn't show again after a reset, because Reset progress didn't clear the "already seen" flags. It now does.
  - How to play now sits over a real level screen (instead of over the options page).
  - The menu now uses my City Map art.
  - The Outcome screen gets an "A new friend has joined!" card  
  - Friends page uses happy portraits (used neutral portraits before).  
  - Showing more than 'A new friend has joined!' card for the first level
