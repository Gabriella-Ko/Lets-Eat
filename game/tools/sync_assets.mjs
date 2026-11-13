// Copies Gabriella's music from ../assets/music/ (the source, at the repo root) into public/music/,
// the generated copy the game serves (ignored by Git). Copies every .mp3/.ogg and *-license.txt,
// removes files in public/music/ that are no longer in assets/music/. Never touches assets/.
// Usage (from game/): npm run sync-assets   (also runs before dev, build and boot-test)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(GAME, '..', 'assets', 'music');
const OUT = path.join(GAME, 'public', 'music');

const wanted = (name) => /\.(mp3|ogg)$/i.test(name) || /-license\.txt$/i.test(name);

fs.mkdirSync(OUT, { recursive: true });

let sources = [];
if (fs.existsSync(SRC)) {
  sources = fs.readdirSync(SRC, { withFileTypes: true })
    .filter((e) => e.isFile() && wanted(e.name))
    .map((e) => e.name)
    .sort();
} else {
  console.warn(`sync-assets: ${SRC} not found; public/music/ will be emptied.`);
}

let copied = 0;
let unchanged = 0;
for (const name of sources) {
  const from = path.join(SRC, name);
  const to = path.join(OUT, name);
  const a = fs.statSync(from);
  const b = fs.existsSync(to) ? fs.statSync(to) : null;
  if (b && b.size === a.size && b.mtimeMs >= a.mtimeMs) { unchanged++; continue; }
  fs.copyFileSync(from, to);
  fs.utimesSync(to, a.atime, a.mtime);
  console.log(`sync-assets: copied ${name}`);
  copied++;
}

const keep = new Set(sources);
let removed = 0;
for (const e of fs.readdirSync(OUT, { withFileTypes: true })) {
  if (e.isFile() && !keep.has(e.name)) {
    fs.unlinkSync(path.join(OUT, e.name));
    console.log(`sync-assets: removed ${e.name}`);
    removed++;
  }
}

console.log(`sync-assets: ${copied} copied, ${unchanged} already up to date, ${removed} removed (assets/music -> public/music)`);
