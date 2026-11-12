# Validator spec (script)

Brief version: v2 · Agent id: `validator`

Build this as `scripts/validate.js`, run as `node scripts/validate.js level_XX`. It must be deterministic: no LLM calls.

## Reads
- `content/levels/level_XX/` (spec, dialogue, outcomes, venues)
- `content/registry/venue_registry_<district>.json`
- Rules from the bible, kept as config in `scripts/rules.json` (allowed tags, emotion tags, chapter limits, district profiles)

## Checks
1. Every file matches its schema and the Naming rules.
2. Every tag, emotion and character id exists in `rules.json`.
3. `budget_max` is Maya's budget for that chapter when she is a guest (`"$"` in chapters 1–3, `"$$"` in chapter 4), otherwise `null`.
4. Guest count, venue count and hard-constraint count fit the chapter.
5. Score every venue with the bible's Scoring rules: exactly one venue scores 3 stars, and it is `solution_id`.
6. Every decoy fails on exactly its declared `fails_on`, and on nothing else.
7. At least one hard-fail trap and at least one near miss.
8. Every scoring constraint has at least one dialogue line tagged with its clue tag.
9. Outcomes cover every venue, with `result` and `missed` matching the computed score.
10. Venue fixed fields match the registry.
11. Callbacks (bible: Callbacks, Scrapbook). A dialogue line's optional `callback` is an id from `rules.json` `callbacks`; it is not used before that callback's `first_level`; its `friend` is a guest in the level. A level that is a callback's `first_level` contains at least one line tagged with it: a failure when `callback_first_appearance_required` is true, otherwise a WARN line. Lines without `callback` are fine.

## Writes
`logs/validation_level_XX.log`: PASS or FAIL, then one line per failure naming the check, the file and the agent that wrote it (from `generated_by`), then any `WARN` lines (reported, but they don't fail the level). Exit code 1 on any failure.

## Never
Fix content. It only reports.
