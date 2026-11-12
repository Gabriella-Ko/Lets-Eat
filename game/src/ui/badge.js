import { C, CHARACTERS, PIXEL, hex } from './theme.js';

/**
 * Scrapbook badge for a callback page, centred on (x, y). Returns a container.
 * Real art can replace it key for key: a loaded texture `badge_<id>` is used as is.
 * Placeholder: a scalloped rosette in the friend's colour with two ribbon tails and the page's initials
 * ("The Milkshake Incident" -> "MI"). Locked: a grey rosette with "?" (no colour, no initials, no hint).
 */
export function badge(scene, x, y, size, page, unlocked = true) {
  const c = scene.add.container(x, y);
  const key = `badge_${page.id}`;
  if (unlocked && scene.textures.exists(key)) {
    c.add(scene.add.image(0, 0, key).setDisplaySize(size, size));
    return c;
  }
  const r = size / 2;
  const col = unlocked ? (CHARACTERS[page.friend]?.color ?? C.accent) : 0x9a8a80;
  const g = scene.add.graphics();
  // ribbon tails
  const tail = (dx) => {
    g.fillStyle(unlocked ? C.accent : 0x7d6a60, 1).fillPoints([
      { x: dx - r * 0.22, y: r * 0.3 }, { x: dx + r * 0.22, y: r * 0.3 },
      { x: dx + r * 0.22, y: r * 1.05 }, { x: dx, y: r * 0.88 }, { x: dx - r * 0.22, y: r * 1.05 },
    ], true);
  };
  tail(-r * 0.32);
  tail(r * 0.32);
  // scalloped edge
  const pts = [];
  const bumps = 14;
  for (let i = 0; i < bumps * 2; i++) {
    const a = (i * Math.PI) / bumps;
    const rr = i % 2 === 0 ? r * 0.82 : r * 0.72;
    pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
  }
  g.fillStyle(col, 1).fillPoints(pts, true);
  g.lineStyle(Math.max(2, size / 32), C.ink, 1).strokePoints(pts, true, true);
  // inner disc
  g.fillStyle(unlocked ? C.panel : 0xd8ccc2, 1).fillCircle(0, 0, r * 0.55);
  g.lineStyle(Math.max(1.5, size / 48), unlocked ? col : 0x9a8a80, 1).strokeCircle(0, 0, r * 0.47);
  const label = unlocked ? initials(page.title) : '?';
  const t = scene.add.text(0, 1, label, {
    fontFamily: PIXEL, fontSize: `${Math.round(size * (label.length > 1 ? 0.3 : 0.42))}px`,
    color: hex(unlocked ? C.ink : 0x7d6a60), fontStyle: 'bold',
  }).setOrigin(0.5);
  c.add([g, t]);
  return c;
}

function initials(title) {
  return title.replace(/^the\s+/i, '').split(/\s+/).filter((w) => !/^(of|a|an)$/i.test(w))
    .map((w) => w[0].toUpperCase()).join('').slice(0, 2);
}
