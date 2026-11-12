import Phaser from 'phaser';
import { C, W, CHARACTERS, pixel, text } from '../ui/theme.js';
import { panel, button, loadProgress } from '../ui/widgets.js';
import { scrapbookPages, pageText } from '../logic/scrapbook.js';
import { loadPages } from '../ui/scrapbookStore.js';
import { badge } from '../ui/badge.js';

const LIST = { x: 24, y: 96, w: 290, h: 468 };
const PAGE = { x: 330, y: 96, w: 606, h: 468 };
const ART = { w: 320, h: 240 }; // bible suggests 320x240 (size still Open)

/**
 * The Scrapbook (bible: Callbacks, Scrapbook): one page per callback, unlocked the first time the
 * player reads a line tagged with it. Locked pages show only "???": no friend, title or hint.
 * Page text comes from rules.json "callbacks" (mirrors the bible); art is scrap_<id>, placeholder until it exists.
 */
export default class ScrapbookScene extends Phaser.Scene {
  constructor() {
    super('Scrapbook');
  }

  /** data: { select?: callback id to open on (from the Outcome unlock card) } */
  init(data) {
    this.openOn = data?.select || null;
  }

  create() {
    const rules = this.registry.get('rules');
    const levels = this.registry.get('levels');
    this.pages = scrapbookPages(rules);
    this.unlocked = loadPages();
    // "Reached" a chapter = played at least one of its levels (stars are saved for every pick, even 0).
    const progress = loadProgress();
    this.reachedChapter = Math.max(0, ...levels.filter((l) => l.id in progress).map((l) => l.chapter));

    button(this, 80, 36, '← Levels', () => this.scene.start('Menu'), { w: 120, h: 34, size: 15, fill: C.bar });
    this.add.text(W / 2, 36, 'SCRAPBOOK', pixel(30, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    const count = this.pages.filter((p) => p.id in this.unlocked).length;
    this.add.text(W / 2, 66, `${count} / ${this.pages.length} memories collected`, pixel(15, C.highlight)).setOrigin(0.5);

    panel(this, LIST.x, LIST.y, LIST.w, LIST.h);
    panel(this, PAGE.x, PAGE.y, PAGE.w, PAGE.h);
    this.page = this.add.container(0, 0);

    const gap = 8;
    const rowH = Math.min(80, (LIST.h - 20 - gap * (this.pages.length - 1)) / Math.max(1, this.pages.length));
    this.rows = this.pages.map((p, i) => this.makeRow(p, LIST.x + 10, LIST.y + 10 + i * (rowH + gap), LIST.w - 20, rowH));

    const first = (this.openOn in this.unlocked && this.pages.find((p) => p.id === this.openOn)) || this.pages.find((p) => p.id in this.unlocked);
    if (first) this.select(first.id);
    else {
      this.page.add(this.add.text(PAGE.x + PAGE.w / 2, PAGE.y + PAGE.h / 2,
        'no memories yet.\n\nwhen the friends bring up something from their past in the chat, it lands here.',
        text(16, C.inkSoft, { align: 'center', wordWrap: { width: PAGE.w - 120 } })).setOrigin(0.5));
    }
  }

  makeRow(p, x, y, w, h) {
    const open = p.id in this.unlocked;
    const g = this.add.graphics();
    const draw = (state) => {
      g.clear();
      const fill = !open ? C.panelDark : state === 'selected' ? C.starred : state === 'hover' ? 0xfffaf2 : 0xffffff;
      g.fillStyle(fill, 1).fillRoundedRect(x, y, w, h, 8);
      g.lineStyle(state === 'selected' ? 2 : 1, state === 'selected' ? C.accent : C.panelDark, 1).strokeRoundedRect(x, y, w, h, 8);
    };
    draw();
    if (open) {
      const ch = CHARACTERS[p.friend] || { name: p.friend, color: C.inkSoft };
      badge(this, x + 8 + 24, y + h / 2 - 2, 52, p, true);
      this.add.text(x + 66, y + h / 2 - 10, p.title, pixel(15, C.ink, { fontStyle: 'bold', wordWrap: { width: w - 76 } })).setOrigin(0, 0.5);
      this.add.text(x + 66, y + h / 2 + 13, ch.name, text(13, ch.color)).setOrigin(0, 0.5);
      const zone = this.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.selected !== p.id && draw('hover'));
      zone.on('pointerout', () => this.selected !== p.id && draw());
      zone.on('pointerdown', () => this.select(p.id));
    } else {
      badge(this, x + 8 + 24, y + h / 2 - 2, 52, p, false);
      this.add.text(x + 66, y + h / 2, '???', pixel(22, C.inkSoft, { fontStyle: 'bold' })).setOrigin(0, 0.5);
    }
    return { id: p.id, draw };
  }

  select(id) {
    this.selected = id;
    for (const r of this.rows) r.draw(r.id === id ? 'selected' : undefined);
    const p = this.pages.find((x) => x.id === id);
    const ch = CHARACTERS[p.friend] || { name: p.friend, color: C.inkSoft };
    this.page.removeAll(true);

    const ax = PAGE.x + (PAGE.w - ART.w) / 2;
    const ay = PAGE.y + 22;
    this.page.add(this.drawArt(p, ax, ay));
    // Badge pinned to the picture's corner, like a sticker in a scrapbook.
    this.page.add(badge(this, ax - 8, ay + 20, 84, p, true).setAngle(-12));
    let y = ay + ART.h + 18;
    const title = this.add.text(PAGE.x + 36, y, p.title.toUpperCase(), pixel(22, C.ink, { fontStyle: 'bold' }));
    const lvl = this.registry.get('levels').find((l) => l.id === this.unlocked[id]);
    const found = lvl ? `  ·  found in level ${lvl.number}` : '';
    const who = this.add.text(PAGE.x + 36, y + 30, `a memory with ${ch.name}${found}`, text(14, ch.color, { fontStyle: 'bold' }));
    this.page.add([title, who]);
    y += 58;
    for (const [i, para] of pageText(p, this.reachedChapter).entries()) {
      const t = this.add.text(PAGE.x + 36, y, para, text(i === 0 ? 16 : 14, i === 0 ? C.ink : C.inkSoft, {
        wordWrap: { width: PAGE.w - 72, useAdvancedWrap: true }, fontStyle: i === 0 ? 'normal' : 'italic',
      }));
      this.page.add(t);
      y += t.height + 8;
    }
  }

  /** scrap_<id> if loaded; otherwise a framed placeholder naming the file the art will be. */
  drawArt(p, x, y) {
    const key = p.art.replace(/\.png$/, '');
    const c = this.add.container(0, 0);
    const frame = this.add.graphics().fillStyle(C.bar, 1).fillRoundedRect(x - 5, y - 5, ART.w + 10, ART.h + 10, 10);
    c.add(frame);
    if (this.textures.exists(key)) {
      c.add(this.add.image(x + ART.w / 2, y + ART.h / 2, key).setDisplaySize(ART.w, ART.h));
      return c;
    }
    const g = this.add.graphics();
    g.fillStyle(C.blue, 1).fillRoundedRect(x, y, ART.w, ART.h, 6);
    g.lineStyle(2, C.label, 0.5);
    for (let i = 0; i < ART.w + ART.h; i += 18) g.lineBetween(x + Math.max(0, i - ART.h), y + Math.min(ART.h, i), x + Math.min(ART.w, i), y + Math.max(0, i - ART.w));
    g.fillStyle(C.bar, 0.85).fillRoundedRect(x + 30, y + ART.h / 2 - 32, ART.w - 60, 64, 6);
    c.add([g,
      this.add.text(x + ART.w / 2, y + ART.h / 2 - 11, 'ART GOES HERE', pixel(16, C.label, { fontStyle: 'bold' })).setOrigin(0.5),
      this.add.text(x + ART.w / 2, y + ART.h / 2 + 13, p.art, text(12, C.label)).setOrigin(0.5)]);
    return c;
  }
}
