import Phaser from 'phaser';
import { C, W, H, DISTRICTS, pixel, text } from '../ui/theme.js';
import { panel, star, button, loadProgress } from '../ui/widgets.js';
import { loadPages } from '../ui/scrapbookStore.js';
import { starTotals } from '../logic/progress.js';
import { showChapterIntro } from '../ui/chapterIntro.js';
import { cityMap } from '../ui/cityMap.js';
import { tween } from '../ui/motion.js';

// Title + level select. Only unlocked levels are shown: a level opens once the previous one is
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

    this.add.text(W / 2, 58, "LET'S EAT!", pixel(64, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    this.add.text(W / 2, 108, 'read the chat · f‌ind the spot · feed your friends', pixel(18, C.highlight)).setOrigin(0.5); // ‌ stops the font's "fi" ligature

    // Scrapbook (bible: Scrapbook > Where), with how many memories are collected.
    const pages = Object.keys(this.registry.get('rules').callbacks || {}).length;
    if (pages) {
      const got = Object.keys(loadPages()).length;
      button(this, W - 100, 40, `Scrapbook ${got}/${pages}`, () => this.scene.start('Scrapbook'), { w: 168, h: 38, size: 15, fill: C.blue });
    }
    // Accessibility options: text size, chat pace, high contrast, reduce motion.
    button(this, 90, 40, 'Options', () => this.scene.start('Options'), { w: 140, h: 38, size: 15, fill: C.bar });
    this.input.keyboard?.on('keydown-O', () => this.scene.start('Options'));
    // Credits: music and art (bible: Game identity > Audio).
    button(this, 90, 84, 'Credits', () => this.scene.start('Credits'), { w: 140, h: 34, size: 15, fill: C.bar });
    this.input.keyboard?.on('keydown-C', () => this.scene.start('Credits'));

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
    const total = this.add.text(W - 22, 72, `${totals.earned} / ${totals.max}`, pixel(16, C.label)).setOrigin(1, 0);
    star(this.add.graphics(), total.x - total.width - 12, 81, 8, totals.earned > 0);

    // City map: one district per chapter; locked districts are greyed. Clicking an open one lists its levels
    // on the right. The last district picked is kept in the registry; otherwise the newest open chapter.
    const openChapters = [...new Set(open.map((l) => l.chapter))].sort((a, b) => a - b);
    const saved = this.registry.get('menuChapter');
    const selected = openChapters.includes(saved) ? saved : openChapters[openChapters.length - 1];
    cityMap(this, {
      x: 24, y: 140, w: 470, h: 476, levels, open, totals, selected,
      onSelect: (chapter) => this.showChapter(chapter, open, totals, progress),
    });
    this.showChapter(selected, open, totals, progress);
  }

  // The chosen district's level cards, as the menu listed them before the map: a heading with chapter stars,
  // then one card per unlocked level with its best stars.
  showChapter(chapter, open, totals, progress) {
    this.registry.set('menuChapter', chapter);
    if (this.cards) this.cards.destroy();
    const c = (this.cards = this.add.container(0, 0));
    const lvls = open.filter((l) => l.chapter === chapter);
    if (!lvls.length) return;
    const left = 520;
    const right = W - 24;
    const cw = right - left;
    const ch = 74;
    const hy = 140;

    const district = (DISTRICTS[lvls[0].district] || lvls[0].district).toUpperCase();
    const heading = this.add.text(left, hy, `CHAPTER ${chapter} · ${district}`, pixel(16, C.label));
    // Tapping the heading shows the chapter's intro card again.
    heading.setInteractive({ useHandCursor: true }).on('pointerdown', () => showChapterIntro(this, chapter));
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
      hit.on('pointerdown', () => this.scene.start('Chat', { levelId: lvl.id }));
      c.add(hit);
    });

    c.alpha = 0;
    c.x = 12;
    tween(this, { targets: c, alpha: 1, x: 0, duration: 180, ease: 'Quad.easeOut' });
  }
}
