// City map for the menu (bible: Campaign structure: each chapter unlocks a new neighbourhood of one city).
// Draws the four districts as a placeholder map (one shape per district in its own colour) until real art
// exists under the texture key 'city_map'; then that picture is drawn and the districts become hit areas on it.
// Each district is labelled with its name and star total. A district whose chapter has no unlocked level is
// greyed out and can't be clicked; clicking an open one calls opts.onSelect(chapter).
import { C, DISTRICTS, pixel } from './theme.js';
import { panel, star } from './widgets.js';

export const CITY_MAP_KEY = 'city_map';

// Placeholder colours, one per district. Not in the bible yet (palette is still Open there).
export const DISTRICT_COLORS = {
  campus: 0x6f8f5a, // leafy green quad
  downtown: 0x5d7985, // dusty-blue towers
  night_market: 0xa3472c, // lantern red
  waterfront: 0x4f8fa8, // harbour blue
};

// Chapter order of the districts (bible: Campaign structure > Calendar), and where each sits on the map,
// as fractions of the map area: campus top left, downtown top right, night market bottom left, waterfront bottom right.
const LAYOUT = [
  { chapter: 1, district: 'campus', fx: 0, fy: 0 },
  { chapter: 2, district: 'downtown', fx: 0.5, fy: 0 },
  { chapter: 3, district: 'night_market', fx: 0, fy: 0.5 },
  { chapter: 4, district: 'waterfront', fx: 0.5, fy: 0.5 },
];
const GREY = 0x6b625e;

/**
 * Draws the city map.
 * @param {Phaser.Scene} scene
 * @param {object} opts
 * @param {number} opts.x, opts.y, opts.w, opts.h  map area (top left, size)
 * @param {object[]} opts.levels   every built level (for each chapter's district)
 * @param {object[]} opts.open     the unlocked levels
 * @param {object}   opts.totals   starTotals(levels, progress)
 * @param {number}   [opts.selected] chapter drawn as selected
 * @param {(chapter:number)=>void} [opts.onSelect]
 * @returns {{ select(chapter:number):void, unlocked:number[] }}
 */
export function cityMap(scene, opts) {
  if (scene.textures.exists(CITY_MAP_KEY)) return artMap(scene, opts);
  const { x, y, w, h, levels = [], open = [], totals = { byChapter: {} }, onSelect } = opts;
  const openChapters = new Set(open.map((l) => l.chapter));
  const hasArt = false;

  panel(scene, x, y, w, h, C.bar, 14);
  if (hasArt) {
    const img = scene.add.image(x + w / 2, y + h / 2, CITY_MAP_KEY);
    img.setScale(Math.min((w - 12) / img.width, (h - 12) / img.height));
  }

  const gap = 14;
  const outlines = {};
  for (const d of LAYOUT) {
    const district = levels.find((l) => l.chapter === d.chapter)?.district || d.district;
    const unlocked = openChapters.has(d.chapter);
    const dx = x + gap + d.fx * (w - gap);
    const dy = y + gap + d.fy * (h - gap);
    const dw = (w - gap) / 2 - gap;
    const dh = (h - gap) / 2 - gap;
    const color = unlocked ? DISTRICT_COLORS[district] ?? C.blue : GREY;

    if (!hasArt) drawDistrict(scene, district, dx, dy, dw, dh, color, unlocked);
    else if (!unlocked) scene.add.graphics().fillStyle(0x000000, 0.55).fillRoundedRect(dx, dy, dw, dh, 12);

    // Label plate: district name and its chapter's star total.
    const cx = dx + dw / 2;
    const cy = dy + dh / 2;
    const plate = scene.add.graphics();
    plate.fillStyle(C.bg, unlocked ? 0.82 : 0.6).fillRoundedRect(cx - 92, cy - 30, 184, 60, 10);
    const name = (DISTRICTS[district] || district).toUpperCase();
    scene.add.text(cx, cy - 13, name, pixel(17, unlocked ? C.label : C.goldDim, { fontStyle: 'bold' })).setOrigin(0.5);
    if (unlocked) {
      const t = totals.byChapter[d.chapter] || { earned: 0, max: 0 };
      const score = scene.add.text(cx + 10, cy + 13, `${t.earned} / ${t.max}`, pixel(15, t.perfect ? C.highlight : C.label)).setOrigin(0.5);
      star(scene.add.graphics(), score.x - score.width / 2 - 12, cy + 13, 8, t.earned > 0);
    } else {
      scene.add.text(cx, cy + 13, 'LOCKED', pixel(14, C.goldDim)).setOrigin(0.5);
    }

    const ring = scene.add.graphics();
    ring.lineStyle(4, C.highlight, 1).strokeRoundedRect(dx - 3, dy - 3, dw + 6, dh + 6, 14);
    ring.setVisible(false);
    outlines[d.chapter] = ring;

    if (unlocked) {
      const hit = scene.add.zone(cx, cy, dw, dh).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        select(d.chapter);
        if (onSelect) onSelect(d.chapter);
      });
    }
  }

  function select(chapter) {
    for (const [ch, ring] of Object.entries(outlines)) ring.setVisible(Number(ch) === chapter);
  }
  if (opts.selected != null) select(opts.selected);

  return { select, unlocked: LAYOUT.map((d) => d.chapter).filter((ch) => openChapters.has(ch)) };
}

// ---- the real map (assets/art/City Map.jpg -> texture 'city_map', 1408x768)

/**
 * Where each district sits on the picture, in the picture's own pixels: the click area, and where its star
 * badge goes (next to the district's painted label). Scaled to whatever size the map is drawn at.
 */
