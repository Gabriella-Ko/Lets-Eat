import Phaser from 'phaser';
import { C, W, CHARACTERS, pixel, readText } from '../ui/theme.js';
import { panel, button, portrait, loadProgress } from '../ui/widgets.js';
import { loadOpened } from '../ui/openedStore.js';
import { friendCards } from '../logic/friends.js';
import { tween } from '../ui/motion.js';

const COLS = 3;
const CARD = { w: 280, h: 236, gapX: 20, gapY: 20, top: 96 };
const PORTRAIT = 72;

/**
 * Friends (bible: Cast; Clue rules). One card per friend: portrait, name and permanent needs
 * (rules.json characters). A friend counts as met once the player has opened a level they are a guest in;
 * a need shows only after the player has cleared (1+ stars) a level with that friend whose chat has a line
 * tagged with it, so implied clues are never solved early. Everything else reads "???".
 * Back with "← Levels" or Esc.
 */
export default class FriendsScene extends Phaser.Scene {
  constructor() {
    super('Friends');
  }

  create() {
    const levels = this.registry.get('levels') || [];
    const characters = (this.registry.get('rules') || {}).characters || {};
    const cards = friendCards(levels, characters, loadProgress(), loadOpened());

    button(this, 80, 36, '← Levels', () => this.scene.start('Menu'), { w: 120, h: 34, size: 15, fill: C.bar });
    this.add.text(W / 2, 36, 'FRIENDS', pixel(30, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    const met = cards.filter((c) => c.met).length;
    this.add.text(W / 2, 66, `what you've learned about the crew · met ${met}/${cards.length}`, pixel(15, C.highlight)).setOrigin(0.5);

    const left = (W - (COLS * CARD.w + (COLS - 1) * CARD.gapX)) / 2;
    cards.forEach((f, i) => {
      const x = left + (i % COLS) * (CARD.w + CARD.gapX);
      const y = CARD.top + Math.floor(i / COLS) * (CARD.h + CARD.gapY);
      const c = this.add.container(x, y);
      c.add(panel(this, 0, 0, CARD.w, CARD.h, f.met ? C.panel : C.bar, 12));

      const px = 22 + PORTRAIT / 2;
      const py = 22 + PORTRAIT / 2;
      if (f.met) {
        c.add(portrait(this, px, py, PORTRAIT, f.id, 'NEUTRAL'));
      } else {
        // Not met: no portrait, no colour, no name.
        const g = this.add.graphics();
        g.fillStyle(C.inkSoft, 0.35).fillRoundedRect(px - PORTRAIT / 2, py - PORTRAIT / 2, PORTRAIT, PORTRAIT, 6);
        c.add(g);
        c.add(this.add.text(px, py, '?', pixel(40, C.label, { fontStyle: 'bold' })).setOrigin(0.5));
      }
      const name = f.met ? (CHARACTERS[f.id]?.name || f.id) : '???';
      c.add(this.add.text(px + PORTRAIT / 2 + 16, py, name, pixel(24, f.met ? C.ink : C.label, { fontStyle: 'bold' })).setOrigin(0, 0.5));

      const wrap = { wordWrap: { width: CARD.w - 44, useAdvancedWrap: true } };
      let ny = 22 + PORTRAIT + 18;
      if (f.met) {
        c.add(this.add.text(22, ny, 'ALWAYS NEEDS', pixel(13, C.inkSoft, { fontStyle: 'bold' })));
        ny += 22;
        const lines = f.noNeeds ? ['Nothing fixed: up for anything'] : f.needs.map((n) => (n.known ? `• ${n.label}` : '• ???'));
        if (!lines.length) lines.push('???');
        for (const l of lines) {
          const t = this.add.text(22, ny, l, readText(15, l.includes('???') ? C.inkSoft : C.ink, wrap));
          c.add(t);
          ny += t.height + 4;
        }
      } else {
        c.add(this.add.text(22, ny, '???', readText(15, C.label, wrap)));
      }

      c.alpha = 0;
      tween(this, { targets: c, alpha: 1, duration: 200, delay: i * 50, ease: 'Quad.easeOut' });
    });

    this.add.text(W / 2, 624, 'needs show up here once you clear a level where they come up in the chat', pixel(13, C.label)).setOrigin(0.5);

    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('Menu'));
  }
}
