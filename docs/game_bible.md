# Let's Eat! — Game Bible

Oct 30, 2026 · @Gabby

## How to use this bible

This is the single source of truth for Let's Eat!. Every agent reads it before generating anything, and only Gabriella edits it.

- If an agent needs a fact that isn't here (a new character, tag or rule), it stops and flags it. It never invents one.
- If a level and the bible disagree, the bible wins and the level is regenerated.
- Each item is marked **Locked** (decided, from the GDD), **Proposed** (a suggested default, confirm or change) or **Open** (needs a decision before agents rely on it).

## Game identity

Let's Eat! is a cozy deduction puzzle: read a group chat, work out what everyone needs, and recommend the one restaurant that suits them all.

| Item | Rule | Status |
| --- | --- | --- |
| Player role | A map assistant recommending venues to a friend group | Locked |
| Tone | Cozy, warm, lightly comedic; friction is funny, never mean | Locked |
| Core loop | Read chat → inspect search results and reviews → recommend → see the reaction | Locked |
| Structure | Single-day chapters, from solo meals to group outings with conflicting needs | Locked |
| Scope | 20 levels; expansion only if tokens are left over | Locked |
| Engine | Phaser 3, static JSON loaded at startup, no runtime AI calls | Locked |
| Art | Charming pixel art; avatars are stills that swap per emotion, no animation | Locked |
| Audio | Free or copyright-free lo-fi tracks, sourced by hand from Bensound and Pixabay Music, not by agents. Each track's license and any required credit are logged in a credits file shown in the game's credits screen | Locked |

## Cast

Each character has permanent traits that never change between levels, and per-level wants that the Puzzle Architect sets for each meal.

- **Permanent:** allergies, strict diets, baseline budget, personality, voice. Set here only.
- **Per level:** today's craving, mood, time pressure, seating or noise preference. Set in the level spec.

