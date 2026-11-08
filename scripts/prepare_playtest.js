#!/usr/bin/env node
// Let's Eat! playtest input builder (pipeline step 6, CLAUDE.md).
// Usage: node scripts/prepare_playtest.js level_XX [level_YY ...]
// Writes content/playtest_input/level_XX/ with ONLY what a player sees:
//   dialogue_level_XX.json  speaker, text, emotion per line (no clue tags, no provenance)
//   venues_level_XX.json    venue ids and this level's reviews
//   venue_registry_<district>.json  id, name, cuisine, price_tier of this level's venues
//                                   (no dietary_tags, vibe_tags or first_level)
// Never copies the spec or outcomes. Deterministic; prints the files it wrote.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const write = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');

const levels = process.argv.slice(2);
if (!levels.length || !levels.every((l) => /^level_\d{2}$/.test(l))) {
  console.error('Usage: node scripts/prepare_playtest.js level_XX [level_YY ...]');
  process.exit(2);
}

for (const L of levels) {
  const src = path.join(ROOT, 'content', 'levels', L);
  const out = path.join(ROOT, 'content', 'playtest_input', L);
  const dialogue = readJson(path.join(src, `dialogue_${L}.json`));
  const venues = readJson(path.join(src, `venues_${L}.json`));
  const district = venues.district;

  // Registries: the level's district, plus every other district for Night Market imports.
  const regDir = path.join(ROOT, 'content', 'registry');
  const entries = new Map();
  for (const name of fs.readdirSync(regDir).filter((n) => /^venue_registry_[a-z_]+\.json$/.test(n))) {
    for (const e of readJson(path.join(regDir, name)).venues || []) entries.set(e.id, e);
  }
  const missing = venues.venues.map((v) => v.id).filter((id) => !entries.has(id));
  if (missing.length) {
    console.error(`${L}: venues not in any registry: ${missing.join(', ')} (run the Validator first)`);
    process.exit(1);
  }

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const files = {
    [`dialogue_${L}.json`]: {
      level_id: dialogue.level_id,
      script: dialogue.script.map(({ speaker, text, emotion }) => ({ speaker, text, emotion })),
    },
    [`venues_${L}.json`]: {
      level_id: venues.level_id,
      district,
      venues: venues.venues.map(({ id, reviews }) => ({ id, reviews })),
    },
    [`venue_registry_${district}.json`]: {
      district,
      venues: venues.venues.map(({ id }) => {
        const { name, cuisine, price_tier } = entries.get(id);
        return { id, name, cuisine, price_tier };
      }),
    },
  };
  for (const [name, data] of Object.entries(files)) write(path.join(out, name), data);
  console.log(`${L}: ${Object.keys(files).map((n) => `content/playtest_input/${L}/${n}`).join(', ')}`);
}
