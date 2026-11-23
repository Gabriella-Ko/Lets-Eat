// Copies Gabriella's music and sound effects from ../assets/music/ and ../assets/sfx/ (the sources, at the
// repo root) into public/music/ and public/sfx/, the generated copies the game serves (ignored by Git).
// Copies every .mp3/.ogg and *-license.txt unchanged (desktop.ini and anything else is ignored), and removes
// files in the copy that are no longer in the source. Never touches assets/.
// Usage (from game/): npm run sync-assets   (also runs before dev, build and boot-test)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FOLDERS = ['music', 'sfx'];

const wanted = (name) => /\.(mp3|ogg)$/i.test(name) || /-license\.txt$/i.test(name);

function sync(folder) {
  const SRC = path.resolve(GAME, '..', 'assets', folder);
  const OUT = path.join(GAME, 'public', folder);
  fs.mkdirSync(OUT, { recursive: true });

  let sources = [];
  if (fs.existsSync(SRC)) {
    sources = fs.readdirSync(SRC, { withFileTypes: true })
      .filter((e) => e.isFile() && wanted(e.name))
      .map((e) => e.name)
      .sort();
  } else {
    console.warn(`sync-assets: ${SRC} not found; public/${folder}/ will be emptied.`);
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
    console.log(`sync-assets: copied ${folder}/${name}`);
    copied++;
  }

  const keep = new Set(sources);
  let removed = 0;
  for (const e of fs.readdirSync(OUT, { withFileTypes: true })) {
    if (e.isFile() && !keep.has(e.name)) {
      fs.unlinkSync(path.join(OUT, e.name));
      console.log(`sync-assets: removed ${folder}/${e.name}`);
      removed++;
    }
  }

  console.log(`sync-assets: ${copied} copied, ${unchanged} already up to date, ${removed} removed (assets/${folder} -> public/${folder})`);
}

for (const folder of FOLDERS) sync(folder);
