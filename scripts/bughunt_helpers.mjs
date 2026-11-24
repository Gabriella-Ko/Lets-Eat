// Bug hunt helpers (spec: docs/specs/bug_hunt.md). Plain functions that take a Playwright page running the
// Let's Eat! game (Phaser 3, exposed as window.__game, 960x640 canvas). No imports, so a run script anywhere can
// load this file with: const h = await import(pathToFileURL('<this file>').href);

export const GAME_W = 960;
export const GAME_H = 640;

/** Collect page errors and console errors from now on. Returns the live array. */
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push({ kind: 'pageerror', text: String(e.message || e), at: Date.now() }));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push({ kind: `console.${m.type()}`, text: m.text(), at: Date.now() });
  });
  return errors;
}

/** Open a game URL and wait until a scene other than Boot is running. */
export async function bootGame(page, url, timeout = 15000) {
  await page.goto(url);
  await page.waitForFunction(() => {
    const g = window.__game;
    return g && g.scene.getScenes(true).some((s) => s.scene.key !== 'Boot');
  }, null, { timeout });
  await page.waitForTimeout(500);
}

/** The running scene keys, Hud (the always-on music button) left out. */
export async function scenes(page) {
  return page.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key).filter((k) => k !== 'Hud'));
}

/** Wait until the given scene is running. Returns true, or false after the timeout (a possible "stuck"). */
export async function waitForScene(page, key, timeout = 8000) {
  try {
    await page.waitForFunction((k) => window.__game.scene.getScenes(true).some((s) => s.scene.key === k), key, { timeout });
    return true;
  } catch {
    return false;
  }
}

/** Every visible text on screen, in game coordinates: { text, x, y, w, h, scene }. Containers are walked. */
export async function texts(page) {
  return page.evaluate(() => {
    const out = [];
    const walk = (obj, sceneKey) => {
      if (!obj || obj.visible === false || obj.alpha === 0) return;
      if (obj.type === 'Text' && obj.text && obj.text.trim()) {
        const b = obj.getBounds();
        out.push({ text: obj.text.replace(/\s+/g, ' ').trim(), x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), scene: sceneKey });
      }
      if (obj.list) obj.list.forEach((c) => walk(c, sceneKey));
    };
    for (const s of window.__game.scene.getScenes(true)) s.children.list.forEach((o) => walk(o, s.scene.key));
    return out;
  });
}

/** Turn game coordinates into page coordinates (the canvas is scaled to fit the window). */
async function toPage(page, x, y) {
  const r = await page.evaluate(() => {
    const b = window.__game.canvas.getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  });
  return { px: r.left + (x * r.width) / 960, py: r.top + (y * r.height) / 640 };
}

/** Click a point given in game coordinates (0..960, 0..640). */
export async function clickAt(page, x, y, { double = false } = {}) {
  const { px, py } = await toPage(page, x, y);
  if (double) await page.mouse.dblclick(px, py);
  else await page.mouse.click(px, py);
}

/**
 * Click the centre of the first on-screen text containing `label` (case-insensitive). Buttons, cards and tabs
 * are clickable through their text. Returns the text clicked, or null when nothing matched (no click made).
 */
export async function clickText(page, label, { nth = 0, exact = false, double = false } = {}) {
  const want = label.toLowerCase();
  const hits = (await texts(page)).filter((t) => (exact ? t.text.toLowerCase() === want : t.text.toLowerCase().includes(want)));
  const t = hits[nth];
  if (!t) return null;
  await clickAt(page, t.x + t.w / 2, t.y + t.h / 2, { double });
  return t;
}

/** Press a key (Playwright key names: 'Enter', 'Escape', 'ArrowDown', 'KeyR', 'Backspace', 'Space'...). */
export async function press(page, key, times = 1, gapMs = 0) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    if (gapMs) await page.waitForTimeout(gapMs);
  }
}

/** Sounds playing right now (Phaser sound keys, e.g. 'sfx:...' and music). */
export async function soundsPlaying(page) {
  return page.evaluate(() => (window.__game.sound?.sounds || []).filter((s) => s.isPlaying).map((s) => s.key));
}

/** Every 'lets-eat-*' localStorage entry, parsed where possible. */
export async function storage(page) {
  return page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith('lets-eat-')) continue;
      const v = localStorage.getItem(k);
      try { out[k] = JSON.parse(v); } catch { out[k] = v; }
    }
    return out;
  });
}

/** Write localStorage entries (values are JSON-encoded unless already strings), then reload. */
export async function setStorage(page, entries) {
  await page.evaluate((e) => {
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, entries);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.scene.getScenes(true).some((s) => s.scene.key !== 'Boot'));
  await page.waitForTimeout(500);
}

/** Save a screenshot (jpeg when the path ends in .jpg). */
export async function shot(page, path) {
  await page.screenshot({ path, type: path.endsWith('.png') ? 'png' : 'jpeg', ...(path.endsWith('.png') ? {} : { quality: 80 }) });
  return path;
}

/**
 * Texts that run past the screen edge or overlap another text of the same scene (a cheap layout check).
 * Returns [{ problem, a, b? }]. Expect some false alarms (e.g. a label on top of its own shadow); look before reporting.
 */
export async function layoutProblems(page) {
  const ts = await texts(page);
  const out = [];
  for (const t of ts) {
    if (t.x < 0 || t.y < 0 || t.x + t.w > 960 || t.y + t.h > 640) out.push({ problem: 'off screen', a: t });
  }
  for (let i = 0; i < ts.length; i++) {
    for (let j = i + 1; j < ts.length; j++) {
      const a = ts[i], b = ts[j];
      if (a.scene !== b.scene || a.text === b.text) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 4 && oy > 4) out.push({ problem: 'texts overlap', a, b });
    }
  }
  return out;
}
