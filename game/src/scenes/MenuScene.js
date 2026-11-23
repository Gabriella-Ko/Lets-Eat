import Phaser from 'phaser';
import { C, W, H, DISTRICTS, CHARACTERS, pixel, text } from '../ui/theme.js';
import { panel, star, button, portrait, loadProgress } from '../ui/widgets.js';
import { loadPages } from '../ui/scrapbookStore.js';
import { starTotals } from '../logic/progress.js';
import { showChapterIntro } from '../ui/chapterIntro.js';
import { cityMap, hasCityMapArt } from '../ui/cityMap.js';
import { tween } from '../ui/motion.js';
import { play as playSfx } from '../ui/sfx.js';

// Map layout drafts for Gabriella (2026-11-23): ?menuLayout=m1|m2|m3, default = today's layout.
//   m1: buttons in a row across the top, a smaller map on the left with the chapter under it, the level list on the right
//   m2: the map edge to edge across the top, the level cards on a dark strip along the bottom
//   m3: a sidebar with every button, a bigger map beside it, tall level cards with the friends' faces
const MENU_LAYOUTS = {
  current: {
    map: { x: 24, y: 12, w: W - 48 }, cards: 'row', row: { left: 60, right: W - 24 },
    btn: { title: [90, 30, 140], options: [90, 72, 140], credits: [90, 114, 140], scrap: [W - 100, 40, 168], friends: [W - 100, 112, 168] },
    total: [W - 30, 72],
  },
  m1: {
    map: { x: 24, y: 62, w: 620 }, cards: 'list', list: { left: 664, right: W - 24, top: 62 }, chapterUnderMap: true,
    btn: { title: [94, 28, 140], options: [244, 28, 140], credits: [394, 28, 140], friends: [W - 280, 28, 168], scrap: [W - 100, 28, 168] },
    total: [632, 72],
  },
  m2: {
    map: { x: 0, y: 0, w: W }, cards: 'row', row: { left: 60, right: W - 24 }, strip: true,
    btn: { title: [90, 30, 140], options: [90, 72, 140], credits: [90, 114, 140], scrap: [W - 100, 30, 168], friends: [W - 100, 72, 168] },
    total: [W - 30, 100],
  },
  m3: {
    map: { x: 206, y: 14, w: W - 222 }, cards: 'tall', row: { left: 206, right: W - 16 }, sidebar: 190,
    btn: { title: [95, 34, 160], options: [95, 80, 160], credits: [95, 126, 160], friends: [95, 190, 160], scrap: [95, 236, 160] },
    total: [150, 290],
  },
};
const menuLayout = () => MENU_LAYOUTS[new URLSearchParams(window.location.search).get('menuLayout')] || MENU_LAYOUTS.current;