| Character | Personality | Permanent constraints | Voice in chat | Status |
| --- | --- | --- | --- | --- |
| Maya | Budget-conscious, dramatic when let down | Budget max `$` (saving for a trip).  From chapter 4 her max is $$: a promotion means the trip is covered.| Quick to complain, exaggerates ("i'm literally leaving this chat") | Locked |
| Liam | Always hungry, easygoing, loves noodles and patios | None yet | Short excited messages, food-first | Locked |
| Mina | Creative, flexible, patient, soft-spoken yet direct | Vegetarian | Mid-length messages, wants everyone to be happy, checks how everyone is doing; hides her own needs, which only surface as hints ("oh, I can just get a side salad") | Locked |
| Roxy | Adventurous, sometimes impulsive | Dairy intolerance (impulsive, often forgets to mention it until it's too late) | Short excited messages, action-first vocabulary ("Let's do it!", "I'm down") | Locked |
| Cyrus | Organized, good planner, calm, pragmatic | Peanut allergy | Deliberate messages with certainty, clear instructions or bullet points | Locked |
| Brooke | Steady, bright, extroverted, social presence | Health conscious, not greasy/oily | Short confident messages, pushes for lively, social spots ("somewhere with a good vibe!"), pragmatic, warm | Locked |

A character's permanent constraints apply in every level they appear in, even when the chat doesn't mention them that day. A peanut allergy is never forgotten between chapters.

## Constraint vocabulary

Agents may only use these exact strings. A new tag gets added here first, then the Validator accepts it.

| Category | Allowed values (exact strings) | Hard or soft | Status |
| --- | --- | --- | --- |
| Cuisine | `noodles`, `sushi`, `pizza`, `burgers`, `tacos`, `curry`, `cafe`, `dim_sum`, `greek`, `viet`, `thai`, `italian`, `ice_cream` | Soft (craving) | Locked |
| Allergy | `peanut`, `shellfish`, `gluten` | Hard | Locked |
| Strict diet | `vegan`, `vegetarian`, `halal` | Hard | Locked |
| Intolerance | `dairy` | Soft (−1 star) | Locked |
| Budget tier | `$`, `$$`, `$$$` | Only Maya has a budget limit; everyone else is fine with any tier. With Maya present the group max is $; without her there is no limit. Soft at 1 tier over (−1 star); hard fail at 2+ tiers over | Locked |
| Vibe | `quiet`, `lively`, `outdoor_seating`, `quick_bite`, `group_friendly`, `healthy` | Soft | Locked |

Venue cards show name, cuisine and price tier; dietary (e.g. peanut free, vegan) and vibe details come only from reviews. The Seeder writes reviews that hint at a tag without naming the string.

## Scoring rules

Hard constraints decide pass or fail; each soft miss costs one star. This replaces the GDD's "1 star per category" wording, which let a budget overshoot earn 2 stars while also being a fail. (Locked)

The game scores a pick in this order:

1. **Hard check.** Any allergy, strict diet, or going 2+ tiers over the group's budget max ends the level: 0 stars, Failed, retry with a hint.
2. **Start at 3 stars.** Every safe pick begins with full marks.
3. **Lose 1 star per soft miss:** wrong craving, a missed vibe preference (seating, noise, speed), dairy, or 1 tier over budget.
4. **Floor of 1 star.** A safe pick never drops below 1 star, so the level always counts as Cleared.

| Result | Stars | Level state | Portraits | Chat reaction |
| --- | --- | --- | --- | --- |
| Perfect match | 3 | Cleared | HAPPY | Enthusiastic praise |
| Partial success | 1–2 | Cleared, hint names each missed preference | ANNOYED or SURPRISED | One friendly reaction per lost star (Maya complains about the price at 1 tier over; Roxy's stomach protests a dairy miss) |
| Complete failure | 0 | Failed, must retry | SURPRISED or ANGRY | Dramatic reaction (someone leaves the chat, allergy scare) |

Every level has exactly one 3-star venue and at least one hard-fail trap. The Validator checks both in code.

## Emotion tags and art rules

Six emotion tags exist, and every character needs one portrait per tag. Any unknown tag falls back to `NEUTRAL`.

| Tag | Used when | Status |
| --- | --- | --- |
| `HAPPY` | Craving met, perfect match, good news | Locked |
| `ANNOYED` | Budget stress, a missed preference | Locked |
| `SURPRISED` | Plot twist in chat, failure reactions | Locked |
| `HUNGRY` | Opening lines, cravings | Locked |
| `ANGRY` | Level failed | Locked |
| `NEUTRAL` | Default and fallback | Locked |

| Art rule | Value | Status |
| --- | --- | --- |
| Portrait file name | `portrait_<character>_<tag>.png`, all lowercase (`portrait_maya_happy.png`) | Locked |
| Venue icon | One per cuisine, not per restaurant: `icon_<cuisine>.png` | Locked |
| Portrait size | 128×128 px PNG, transparent background | Locked |
| Style | Cozy pixel art, soft outlines, warm palette | Locked |
| Palette | Exact colours TBD | Open |

With 6 characters × 6 tags, the full portrait set is 36 images, plus 13 cuisine icons.

## Writing voice and clue rules

The chat should read like real friends texting, and every answer must be findable by a careful player. (Locked)

**Voice**

- Short messages, casual lowercase allowed, one idea per bubble.
- 8–20 messages per level; later chapters can run longer.
- Each character sounds like their Cast entry. Maya never sounds like Liam.
- No profanity, no meanness, no real restaurant or brand names.

**Clue rules**

1. Every constraint that affects scoring appears in this level's chat at least once, stated or clearly implied. Permanent traits get a reminder too.
2. No character names the correct venue or says the answer outright.
3. Reviews may confirm or reveal venue details, but never contradict the chat.
4. Each decoy fails for exactly one reason, named in the spec, so partial-success feedback can point to it. Decoys are built as minimal pairs: a copy of the solution with only that one attribute changed.
5. Difficulty rises by how clues are given: stated ("I'm allergic to peanuts") → implied ("remember the satay incident?") → buried mid-conversation.
6. Characters who hide or forget their needs (Mina, Roxy) still follow rule 1. When their constraint matters, another friend hints at it for them ("Roxy, remember the milkshake incident?"), or they mention it offhand late in the chat. Exception: where a Story beat says otherwise (e.g. Mina speaks up, level_16).

The Blind Playtester tests rule 1 in practice: if it can't find a constraint, the level goes back to the Writer.

## Campaign structure

The campaign is 4 chapters of 5 levels each (20 total). The Puzzle Architect picks the guests for each level, within these limits. Each chapter unlocks a new neighbourhood of one fictional city. (Locked)

| Chapter | District | Guests per level | Venues per level | Clue style | Max hard constraints |
| --- | --- | --- | --- | --- | --- |
| 1 | Campus Quarter | 2–3 | 4 | Stated (one implied exception, below) | 1 |
| 2 | Downtown | 3–4 | 5 | Stated and implied | 2 |
| 3 | Night Market | 4–5 | 6 | Mostly implied | 2  |  
| 4 | Waterfront | 4–6 | 7 | Implied and buried| 3 |

**District profiles** (Proposed)

The Map Seeder builds each level's venues from its district's profile, not the whole vocabulary.

| District id | Cuisines | Price tiers | Common vibes | Typical traps |
| --- | --- | --- | --- | --- |
| `campus` | `noodles`, `pizza`, `cafe`, `burgers`, `tacos`, `ice_cream` | Mostly `$`, a few `$$` | `quick_bite`, `group_friendly`, `lively` | Allergies, wrong craving |
| `downtown` | `sushi`, `curry`, `viet`, `thai`, `cafe`, `burgers` | `$`–`$$` | `quick_bite`, `quiet`, `healthy` | One tier over budget, too slow for a lunch break |
| `night_market` | Any | `$`–`$$$` | Any | Any; the widest mix of options  |
| `waterfront` | `greek`, `italian`, `sushi`, `dim_sum`, `ice_cream` | `$$`–`$$$` | `outdoor_seating`, `lively`, `quiet` | One tier over budget, `lively` vs. `quiet` clashes  |

**Story Beats**  
Story beats are fixed facts about the friends' shared story. Agents may only use the beats and callbacks listed here; anything new gets added to this section first. At most one story beat per level. A beat takes 2–3 chat lines at most, never replaces a clue line, and works best when it also delivers a clue or gives the level a reason for its craving or vibe.

| Beat | Levels | What happens | Status |
| --- | --- | --- | --- |
| The lunch crew grows | Chapters 1–2 | Brooke runs the "lunch crew" chat and adds new people: Mina (level_05), Roxy (level_06). | Locked |
| Cyrus stops double-checking | level_09 | Through level_08 Cyrus states his peanut allergy plainly, often with a satay incident callback. In level_09, his first implied level in chapter 2, he trusts the assistant enough not to spell it out ("assistant knows the drill by now"). The clue is still there, but implied: the callback or another friend carries it. From then on, his allergy follows the level's clue style like everyone else's. | Locked |
| Roxy finds the Night Market | level_11 | Roxy discovers the late-night market and talks the crew into going ("found a whole market that opens at 9. we're going."). It opens chapter 3 in 1–2 lines. Her dairy clue follows clue rule 6 as usual. | Locked |
| The stall Liam won't stop talking about | Setup: level_07. Payoff: level_15 | In level_07 Liam mentions a noodle stall he's heard about "somewhere at the night market" (one line, no clue tag). He keeps bringing it up; chapter 3 levels with Liam may mention it in passing. In level_15, the Night Market finale, the crew finally goes, and his excitement gives the level its noodle craving ("THE stall. tonight. no arguments"). It takes 1–2 lines and adds no new constraint. If a Campus noodle venue returns as a Night Market favourite, it may be the answer or a decoy; the Puzzle Architect decides. | Locked |
| Maya's promotion | Hint: one chapter 3 level. Reveal: her first chapter 4 level | Chapter 3: she mentions a work win, but her budget is still `$`. Chapter 4 reveal: "did the math, trip is funded". Every chapter 4 level with Maya restates her new `$$` budget in chat. | Locked |
| Mina speaks up | level_16; echo in level_20 | Mina has always hidden her needs until a friend noticed. In level_16 she raises her own need first, still in her soft way and in the level's clue style ("could we go somewhere I can order a real main this time?"), never by announcing her diet. In level_20 one short line shows she still does. | Locked |
| Maya's send-off | level_20 | The finale is the crew's send-off dinner before Maya's coast trip, organised by Brooke. It's the only level with all six friends. It takes 2–3 lines of framing at most, and Maya's `$$` budget is restated through it ("trip's paid for, tonight's on the fun budget"). | Locked |


**Calendar.** Each chapter is a season, which gives vibes a natural reason:

| Chapter | District | Season | Typical reasons |
| --- | --- | --- | --- |
| 1 | Campus | Spring semester | Between classes, study groups |
| 2 | Downtown | Summer internships | Lunch breaks, so `quick_bite` |
| 3 | Night Market | Late summer nights | Warm evenings, so `outdoor_seating` and `lively` |
| 4 | Waterfront | End of summer | Before Maya's trip, so `quiet` dinners and celebrations |

**Callbacks.** Shared memories the chat can point to instead of naming a need. They're the main way to deliver implied and buried clues, and they reward returning players. A callback always points to the friend's permanent constraint, never to a new one.

| Callback | Friend | Points to | First appears |
| --- | --- | --- | --- |
| The satay incident | Cyrus | Peanut allergy | level_01 |
| The trip fund | Maya | Her budget (`$` saving, `$$` from chapter 4) | level_02 |
| The plate of fries | Mina | Vegetarian (she once ate only fries while everyone else had burgers) | level_03 |
| The milkshake incident | Roxy | Dairy intolerance | level_06 |
| Sushi day | Mina | Vegetarian (menu where she didn't need to double check for meat) | level_10 |

In `stated` levels a callback may sit next to a plain statement. In `implied` and `buried` levels, the callback alone may carry the clue, as long as a returning player can read it and a first-time player can still work it out from context.
 

**Guardrails**

- Every character appears in at least 4 levels across the campaign, and in at least one level per chapter from chapter 2 on.
- Chapter 1 is the exception for introductions: several characters can debut in the same level. Roxy is held back and debuts in the first level of chapter 2 (level\_06) to bring in some chaos.
- Chapter 1 includes one level with only Mina and Liam. Liam is easygoing, so the stakes are low, and Mina's vegetarianism appears only as a hint: the campaign's first implied clue.
- Every non-solution venue is a decoy with a reason to fail. Each level has at least one hard-fail trap and at least one near miss (exactly one soft miss).
- The Validator checks guest counts, venue counts, hard-constraint counts and character appearances against this table across all levels.
- Venues can recur within their district. A recurring venue keeps its id, name, cuisine, price tier and vibe tags; only its reviews may change between levels.
- A venue never appears outside its home district, except at the Night Market, which can bring back favourites from earlier chapter.

## Data schemas

Four files per level plus one venue registry per district, all sharing the same `level_id` and venue ids. Every file carries `generated_by` and `edited_by` for Provenance. (Locked)

**Level spec** (written by the Puzzle Architect, read by everyone)

```json
{
  "level_id": "level_02",
  "chapter": 1,
  "district": "campus",
  "difficulty": "stated",
  "guests": ["maya", "liam", "cyrus"],
  "hard": { "budget_max": "$", "allergies": ["peanut"], "diets": [] },
  "soft": { "craving": "noodles", "vibe": ["outdoor_seating"], "intolerances": [] },
  "solution_id": "campus_noodle_nook",
  "decoys": [
    { "id": "campus_satay_spot", "fails_on": "allergy:peanut" },
    { "id": "campus_slurp_house", "fails_on": "budget_soft" },
    { "id": "campus_pizza_corner", "fails_on": "craving" }
  ],
  "generated_by": "puzzle_architect",
  "edited_by": null
}
```

`budget_max` is Maya's budget for that chapter when she is a guest, otherwise null (no limit). Allowed `fails_on` values: `allergy:<tag>`, `diet:<tag>`, `budget_hard` (2+ tiers over), `budget_soft` (1 tier over), `craving`, `vibe:<tag>`, `intolerance:<tag>`.

**Dialogue** (written by the Narrative Writer)

```json
{
  "level_id": "level_02",
  "script": [
    { "speaker": "liam", "text": "starving. need noodles asap", "emotion": "HUNGRY", "clue": "craving" },
    { "speaker": "maya", "text": "ok but cheap pls, trip fund", "emotion": "ANNOYED", "clue": "budget" },
    { "speaker": "cyrus", "text": "no peanuts for me, as always", "emotion": "NEUTRAL", "clue": "allergy:peanut" },
    { "speaker": "maya", "text": "ugh what a week", "emotion": "NEUTRAL", "clue": null },
    { "speaker": "liam", "text": "somewhere with a patio? it's so nice out", "emotion": "HAPPY", "clue": "vibe:outdoor_seating" }
  ],
  "generated_by": "narrative_writer",
  "edited_by": null
}
```

Every line carries a `clue` tag, or `null`. Tagged lines feed the Notebook sidebar as the player reads them, and a partial-success hint highlights the tagged line the player missed.

**Outcomes** (written by the Narrative Writer, kept separate so the Blind Playtester never sees them)

```json
{
  "level_id": "level_02",
  "by_venue": {
    "campus_noodle_nook": { "result": "perfect", "missed": [], "lines": [{ "speaker": "liam", "text": "patio noodles. perfect.", "emotion": "HAPPY" }] },
    "campus_slurp_house": { "result": "partial", "missed": ["budget"], "lines": [{ "speaker": "maya", "text": "tasty but my wallet is crying", "emotion": "ANNOYED" }] },
    "campus_satay_spot": { "result": "fail", "missed": ["allergy:peanut"], "lines": [{ "speaker": "cyrus", "text": "...everything here has peanut sauce", "emotion": "ANGRY" }] }
  },
  "generated_by": "narrative_writer",
  "edited_by": null
}
```

**Venues** (written by the Map Seeder)

```json
{
  "level_id": "level_02",
  "district": "campus",
  "venues": [
    { "id": "campus_noodle_nook", "reviews": ["Slurped my broth on the patio, barely spent ten bucks."] },
    { "id": "campus_satay_spot", "reviews": ["Their peanut sauce goes on literally everything. Love it."] }
  ],
  "generated_by": "map_seeder",
  "edited_by": null
}
```

**Venue registry** (one per district; the Map Seeder reuses or adds venues, Integration checks consistency)

```json
{
  "district": "campus",
  "venues": [
    {
      "id": "campus_noodle_nook",
      "name": "Noodle Nook",
      "cuisine": "noodles",
      "price_tier": "$",
      "dietary_tags": ["peanut_free", "vegan_options"],
      "vibe_tags": ["outdoor_seating", "quick_bite"],
      "first_level": "level_02"
    }
  ],
  "generated_by": "map_seeder",
  "edited_by": null
}
```

A level's venues file lists only ids and that level's reviews; every other venue detail comes from the registry, so a recurring venue can't drift. The answer lives only in the spec and outcomes files, so the Blind Playtester is handed the dialogue, the level's venues and their registry entries, and nothing else.

**Naming rules** (Locked)

- Level ids: `level_01` to `level_20`, always two digits.
- Level files: `<type>_level_##` (`spec_level_01.json`, `dialogue_level_01.json`), so every file for a level sorts together.
- Venue ids: `<district>_<venue_name>` in lowercase snake case (`campus_noodle_nook`), unique across the whole game.
- Character ids: lowercase first names (`maya`, `cyrus`).
- Clue tags: the same strings as `fails_on` (`allergy:peanut`, `craving`, `vibe:outdoor_seating`), except budget lines use `budget`; ordinary lines use `null`.

## Crew roster

Nine crew members, run by one Orchestrator. These ids are the only values allowed in `generated_by`, and human edits use `human:<name>` in `edited_by`. (Locked)

| Agent | id | Type | Writes | Started at stage |
| --- | --- | --- | --- | --- |
| Orchestrator | `orchestrator` | LLM (Claude Code main session) + run script | `run_log.json` | 1 |
| Puzzle Architect | `puzzle_architect` | LLM | `campaign_outline.json`, `spec_level_##.json` | 1 |
| Narrative Writer | `narrative_writer` | LLM | `dialogue_level_##.json`, `outcomes_level_##.json` | 1 |
| Map Seeder | `map_seeder` | LLM | `venues_level_##.json`, `venue_registry_<district>.json` | 1 |
| Validator | `validator` | Script | `validation_level_##.log` | 1 |
| Blind Playtester | `blind_playtester` | LLM | `playtest_level_##.json` | 2 |
| Art Asset Agent | `art_asset` | LLM + image script | `asset_manifest.json`, processed PNGs | 3 |
| Integration | `integration` | Script | `integration_audit.log` | 4 |
| Provenance | `provenance` | Git hooks + script | `provenance_manifest.json` | 4 |
|Critic | `critic` | LLM | critique_level_##.json |2| 
| You | `human:gabby` | Human | The bible, approvals, manual fixes | — |

Each agent's full instructions live in its brief file, not here: `.claude/agents/<name>.md`, and `CLAUDE.md` for the Orchestrator. Briefs carry a version number starting at v1; bump it whenever a brief's rules change. The running order and failure routes are explained in the How the Orchestration Works doc.

The Phaser game code (scenes, UI, scoring logic) is outside this crew: you build it directly with Claude Code. The crew only produces content files, and Integration's boot test is where the two meet.
