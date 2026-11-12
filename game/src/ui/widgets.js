import { C, CHARACTERS, CUISINES, EMOTIONS, PIXEL, hex, pixel, portraitKey } from './theme.js';

/** Rounded panel. Returns the Graphics object. */
export function panel(scene, x, y, w, h, fill = C.panel, radius = 16) {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.18).fillRoundedRect(x + 3, y + 5, w, h, radius);
  g.fillStyle(fill, 1).fillRoundedRect(x, y, w, h, radius);
  return g;
}

/** Clickable button styled like the portrait sheets' label bars. Call .setEnabled(false) to grey it out. */
export function button(scene, x, y, label, onClick, { w = 200, h = 44, fill = C.accent, size = 18 } = {}) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const t = scene.add.text(0, 0, label.toUpperCase(), pixel(size, C.panel)).setOrigin(0.5);
  let enabled = true;
  const draw = (hover) => {
    g.clear();
    const col = !enabled ? C.goldDim : fill;
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, 6);
    g.fillStyle(col, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    g.lineStyle(2, hover && enabled ? C.panel : C.bar, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
  };
  draw(false);
  c.add([g, t]);
  c.setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerover', () => draw(true));
  c.on('pointerout', () => draw(false));
  c.on('pointerdown', (p, lx, ly, e) => {
    e?.stopPropagation?.();
    if (enabled) onClick();
  });
  c.setEnabled = (on) => {
    enabled = on;
    draw(false);
    t.setAlpha(on ? 1 : 0.6);
    return c;
  };
  c.label = t;
  return c;
}

/** A framed square portrait, centred on (x, y). */
export function portrait(scene, x, y, size, character, emotion) {
  const c = scene.add.container(x, y);
  const frame = scene.add.graphics();
  frame.fillStyle(C.bar, 1).fillRoundedRect(-size / 2 - 3, -size / 2 - 3, size + 6, size + 6, 6);
  const img = scene.add.image(0, 0, portraitKey(character, emotion)).setDisplaySize(size, size);
  c.add([frame, img]);
  return c;
}

/** Five-point star drawn into a Graphics object. */
export function star(g, cx, cy, r, filled) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
  }
  g.fillStyle(filled ? C.gold : C.goldDim, 1).fillPoints(pts, true);
  // Empty stars also get an outline, so filled and empty differ by shape, not only by colour.
  if (!filled) g.lineStyle(Math.max(1.5, r / 10), C.label, 0.9).strokePoints(pts, true, true);
}

/**
 * Placeholder art, generated at boot under the bible's texture names
 * (portrait_<character>_<emotion>, icon_<cuisine>), so real PNGs can replace them key for key.
 * Skips any key that a real image already loaded.
 */
export function makePlaceholderArt(scene) {
  for (const [id, ch] of Object.entries(CHARACTERS)) {
    for (const emo of EMOTIONS) {
      const key = `portrait_${id}_${emo.toLowerCase()}`;
      if (scene.textures.exists(key)) continue;
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(ch.color, 1).fillCircle(64, 64, 60);
      g.lineStyle(6, C.ink, 1).strokeCircle(64, 64, 60);
      drawFace(g, emo);
      g.generateTexture(key, 128, 128);
      g.destroy();
    }
  }
  for (const [cuisine, col] of Object.entries(CUISINES)) {
    const key = `icon_${cuisine}`;
    if (scene.textures.exists(key)) continue;
    const rt = scene.make.renderTexture({ x: 0, y: 0, width: 96, height: 96 }, false);
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(col, 1).fillRoundedRect(4, 4, 88, 88, 20);
    g.lineStyle(5, C.ink, 1).strokeRoundedRect(4, 4, 88, 88, 20);
    const label = cuisine.replace('_', ' ').split(' ').map((w) => w[0].toUpperCase()).join('') +
      (cuisine.includes('_') ? '' : cuisine[1]);
    const t = scene.make.text({ x: 48, y: 48, text: label, style: { fontFamily: PIXEL, fontSize: '36px', color: hex(C.ink) } }, false).setOrigin(0.5);
    rt.draw(g).draw(t);
    rt.saveTexture(key);
    g.destroy();
    t.destroy();
  }
}

function drawFace(g, emo) {
  const ink = C.ink;
  g.fillStyle(ink, 1);
  // eyes
  if (emo === 'HAPPY') {
    g.lineStyle(5, ink, 1);
    g.beginPath().arc(46, 58, 8, Math.PI, 0).strokePath();
    g.beginPath().arc(82, 58, 8, Math.PI, 0).strokePath();
  } else if (emo === 'SURPRISED') {
    g.fillCircle(46, 54, 8).fillCircle(82, 54, 8);
  } else if (emo === 'ANGRY' || emo === 'ANNOYED') {
    g.fillCircle(46, 58, 5).fillCircle(82, 58, 5);
    g.lineStyle(5, ink, 1);
    const tilt = emo === 'ANGRY' ? 8 : 3;
    g.lineBetween(34, 42, 56, 42 + tilt).lineBetween(94, 42, 72, 42 + tilt);
  } else {
    g.fillCircle(46, 56, 5).fillCircle(82, 56, 5);
  }
  // mouth
  g.lineStyle(5, ink, 1);
  if (emo === 'HAPPY') g.beginPath().arc(64, 74, 16, 0.15 * Math.PI, 0.85 * Math.PI).strokePath();
  else if (emo === 'SURPRISED') g.fillEllipse(64, 90, 16, 20);
  else if (emo === 'ANGRY') g.beginPath().arc(64, 100, 14, 1.15 * Math.PI, 1.85 * Math.PI).strokePath();
  else if (emo === 'ANNOYED') g.lineBetween(52, 90, 78, 86);
  else if (emo === 'HUNGRY') {
    g.fillEllipse(64, 88, 26, 16);
    g.fillStyle(0xe86a7a, 1).fillEllipse(64, 93, 12, 7);
  } else g.lineBetween(54, 88, 74, 88);
}

// ---- saved progress (per browser; best stars per level) ----
const KEY = 'lets-eat-progress-v1';
export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
export function saveStars(levelId, stars) {
  const p = loadProgress();
  if (!(levelId in p) || stars > p[levelId]) p[levelId] = stars;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: progress just won't persist */
  }
}