// Level select (the city map). Only unlocked levels are shown: a level opens once the previous one is
// cleared, and a chapter heading appears with its first open level. Add ?all to the URL to show every level (testing).
export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.cards = null; // the old container went with the previous run of this scene
    const levels = this.registry.get('levels');
    const progress = loadProgress();
    // ?all is a testing shortcut, so it only works on the dev server, never in a built game.
    const unlockAll = import.meta.env.DEV && new URLSearchParams(window.location.search).has('all');

    // No title or catch phrase here: they live on the Title screen (bible: Title screen).
    this.art = hasCityMapArt(this);
    const ML = (this.ML = this.art ? menuLayout() : MENU_LAYOUTS.current);
    const B = ML.btn;
    if (ML.sidebar) {
      const sb = this.add.graphics();
      sb.fillStyle(C.bar, 1).fillRect(0, 0, ML.sidebar, H);
      sb.fillStyle(0x000000, 0.25).fillRect(ML.sidebar, 0, 4, H);
    }

    // Scrapbook (bible: Scrapbook > Where), with how many memories are collected.
    const pages = Object.keys(this.registry.get('rules').callbacks || {}).length;
    if (pages) {
      const got = Object.keys(loadPages()).length;
      button(this, B.scrap[0], B.scrap[1], `Scrapbook ${got}/${pages}`, () => this.scene.start('Scrapbook'), { w: B.scrap[2], h: 34, size: 15, fill: C.blue }).setDepth(5);
    }
    // Back to the Title screen (Gabriella, 2026-11-23): button top left, Esc or Backspace. The three left
    // buttons stack above the map's district hotspots (campus starts at about y 145 on the picture).
    const toTitle = () => {
      if (this.registry.get('hudPanelOpen') || this.introOpen) return; // Esc closes the volume panel / intro card first
      this.scene.start('Title');
    };
    button(this, B.title[0], B.title[1], '← Title', () => this.scene.start('Title'), { w: B.title[2], h: 34, size: 15, fill: C.bar }).setDepth(5);
    this.input.keyboard?.on('keydown-ESC', toTitle);
    this.input.keyboard?.on('keydown-BACKSPACE', toTitle);
    // Accessibility options: text size, chat pace, high contrast, reduce motion.
    button(this, B.options[0], B.options[1], 'Options', () => this.scene.start('Options'), { w: B.options[2], h: 34, size: 15, fill: C.bar }).setDepth(5);
    this.input.keyboard?.on('keydown-O', () => this.scene.start('Options'));
    // Credits: music and art (bible: Game identity > Audio).
    button(this, B.credits[0], B.credits[1], 'Credits', () => this.scene.start('Credits'), { w: B.credits[2], h: 34, size: 15, fill: C.bar }).setDepth(5);
    this.input.keyboard?.on('keydown-C', () => this.scene.start('Credits'));
    // Friends: who you've met and the permanent needs you've uncovered (bible: Cast).
    button(this, B.friends[0], B.friends[1], 'Friends', () => this.scene.start('Friends'), { w: B.friends[2], h: 34, size: 15, fill: CHARACTERS.mina.color }).setDepth(5);
    this.input.keyboard?.on('keydown-F', () => this.scene.start('Friends'));

    const open = levels.filter((lvl) => {
      const prev = levels.find((l) => l.number === lvl.number - 1);
      return unlockAll || lvl.number === 1 || !prev || (progress[prev.id] || 0) > 0;
    });
    if (!open.length) {
      this.add.text(W / 2, H / 2, 'No levels found in content/levels.', text(20, C.panel)).setOrigin(0.5);
      return;
    }

    // Campaign star total over every built level (bible: Scoring rules, Campaign structure).
    const totals = starTotals(levels, progress);
    // Over the map's sky the total sits on a dark pill so it stays readable.
    const pill = this.add.graphics().setDepth(4);
    const [tx, ty] = ML.total;
    const total = this.add.text(tx, ty, `${totals.earned} / ${totals.max}`, pixel(16, C.label)).setOrigin(1, 0).setDepth(5);
    if (this.art) pill.fillStyle(C.bg, 0.85).fillRoundedRect(total.x - total.width - 36, ty - 6, total.width + 52, 30, 15);
    star(this.add.graphics().setDepth(5), total.x - total.width - 14, ty + 9, 8, totals.earned > 0);

    // City map: one district per chapter; locked districts are greyed. Clicking an open one lists its levels
    // on the right. The last district picked is kept in the registry; otherwise the newest open chapter.
    const openChapters = [...new Set(open.map((l) => l.chapter))].sort((a, b) => a - b);
    const saved = this.registry.get('menuChapter');
    const selected = openChapters.includes(saved) ? saved : openChapters[openChapters.length - 1];
    // With the picture: full width at the top, level cards in a row below. Without it: map left, list right.
    const box = this.art ? ML.map : { x: 24, y: 140, w: 470, h: 476 };
    const map = cityMap(this, {
      ...box, levels, open, totals, selected,
      onSelect: (chapter) => this.showChapter(chapter, open, totals, progress),
    });
    this.rowTop = this.art ? box.y + map.height + 12 : null;
    this.mapBottom = this.art ? box.y + map.height : null;
    if (ML.strip) {
      // m2: a dark strip under the edge-to-edge map, behind the heading and the level cards
      this.add.graphics().fillStyle(C.bar, 1).fillRect(0, this.mapBottom, W, H - this.mapBottom).setDepth(-1);
      this.rowTop = this.mapBottom + 8;
    }
    this.showChapter(selected, open, totals, progress);

    // Keyboard: up/down move the focus ring between level cards, left/right switch district, Enter opens.
    const kb = this.input.keyboard;
    if (!kb) return;
    const move = (d) => {
      if (!this.levelCards?.length) return;
      this.focus = (this.focus + d + this.levelCards.length) % this.levelCards.length;
      this.drawFocus();
    };
    const district = (d) => {
      const list = map.unlocked.length ? map.unlocked : openChapters;
      const i = list.indexOf(this.registry.get('menuChapter'));
      const next = list[(i + d + list.length) % list.length];
      if (next == null || next === this.registry.get('menuChapter')) return;
      map.select(next);
      this.showChapter(next, open, totals, progress);
    };
    this.introOpen = false;
    const when = (fn) => () => !this.introOpen && fn();
    kb.on('keydown-UP', when(() => move(-1)));
    kb.on('keydown-DOWN', when(() => move(1)));
    kb.on('keydown-LEFT', when(() => district(-1)));
    kb.on('keydown-RIGHT', when(() => district(1)));
    kb.on('keydown-ENTER', () => {
      if (this.introOpen) return;
      const card = this.levelCards?.[this.focus];
      if (!card) return;
      playSfx(this, 'click');
      this.scene.start('Chat', { levelId: card.lvl.id });
    });
  }

  /** Focus ring (C.highlight, read at draw time so High contrast applies) around the focused level card. */
  drawFocus() {
    const g = this.focusRing;
    const card = this.levelCards?.[this.focus];
    if (!g || !card) return;
    g.clear().lineStyle(4, C.highlight, 1).strokeRoundedRect(card.x - 4, card.y - 4, card.w + 8, card.h + 8, 10);
  }

  // The chosen district's level cards, as the menu listed them before the map: a heading with chapter stars,
  // then one card per unlocked level with its best stars.
  showChapter(chapter, open, totals, progress) {
    this.registry.set('menuChapter', chapter);
    if (this.cards) this.cards.destroy();
    const c = (this.cards = this.add.container(0, 0));
    const lvls = open.filter((l) => l.chapter === chapter);
    this.levelCards = [];
    this.focus = 0;
    if (!lvls.length) return;
    if (this.art && this.ML.cards === 'row') return this.showChapterRow(c, chapter, lvls, totals, progress);
    if (this.art && this.ML.cards === 'tall') return this.showChapterTall(c, chapter, lvls, totals, progress);
    const L = this.art ? this.ML.list : { left: 520, right: W - 24, top: 140 };
    const left = L.left;
    const right = L.right;
    const cw = right - left;
    const ch = this.art ? 72 : 74;
    const hy = L.top;
    if (this.art && this.ML.chapterUnderMap) this.chapterCard(c, chapter, lvls, totals);

    const district = (DISTRICTS[lvls[0].district] || lvls[0].district).toUpperCase();
    const heading = this.add.text(left, hy, `CHAPTER ${chapter} · ${district}`, pixel(16, C.label));
    // Tapping the heading shows the chapter's intro card again.
    heading.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.introOpen = true; // the menu's keys wait while the card is up
      showChapterIntro(this, chapter, () => (this.introOpen = false));
    });
    c.add(heading);
    // Chapter stars: earned / max over its built levels, and a PERFECT mark when all are 3 stars.
    const t = totals.byChapter[chapter];
    if (t) {
      const score = this.add.text(right, hy, `${t.earned} / ${t.max}`, pixel(16, C.label)).setOrigin(1, 0);
      const sg = this.add.graphics();
      star(sg, score.x - score.width - 12, hy + 9, 8, t.earned > 0);
      c.add([score, sg]);
      if (t.perfect) c.add(this.add.text(score.x - score.width - 28, hy, 'PERFECT', pixel(14, C.highlight, { fontStyle: 'bold' })).setOrigin(1, 0));
    }

    lvls.forEach((lvl, i) => {
      const y = hy + 34 + i * (ch + 14);
      const cy = y + ch / 2;
      c.add(panel(this, left, y, cw, ch, C.panel, 8));
      c.add(this.add.text(left + 20, cy - 12, `LEVEL ${lvl.number}`, pixel(20, C.ink, { fontStyle: 'bold' })).setOrigin(0, 0.5));
      c.add(this.add.text(left + 20, cy + 14, `${lvl.guests.length} friends`, text(13, C.inkSoft)).setOrigin(0, 0.5));
      const g = this.add.graphics();
      const best = progress[lvl.id] || 0;
      for (let s = 0; s < 3; s++) star(g, right - 82 + s * 26, cy, 10, s < best);
      c.add(g);
      const hit = this.add.zone(left + cw / 2, cy, cw, ch).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => { playSfx(this, 'click'); this.scene.start('Chat', { levelId: lvl.id }); });
      c.add(hit);
      this.levelCards.push({ lvl, x: left, y, w: cw, h: ch });
    });
    this.focusRing = this.add.graphics();
    c.add(this.focusRing);
    this.drawFocus();

    c.alpha = 0;
    c.x = 12;
    tween(this, { targets: c, alpha: 1, x: 0, duration: 180, ease: 'Quad.easeOut' });
  }

  /** m1: under the map, the chosen chapter's name, its stars and a button for its intro card. */
  chapterCard(c, chapter, lvls, totals) {
    const x = this.ML.map.x, y = this.mapBottom + 16, w = this.ML.map.w, h = H - 16 - y;
    c.add(panel(this, x, y, w, h, C.bar, 10));
    const district = (DISTRICTS[lvls[0].district] || lvls[0].district).toUpperCase();
    c.add(this.add.text(x + 60, y + 22, `CHAPTER ${chapter}`, pixel(14, C.label)));
    c.add(this.add.text(x + 60, y + 44, district, pixel(26, C.panel, { fontStyle: 'bold' })));
    const t = totals.byChapter[chapter];
    if (t) {
      const sg = this.add.graphics();
      star(sg, x + 72, y + 108, 11, t.earned > 0);
      c.add([sg, this.add.text(x + 92, y + 108, `${t.earned} / ${t.max} stars`, pixel(15, C.label)).setOrigin(0, 0.5)]);
    }
    c.add(button(this, x + w - 110, y + h - 34, 'Chapter intro', () => {
      this.introOpen = true;
      showChapterIntro(this, chapter, () => (this.introOpen = false));
    }, { w: 180, h: 34, size: 14, fill: C.blue }));
  }

  /** m3: tall level cards under the map: level number, best stars, and the friends coming along. */
  showChapterTall(c, chapter, lvls, totals, progress) {
    const { left, right } = this.ML.row, gap = 12;
    const hy = this.rowTop;
    const district = (DISTRICTS[lvls[0].district] || lvls[0].district).toUpperCase();
    const heading = this.add.text(left, hy, `CHAPTER ${chapter} · ${district}`, pixel(16, C.label));
    heading.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.introOpen = true;
      showChapterIntro(this, chapter, () => (this.introOpen = false));
    });
    c.add(heading);
    const t = totals.byChapter[chapter];
    if (t) {
      const score = this.add.text(right, hy, `${t.earned} / ${t.max}`, pixel(16, C.label)).setOrigin(1, 0);
      const sg = this.add.graphics();
      star(sg, score.x - score.width - 12, hy + 9, 8, t.earned > 0);
      c.add([score, sg]);
    }
    const top = hy + 28;
    const ch = H - 14 - top;
    const cw = (right - left - gap * 4) / 5;
    lvls.forEach((lvl, i) => {
      const x = left + i * (cw + gap);
      c.add(panel(this, x, top, cw, ch, C.panel, 10));
      c.add(this.add.text(x + cw / 2, top + 22, `LEVEL ${lvl.number}`, pixel(18, C.ink, { fontStyle: 'bold' })).setOrigin(0.5));
      const g = this.add.graphics();
      const best = progress[lvl.id] || 0;
      for (let s = 0; s < 3; s++) star(g, x + cw / 2 - 26 + s * 26, top + 52, 10, s < best);
      c.add(g);
      const n = lvl.guests.length, size = 30, step = Math.min(size + 4, (cw - 20) / n);
      lvl.guests.forEach((id, k) => c.add(portrait(this, x + cw / 2 - ((n - 1) * step) / 2 + k * step, top + 96, size, id, 'HAPPY')));
      c.add(this.add.text(x + cw / 2, top + 128, `${n} friends`, text(12, C.inkSoft)).setOrigin(0.5));
      const hit = this.add.zone(x + cw / 2, top + ch / 2, cw, ch).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => { playSfx(this, 'click'); this.scene.start('Chat', { levelId: lvl.id }); });
      c.add(hit);
      this.levelCards.push({ lvl, x, y: top, w: cw, h: ch });
    });
    this.focusRing = this.add.graphics();
    c.add(this.focusRing);
    this.drawFocus();
    c.alpha = 0;
    tween(this, { targets: c, alpha: 1, duration: 180, ease: 'Quad.easeOut' });
  }

  /** Map layout: heading with chapter stars, then the district's level cards side by side under the map. */
  showChapterRow(c, chapter, lvls, totals, progress) {
    const { left, right } = this.ML.row, gap = 12; // room bottom left for the music button (HudScene)
    const hy = this.rowTop;
    const district = (DISTRICTS[lvls[0].district] || lvls[0].district).toUpperCase();
    const heading = this.add.text(left, hy, `CHAPTER ${chapter} · ${district}`, pixel(15, C.label));
    heading.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.introOpen = true;
      showChapterIntro(this, chapter, () => (this.introOpen = false));
    });
    c.add(heading);
    const t = totals.byChapter[chapter];
    if (t) {
      const score = this.add.text(right, hy, `${t.earned} / ${t.max}`, pixel(15, C.label)).setOrigin(1, 0);
      const sg = this.add.graphics();
      star(sg, score.x - score.width - 12, hy + 8, 8, t.earned > 0);
      c.add([score, sg]);
      if (t.perfect) c.add(this.add.text(score.x - score.width - 28, hy, 'PERFECT', pixel(13, C.highlight, { fontStyle: 'bold' })).setOrigin(1, 0));
    }
    const top = hy + 24;
    const ch = Math.max(56, H - 10 - top);
    const cw = (right - left - gap * 4) / 5; // a chapter has 5 levels
    lvls.forEach((lvl, i) => {
      const x = left + i * (cw + gap);
      c.add(panel(this, x, top, cw, ch, C.panel, 8));
      c.add(this.add.text(x + 14, top + 16, `LEVEL ${lvl.number}`, pixel(17, C.ink, { fontStyle: 'bold' })).setOrigin(0, 0.5));
      c.add(this.add.text(x + 14, top + 36, `${lvl.guests.length} friends`, text(12, C.inkSoft)).setOrigin(0, 0.5));
      const g = this.add.graphics();
      const best = progress[lvl.id] || 0;
      for (let s = 0; s < 3; s++) star(g, x + cw - 64 + s * 22, top + 18, 8, s < best);
      c.add(g);
      const hit = this.add.zone(x + cw / 2, top + ch / 2, cw, ch).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => { playSfx(this, 'click'); this.scene.start('Chat', { levelId: lvl.id }); });
      c.add(hit);
      this.levelCards.push({ lvl, x, y: top, w: cw, h: ch });
    });
    this.focusRing = this.add.graphics();
    c.add(this.focusRing);
    this.drawFocus();
    c.alpha = 0;
    tween(this, { targets: c, alpha: 1, duration: 180, ease: 'Quad.easeOut' });
  }
}