export const ART_DISTRICTS = [
  { chapter: 1, district: 'campus', area: [40, 200, 560, 730], badge: [300, 600] },
  { chapter: 2, district: 'downtown', area: [565, 235, 925, 730], badge: [732, 680] },
  { chapter: 3, district: 'night_market', area: [930, 380, 1380, 730], badge: [1270, 648] },
  { chapter: 4, district: 'waterfront', area: [930, 110, 1380, 376], badge: [1262, 362] },
];

/** True when the menu should use the full-width picture layout. */
export const hasCityMapArt = (scene) => scene.textures.exists(CITY_MAP_KEY);

/** The picture drawn to fill opts.w (its height follows the picture's shape), with district hotspots on it. */
function artMap(scene, opts) {
  const { x, y, w, levels = [], open = [], totals = { byChapter: {} }, onSelect } = opts;
  const openChapters = new Set(open.map((l) => l.chapter));
  const img = scene.add.image(x, y, CITY_MAP_KEY).setOrigin(0);
  const k = w / img.width;
  img.setScale(k);
  const h = img.height * k;
  const frame = scene.add.graphics();
  frame.lineStyle(4, C.bar, 1).strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, 10);
  const px = (ix) => x + ix * k;
  const py = (iy) => y + iy * k;

  const rings = {};
  for (const d of ART_DISTRICTS) {
    const district = levels.find((l) => l.chapter === d.chapter)?.district || d.district;
    const unlocked = openChapters.has(d.chapter);
    const [ax1, ay1, ax2, ay2] = d.area;
    const rx = px(ax1), ry = py(ay1), rw = (ax2 - ax1) * k, rh = (ay2 - ay1) * k;
    if (!unlocked) scene.add.graphics().fillStyle(0x000000, 0.58).fillRoundedRect(rx, ry, rw, rh, 12);

    // Badge next to the painted label: star total when open, LOCKED when not.
    const bx = px(d.badge[0]), by = py(d.badge[1]);
    const t = totals.byChapter[d.chapter] || { earned: 0, max: 0 };
    const label = unlocked ? `${t.earned} / ${t.max}` : 'LOCKED';
    const txt = scene.add.text(0, 0, label, pixel(14, unlocked ? (t.perfect ? C.highlight : C.label) : C.goldDim, { fontStyle: 'bold' }));
    const bw = txt.width + (unlocked ? 40 : 22), bh = 26;
    const plate = scene.add.graphics();
    plate.fillStyle(C.bg, 0.88).fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 13);
    plate.lineStyle(2, unlocked ? C.label : C.goldDim, 0.8).strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 13);
    txt.setPosition(bx - bw / 2 + (unlocked ? 30 : 11), by - txt.height / 2).setDepth(1);
    if (unlocked) star(scene.add.graphics().setDepth(1), bx - bw / 2 + 16, by, 7, t.earned > 0);

    const ring = scene.add.graphics().setDepth(2);
    const drawRing = (mode) => {
      ring.clear();
      if (mode) ring.lineStyle(mode === 'selected' ? 4 : 2, C.highlight, mode === 'selected' ? 1 : 0.7).strokeRoundedRect(rx, ry, rw, rh, 12);
    };
    rings[d.chapter] = { drawRing, selected: false };
    if (unlocked) {
      const hit = scene.add.zone(rx + rw / 2, ry + rh / 2, rw, rh).setInteractive({ useHandCursor: true });
      hit.districtName = DISTRICTS[district] || district;
      hit.on('pointerover', () => !rings[d.chapter].selected && drawRing('hover'));
      hit.on('pointerout', () => !rings[d.chapter].selected && drawRing(null));
      hit.on('pointerdown', () => {
        select(d.chapter);
        if (onSelect) onSelect(d.chapter);
      });
    }
  }

  function select(chapter) {
    for (const [ch, r] of Object.entries(rings)) {
      r.selected = Number(ch) === chapter;
      r.drawRing(r.selected ? 'selected' : null);
    }
  }
  if (opts.selected != null) select(opts.selected);
  return { select, unlocked: ART_DISTRICTS.map((d) => d.chapter).filter((ch) => openChapters.has(ch)), height: h };
}

// One placeholder district: a block of land in the district's colour with a few shapes that hint at it.
function drawDistrict(scene, district, x, y, w, h, color, unlocked) {
  const g = scene.add.graphics();
  g.fillStyle(color, unlocked ? 1 : 0.55).fillRoundedRect(x, y, w, h, 12);
  const detail = unlocked ? 0xffffff : 0x000000;
  g.fillStyle(detail, 0.14);
  if (district === 'campus') {
    // a quad with buildings round it
    g.fillCircle(x + w / 2, y + h / 2, Math.min(w, h) * 0.32);
    for (let i = 0; i < 4; i++) g.fillRect(x + 14 + i * (w - 40) / 3, y + 12, 26, 18);
  } else if (district === 'downtown') {
    // a skyline of towers
    const n = 7;
    for (let i = 0; i < n; i++) {
      const th = h * (0.3 + ((i * 37) % 5) * 0.1);
      g.fillRect(x + 12 + i * ((w - 24) / n), y + h - th - 8, (w - 24) / n - 6, th);
    }
  } else if (district === 'night_market') {
    // rows of stalls under lantern dots
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) g.fillRect(x + 14 + i * ((w - 28) / 6), y + h - 30 - r * 34, (w - 28) / 6 - 6, 20);
    for (let i = 0; i < 8; i++) g.fillCircle(x + 18 + i * ((w - 36) / 7), y + 18, 5);
  } else {
    // water along the bottom, a pier
    g.fillRect(x, y + h * 0.62, w, h * 0.38 - 12);
    g.fillRect(x + w * 0.7, y + h * 0.4, 14, h * 0.4);
  }
}
