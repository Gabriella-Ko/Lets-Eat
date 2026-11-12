# Let's Eat! — Game code

Brief for Claude Code sessions building the Phaser game on the `game/prototype` branch (worktree `Lets-Eat-game`).
The Orchestrator role in the root `CLAUDE.md` does not apply here.

## Ground rules
- `docs/game_bible.md` is the source of truth for scoring, emotions, art names and tone. If the code and the bible disagree, the bible wins; if something isn't in the bible, ask Gabriella.
- `content/`, `scripts/`, `logs/`, `docs/` and `.claude/agents/` are **read-only** here. They belong to the content crew. If content looks wrong, report it; never patch it from the game side.
- The game reads content directly: `content/levels/*/`, `content/registry/*.json` and `scripts/rules.json` (the Validator's tag map and scoring thresholds). New levels arrive by merging `master` into `game/prototype`, with no copy step.
- No runtime AI calls, no network fetches: everything is bundled at build time.

## Layout
```
game/
  index.html, vite.config.js, package.json
  src/main.js                  Phaser config, exposes window.__game (used by tests)
  src/content.js               bundles the content files (import.meta.glob)
  src/logic/levels.js          raw files -> level models (pure, shared with tests)
  src/logic/scoring.js         bible scoring rules (pure, shared with tests)
  src/ui/                      theme, buttons, placeholder art, scroll areas
  src/scenes/                  Boot -> Menu -> Chat -> Results -> Outcome
  test/boot-test.mjs           Node: game scoring must agree with every outcomes file
  test/browser-boot.mjs        headless Chrome/Edge: every scene boots for every level
```

## Commands (from `game/`)
- `npm run dev`: dev server. Add `?all` to unlock every level. These URL shortcuts work only on the dev server; a built game ignores them, so locked levels stay hidden.
  Jump to a scene: `?scene=Chat|Results|Outcome&level=level_03[&venue=<id>][&highlight=craving][&revealAll]`.
- `npm run build`: production build into `game/dist/`.
- `npm run boot-test`: both tests. Root `npm run boot-test` calls this; it is Integration's check 5
  (`LETS_EAT_LEVELS=level_01,level_02 ...` limits and orders the levels). Needs Chrome or Edge installed.

Run `npm run boot-test` before every commit.

## Decisions taken in the prototype (confirm with Gabriella)
- **Scoring is computed by the game** from the spec and registry, and only the reaction lines come from `outcomes_*.json`. The boot test fails if the two ever disagree.
- **Notebook shows the quote, not the clue tag.** Showing "Diet: vegetarian" would solve implied clues for the player.
- **Venue cards show name, cuisine and price only.** Dietary and vibe tags are left for the reviews to reveal.
- **Venue order is shuffled**, with a fixed seed per level, because venue files often list the answer first.
- **Unlocks:** a level opens once the previous one is cleared (1+ stars); locked levels are hidden, not shown greyed out (Gabriella, 2026-11-06). Best stars are kept in localStorage.
- **Notebook is on the chat and the restaurant list**, same place on both (`src/ui/notebook.js`) (Gabriella, 2026-11-06).
- **Outcome image slot** on the result screen. First texture found wins: `outcome_<level>_<venue>`, then `outcome_<level>_<perfect|partial|fail>`, then `outcome_<result>`. Until one exists, a placeholder names the file it expects.
- **Palette and fonts** come from Gabriella's portrait sheets (`src/ui/theme.js`): Pixelify Sans (bundled, no network) for headings and buttons, a plain sans for chat and reviews.
- **Fail hint** names the broken hard constraint; "Reread the chat" highlights the tagged lines for every miss.

## Art
- Source sheets: `art/source/<character>_sheet.jpg`, a 3x2 grid of HAPPY ANNOYED SURPRISED / ANGRY CONTENT NEUTRAL.
- Outcome pictures: `art/source/level_XX_result_<venue name>.jpg` (3:2, venue name without the district, e.g. `level_01_result_satay_spot.jpg`). The script below cuts them to 680x456 as `outcome_level_XX_<venue id>`.
- Chat backdrops: `art/source/chat_background_chapter_XX_<district>.jpg`, tall pictures work best. The script keeps the whole picture, only muting it (`MUTE_SATURATION`, `CREAM_WASH`), and saves `chat_bg_chapter_XX`. ChatScene shows it at the panel's width for every level in that chapter and pans down it: by reading progress while messages arrive, then with the scroll position once the chat is fully shown.
- **Preview portraits** are cut by `python game/tools/slice_portraits.py` into `game/public/art-preview/` (PNGs + manifest). `BootScene` loads that manifest; anything it doesn't cover (cuisine icons for now) gets a generated placeholder under the bible's key.
- The official assets are the Art Asset agent's job (`public/assets/`). When they exist, change `MANIFEST` in `BootScene.js` and serve the root `public/` folder.
- Open with Gabriella: the sheets have CONTENT but no HUNGRY (HUNGRY shows NEUTRAL for now), and they keep their painted backgrounds although the bible asks for transparent ones.

## Not built yet
- Audio and the credits screen (bible: hand-picked lo-fi tracks with logged licenses).
- Palette in the bible (still Open there). `src/ui/theme.js` has the colours sampled from the sheets, ready to copy in.
- Mobile layout check, accessibility pass, chapter intro beats.
