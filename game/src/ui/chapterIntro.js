// Chapter intro cards (bible: Campaign structure > Calendar). Each chapter is a season; the card shows
// "CHAPTER N", the district and the season, plus the Calendar's "typical reasons" line. No new story text.
// Shown automatically the first time a level of a chapter opens (remembered in localStorage); the menu's
// chapter headings show it again on request.
import { tween } from './motion.js';
import { C, W, H, DISTRICTS, pixel, text, readText } from './theme.js';

/** Calendar wording from the bible, word for word. */
export const CHAPTER_INTROS = {
  1: { district: 'campus', season: 'Spring semester', reasons: 'Between classes, study groups' },
  2: { district: 'downtown', season: 'Summer internships', reasons: 'Lunch breaks' },
  3: { district: 'night_market', season: 'Late summer nights', reasons: 'Warm evenings' },
  4: { district: 'waterfront', season: 'End of summer', reasons: "Before Maya's trip, quiet dinners and celebrations" },
};

const KEY = 'lets-eat-chapter-intros-v1';
let memory = {}; // fallback when storage is blocked

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved === 'object') return saved;
  } catch {
    /* storage blocked or corrupt */
  }
  return { ...memory };
}

/** Has the player already seen this chapter's card? */
export function chapterIntroSeen(chapter) {
  return !!load()[chapter];
}

function markSeen(chapter) {
  const seen = { ...load(), [chapter]: true };
  memory = seen;
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* kept in memory for this session */
  }
}

/**
 * Card over the whole screen. Continue with a click, Enter or Esc; onDone runs once, as it closes.
 * Marks the chapter as seen. Returns a handle with close(), or null for an unknown chapter (onDone runs at once).
 */
export function showChapterIntro(scene, chapter, onDone = () => {}) {
  const info = CHAPTER_INTROS[chapter];
  if (!info) {
    onDone();
    return null;
  }
  markSeen(chapter);

  const root = scene.add.container(0, 0).setDepth(1000);
  const shade = scene.add.rectangle(W / 2, H / 2, W, H, C.bg, 0.82);
  const blocker = scene.add.zone(W / 2, H / 2, W, H).setInteractive();
  blocker.isIntro = true; // so scene-wide pointer handlers can ignore the click that closes the card
  root.add([shade, blocker]);

  const cw = 520;
  const ch = 280;
  const card = scene.add.container(W / 2, H / 2);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.3).fillRoundedRect(-cw / 2 + 4, -ch / 2 + 6, cw, ch, 12);
  g.fillStyle(C.panel, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 12);
  g.lineStyle(3, C.accent, 1).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 12);
  g.fillStyle(C.bar, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, 56, { tl: 12, tr: 12, bl: 0, br: 0 });
  const title = scene.add.text(0, -ch / 2 + 28, `CHAPTER ${chapter}`, pixel(28, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
  const district = scene.add.text(0, -52, (DISTRICTS[info.district] || info.district).toUpperCase(), pixel(34, C.ink, { fontStyle: 'bold' })).setOrigin(0.5);
  const season = scene.add.text(0, -8, info.season, pixel(22, C.accentDark)).setOrigin(0.5);
  const reasons = scene.add.text(0, 40, info.reasons, readText(18, C.inkSoft, { align: 'center', wordWrap: { width: cw - 60 } })).setOrigin(0.5);
  const hint = scene.add.text(0, ch / 2 - 26, 'click, Enter or Esc to continue', text(13, C.inkSoft)).setOrigin(0.5);
  card.add([g, title, district, season, reasons, hint]);
  root.add(card);

  root.setAlpha(0);
  card.y = H / 2 + 30;
  tween(scene, { targets: root, alpha: 1, duration: 250, ease: 'Sine.easeOut' });
  tween(scene, { targets: card, y: H / 2, duration: 350, ease: 'Back.easeOut' });

  const kb = scene.input.keyboard;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    kb?.off('keydown-ENTER', close);
    kb?.off('keydown-ESC', close);
    blocker.disableInteractive();
    tween(scene, { targets: root, alpha: 0, duration: 200, ease: 'Sine.easeIn', onComplete: () => root.destroy() });
    onDone();
  };
  // Close on release, and only for a press that began on the card, so the click that opened it
  // (a menu heading) doesn't close it again and the closing click doesn't also skip a chat message.
  let pressed = false;
  blocker.on('pointerdown', () => (pressed = true));
  blocker.on('pointerup', () => pressed && close());
  kb?.on('keydown-ENTER', close);
  kb?.on('keydown-ESC', close);
  scene.events.once('shutdown', () => {
    kb?.off('keydown-ENTER', close);
    kb?.off('keydown-ESC', close);
  });
  return { close };
}
