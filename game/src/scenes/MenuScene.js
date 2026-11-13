import Phaser from 'phaser';
import { C, W, H, DISTRICTS, pixel, text } from '../ui/theme.js';
import { panel, star, button, loadProgress } from '../ui/widgets.js';
import { loadPages } from '../ui/scrapbookStore.js';
import { starTotals } from '../logic/progress.js';

// Title + level select. Only unlocked levels are shown: a level opens once the previous one is
// cleared, and a chapter heading appears with its first open level. Add ?all to the URL to show every level (testing).
export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
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

    // 4 chapters x 5 levels: one row per chapter.
    const cols = 5;
    const cw = 150;
    const ch = 84;
    const x0 = W / 2 - ((cols - 1) * (cw + 20)) / 2;
    const headed = new Set();
    for (const lvl of open) {
      const col = (lvl.number - 1) % cols;
      const r = Math.floor((lvl.number - 1) / cols);
      const x = x0 + col * (cw + 20);
      const y = 210 + r * 118;
      if (!headed.has(lvl.chapter)) {
        headed.add(lvl.chapter);
        const hy = y - ch / 2 - 26;
        this.add.text(x0 - cw / 2, hy, `CHAPTER ${lvl.chapter} · ${(DISTRICTS[lvl.district] || lvl.district).toUpperCase()}`, pixel(16, C.label));
        // Chapter stars: earned / max over its built levels, and a PERFECT mark when all are 3 stars.
        const t = totals.byChapter[lvl.chapter];
        if (t) {
          const right = x0 + (cols - 1) * (cw + 20) + cw / 2;
          const score = this.add.text(right, hy, `${t.earned} / ${t.max}`, pixel(16, C.label)).setOrigin(1, 0);
          star(this.add.graphics(), score.x - score.width - 12, hy + 9, 8, t.earned > 0);
          if (t.perfect) {
            this.add.text(score.x - score.width - 28, hy, 'PERFECT', pixel(14, C.highlight, { fontStyle: 'bold' })).setOrigin(1, 0);
          }
        }
      }
      panel(this, x - cw / 2, y - ch / 2, cw, ch, C.panel, 8);
      this.add.text(x, y - 20, `LEVEL ${lvl.number}`, pixel(20, C.ink, { fontStyle: 'bold' })).setOrigin(0.5);
      this.add.text(x, y + 2, `${lvl.guests.length} friends`, text(13, C.inkSoft)).setOrigin(0.5);
      const g = this.add.graphics();
      const best = progress[lvl.id] || 0;
      for (let s = 0; s < 3; s++) star(g, x - 26 + s * 26, y + 26, 10, s < best);
      const hit = this.add.zone(x, y, cw, ch).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.scene.start('Chat', { levelId: lvl.id }));
    }
  }
}
