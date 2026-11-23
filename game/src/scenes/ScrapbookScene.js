import Phaser from 'phaser';
import { C, W, CHARACTERS, pixel, text, readText } from '../ui/theme.js';
import { button, loadProgress } from '../ui/widgets.js';
import { scrapbookPages, pageText } from '../logic/scrapbook.js';
import { loadPages } from '../ui/scrapbookStore.js';
import { badge } from '../ui/badge.js';
import { tween } from '../ui/motion.js';
import { pageAnimations } from '../ui/settings.js';

// Layout (Gabriella picked draft E2, 2026-11-23): an open book with bookmark tabs above the right page, one per
// page, badge only (her pick R1); the book's cover edge takes the open page's bookmark colour.
// Left page: the page art as a taped photo, who the memory is with and where it was found. Right page: the title,
// the badge large in a ribbon rosette, and the story on ruled lines. Switching pages turns the page, then the
// rosette is stuck onto the page. Click a tab or a page corner, or use left/right.
const BOOK = { x: 32, y: 128, w: 896, h: 456 };
const MID = BOOK.x + BOOK.w / 2; // the spine
const PW = BOOK.w / 2; // one page's width
const PAPER = 0xfbf3e6;
const PAPER_LEFT = 0xf6ecdc;
const RULE = 0xb9cfe0;
const STORY = { rule0: BOOK.y + 210, step: 32, size: 17 };

const EMPTY = 'no memories yet.\n\nwhen the friends bring up something from their past in the chat, it lands here.';

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
    this.selected = null;
    this.spread = null;
    this.tabs = null;
    this.turning = false;

    button(this, 80, 36, '← Levels', () => this.scene.start('Menu'), { w: 120, h: 34, size: 15, fill: C.bar });
    this.add.text(W / 2, 36, 'SCRAPBOOK', pixel(30, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    const count = this.pages.filter((p) => p.id in this.unlocked).length;
    this.add.text(W / 2, 66, `${count} / ${this.pages.length} memories collected`, pixel(15, C.highlight)).setOrigin(0.5);

    // Keyboard: left/right turn between unlocked pages (locked ones are skipped), Esc goes back.
    // Phaser can hand the same keydown to a listener twice when keys come quickly; act once per native event.
    const kb = this.input.keyboard;
    if (kb) {
      let last = null;
      const move = (d) => (e) => {
        if (e === last) return;
        last = e;
        this.step(d);
      };
      kb.on('keydown-LEFT', move(-1));
      kb.on('keydown-RIGHT', move(1));
      const back = () => { if (!this.registry.get('hudPanelOpen')) this.scene.start('Menu'); };
      kb.on('keydown-ESC', back);
      kb.on('keydown-BACKSPACE', back);
    }

    this.drawBook();
    const first = (this.openOn in this.unlocked && this.pages.find((p) => p.id === this.openOn)) || this.pages.find((p) => p.id in this.unlocked);
    if (first) this.select(first.id);
    else {
      this.drawTabs(null);
      this.add.text(MID + PW / 2, BOOK.y + BOOK.h / 2, EMPTY, readText(16, C.inkSoft, { align: 'center', wordWrap: { width: PW - 80 } })).setOrigin(0.5).setDepth(1);
    }
  }

  /** Turn to the previous/next unlocked page. */
  step(d) {
    const open = this.pages.filter((p) => p.id in this.unlocked);
    if (!open.length) return;
    const i = open.findIndex((p) => p.id === this.selected);
    this.select(open[(i + d + open.length) % open.length].id, d);
  }

  /** dir: which way to turn (1 forward, -1 back); worked out from the page order when not given. */
  select(id, dir) {
    if (!(id in this.unlocked) || this.turning || id === this.selected) return;
    const changed = this.selected !== null;
    const idx = (q) => this.pages.findIndex((x) => x.id === q);
    dir = dir || (changed && idx(id) < idx(this.selected) ? -1 : 1);
    this.selected = id;
    this.turnTo(this.pages.find((x) => x.id === id), dir, changed);
  }

  friendOf(p) {
    return CHARACTERS[p.friend] || { name: p.friend, color: C.inkSoft };
  }

  foundLevel(id) {
    return this.registry.get('levels').find((l) => l.id === this.unlocked[id])?.number ?? null;
  }

  /** The book (cover, two pages, spine) and the page-turn corners. Drawn once; spreads go on top. */
  drawBook() {
    const B = BOOK;
    this.cover = this.add.graphics().setDepth(0.45);
    this.drawCover(C.accentDark);
    const g = this.add.graphics().setDepth(0.5);
    g.fillStyle(PAPER_LEFT, 1).fillRoundedRect(B.x, B.y, PW, B.h, { tl: 8, bl: 8, tr: 0, br: 0 });
    g.fillStyle(PAPER, 1).fillRoundedRect(MID, B.y, PW, B.h, { tl: 0, bl: 0, tr: 8, br: 8 });
    const spine = this.add.graphics().setDepth(2.5); // stays over the turning page
    for (let i = 0; i < 14; i++) {
      spine.fillStyle(0x000000, 0.14 * (1 - i / 14)).fillRect(MID - i - 1, B.y, 1, B.h);
      spine.fillStyle(0x000000, 0.1 * (1 - i / 14)).fillRect(MID + i, B.y, 1, B.h);
    }
    if (this.pages.filter((q) => q.id in this.unlocked).length > 1) {
      const corner = (x, dir) => {
        const cg = this.add.graphics().setDepth(2.6);
        cg.fillStyle(C.panelDark, 1).fillTriangle(x, B.y + B.h, x - 44 * dir, B.y + B.h, x, B.y + B.h - 44);
        cg.fillStyle(C.inkSoft, 1).fillTriangle(x - 12 * dir, B.y + B.h - 22, x - 24 * dir, B.y + B.h - 14, x - 24 * dir, B.y + B.h - 30);
        this.add.zone(x - 22 * dir, B.y + B.h - 22, 44, 44).setDepth(2.7).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.step(dir));
      };
      corner(B.x, -1);
      corner(B.x + B.w, 1);
    }
  }

  /** The cover peeking out around the pages, in the open page's bookmark colour. */
  drawCover(col) {
    const B = BOOK;
    this.cover.clear();
    this.cover.fillStyle(0x000000, 0.3).fillRoundedRect(B.x + 4, B.y + 8, B.w, B.h, 10);
    this.cover.fillStyle(col, 1).fillRoundedRect(B.x - 8, B.y - 6, B.w + 16, B.h + 14, 12);
  }

  /**
   * Bookmark tabs above the right page, one per page: the badge on a tab in the friend's colour (grey "?" when
   * locked). The open page's tab stands taller, and the cover takes its colour.
   */
  drawTabs(p) {
    this.tabs?.destroy();
    const c = (this.tabs = this.add.container(0, 0).setDepth(0));
    if (p) this.drawCover(this.friendOf(p).color);
    const n = this.pages.length;
    const gap = 6;
    const tw = (PW - 48 - gap * (n - 1)) / n;
    this.pages.forEach((q, i) => {
      const open = q.id in this.unlocked;
      const on = p && q.id === p.id;
      const x = MID + 24 + i * (tw + gap);
      const h = on ? 58 : 48;
      const y = BOOK.y - h + 10;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.22).fillRoundedRect(x + 3, y - 2, tw, h, { tl: 10, tr: 10, bl: 0, br: 0 });
      g.fillStyle(open ? this.friendOf(q).color : C.goldDim, on ? 1 : 0.78).fillRoundedRect(x, y, tw, h, { tl: 10, tr: 10, bl: 0, br: 0 });
      c.add(g);
      c.add(badge(this, x + tw / 2, y + (h - 10) / 2, on ? 36 : 32, q, open));
      if (open) c.add(this.add.zone(x + tw / 2, y + h / 2, tw, h).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.select(q.id)));
    });
  }

  /** scrap_<id> if loaded; otherwise a striped placeholder naming the file the art will be. */
  art(c, p, x, y, w, h) {
    const key = p.art.replace(/\.png$/, '');
    if (this.textures.exists(key)) {
      c.add(this.add.image(x + w / 2, y + h / 2, key).setDisplaySize(w, h));
      return;
    }
    const g = this.add.graphics();
    g.fillStyle(C.blue, 1).fillRect(x, y, w, h);
    g.lineStyle(2, C.label, 0.5);
    for (let i = 0; i < w + h; i += 18) g.lineBetween(x + Math.max(0, i - h), y + Math.min(h, i), x + Math.min(w, i), y + Math.max(0, i - w));
    g.fillStyle(C.bar, 0.85).fillRoundedRect(x + 24, y + h / 2 - 30, w - 48, 60, 6);
    c.add([g,
      this.add.text(x + w / 2, y + h / 2 - 10, 'ART GOES HERE', pixel(15, C.label, { fontStyle: 'bold' })).setOrigin(0.5),
      this.add.text(x + w / 2, y + h / 2 + 12, p.art, text(11, C.label)).setOrigin(0.5)]);
  }

  /** The page's art as a photo with a white border, taped at two corners. */
  photo(parent, p, cx, cy, aw, ah, angle) {
    const b = 12;
    const fw = aw + 2 * b, fh = ah + 2 * b;
    const c = this.add.container(cx, cy);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.28).fillRect(-fw / 2 + 5, -fh / 2 + 7, fw, fh);
    g.fillStyle(0xffffff, 1).fillRect(-fw / 2, -fh / 2, fw, fh);
    c.add(g);
    this.art(c, p, -aw / 2, -ah / 2, aw, ah);
    const tape = this.add.graphics().fillStyle(C.highlight, 0.72);
    tape.fillPoints([{ x: fw / 2 + 22, y: -fh / 2 + 6 }, { x: fw / 2 - 30, y: -fh / 2 - 26 }, { x: fw / 2 - 44, y: -fh / 2 - 4 }, { x: fw / 2 + 8, y: -fh / 2 + 28 }], true);
    tape.fillPoints([{ x: -fw / 2 - 22, y: fh / 2 - 6 }, { x: -fw / 2 + 30, y: fh / 2 + 26 }, { x: -fw / 2 + 44, y: fh / 2 + 4 }, { x: -fw / 2 + 8, y: fh / 2 - 28 }], true);
    c.add(tape);
    c.setAngle(angle);
    parent.add(c);
  }

  /** The badge, large, inside a ribbon rosette in the friend's colour. Returns the container (centred on x, y). */
  rosette(parent, p, x, y, R, angle = 0) {
    const col = this.friendOf(p).color;
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const tail = (dx, tilt) => {
      const w = R * 0.42, len = R * 1.15;
      const pts = [{ x: -w / 2, y: 0 }, { x: w / 2, y: 0 }, { x: w / 2, y: len }, { x: 0, y: len - w * 0.45 }, { x: -w / 2, y: len }]
        .map(({ x: px, y: py }) => ({ x: dx + px * Math.cos(tilt) - py * Math.sin(tilt), y: R * 0.3 + px * Math.sin(tilt) + py * Math.cos(tilt) }));
      g.fillStyle(col, 1).fillPoints(pts, true);
      g.lineStyle(2, 0x000000, 0.25).strokePoints(pts, true, true);
    };
    tail(-R * 0.3, 0.32);
    tail(R * 0.3, -0.32);
    const pts = [];
    const bumps = 18;
    for (let i = 0; i < bumps * 2; i++) {
      const a = (i * Math.PI) / bumps;
      const rr = i % 2 === 0 ? R : R * 0.9;
      pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
    }
    g.fillStyle(col, 1).fillPoints(pts, true);
    g.lineStyle(2, 0x000000, 0.25).strokePoints(pts, true, true);
    g.fillStyle(0xfffaf2, 1).fillCircle(0, 0, R * 0.78);
    g.lineStyle(3, C.gold, 1).strokeCircle(0, 0, R * 0.78);
    g.lineStyle(1.5, col, 0.6).strokeCircle(0, 0, R * 0.7);
    c.add(g);
    c.add(badge(this, 0, 0, R * 1.3, p, true));
    c.setAngle(angle);
    c.baseAngle = angle;
    c.radius = R;
    parent.add(c);
    return c;
  }

  /** The rosette lands on the page: dropped from above, a little squash, a ring and sparkles. */
  stickOn(r, delay = 0) {
    const a = r.baseAngle;
    if (!pageAnimations()) {
      // Page animations off (Options): the rosette simply appears.
      r.setVisible(true).setAlpha(1).setScale(1).setAngle(a);
      return;
    }
    r.setVisible(true).setAlpha(0).setScale(1.8).setAngle(a + 18);
    tween(this, {
      targets: r, alpha: 1, scale: 1, angle: a, delay, duration: 260, ease: 'Quad.easeIn',
      onComplete: () => {
        if (!r.active) return;
        tween(this, { targets: r, scaleX: 1.08, scaleY: 0.92, duration: 70, yoyo: true });
        const m = r.getWorldTransformMatrix();
        const ring = this.add.graphics({ x: m.tx, y: m.ty }).setDepth(4).lineStyle(4, C.highlight, 0.9).strokeCircle(0, 0, r.radius);
        tween(this, { targets: ring, scale: 1.45, alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
        for (let i = 0; i < 10; i++) {
          const ang = (i * Math.PI * 2) / 10 + Math.random() * 0.3;
          const s = this.add.star(m.tx, m.ty, 4, 2, 5, i % 2 ? C.gold : C.accent).setDepth(4);
          tween(this, {
            targets: s, x: m.tx + Math.cos(ang) * r.radius * 1.6, y: m.ty + Math.sin(ang) * r.radius * 1.4,
            alpha: 0, angle: 180, scale: 0.4, duration: 520, ease: 'Quad.easeOut', onComplete: () => s.destroy(),
          });
        }
      },
    });
  }

  /**
   * The story written on ruled lines: the first line of text sits on the rule at `rule`. Paragraph one in ink,
   * the chapter add-ons in soft italic.
   */
  ruledText(c, p, x, rule, w, step, size) {
    for (const [i, para] of pageText(p, this.reachedChapter).entries()) {
      const style = readText(size, i === 0 ? C.ink : C.inkSoft, { wordWrap: { width: w, useAdvancedWrap: true }, fontStyle: i === 0 ? 'normal' : 'italic' });
      const probe = this.add.text(0, 0, 'Ag', style);
      const lh = probe.height;
      probe.destroy();
      const t = this.add.text(x, rule - lh - 2, para, style).setLineSpacing(step - lh);
      c.add(t);
      rule += step * t.getWrappedText().length;
    }
  }

  /** Left page: the photo, who and where. Right page: title, rosette, the story on ruled lines. Returns the rosette. */
  fillSpread(p, left, right) {
    const ch = this.friendOf(p);
    const aw = 352, ah = 264;
    this.photo(left, p, BOOK.x + PW / 2, BOOK.y + 36 + (ah + 24) / 2, aw, ah, -2);
    left.add(this.add.text(BOOK.x + PW / 2, BOOK.y + 346, `a memory with ${ch.name}`, readText(17, ch.color, { fontStyle: 'bold' })).setOrigin(0.5, 0));
    const lvl = this.foundLevel(p.id);
    if (lvl) left.add(this.add.text(BOOK.x + PW / 2, BOOK.y + 374, `found in level ${lvl}`, readText(14, C.inkSoft, { fontStyle: 'italic' })).setOrigin(0.5, 0));

    const r = this.rosette(right, p, BOOK.x + BOOK.w - 104, BOOK.y + 96, 72, 8);
    right.add(this.add.text(MID + 36, BOOK.y + 44, p.title.toUpperCase(), pixel(26, C.ink, { fontStyle: 'bold', wordWrap: { width: PW - 230 } })));
    const lines = this.add.graphics().lineStyle(1, RULE, 0.8);
    for (let ly = STORY.rule0; ly < BOOK.y + BOOK.h - 40; ly += STORY.step) lines.lineBetween(MID + 30, ly, MID + PW - 30, ly);
    right.add(lines);
    this.ruledText(right, p, MID + 36, STORY.rule0 + STORY.step, PW - 72, STORY.step, STORY.size);
    return r;
  }

  /** Build the new spread; turn the page over to it when switching, then stick the badge on. */
  turnTo(p, dir, animate) {
    this.drawTabs(p);
    const next = this.add.container(0, 0).setDepth(1);
    const left = this.add.container(0, 0);
    const right = this.add.container(0, 0);
    next.add([left, right]);
    next.left = left;
    next.right = right;
    const rosette = this.fillSpread(p, left, right);
    rosette.setVisible(false);
    const k = this.pages.filter((q) => q.id in this.unlocked).findIndex((q) => q.id === p.id);
    left.add(this.add.text(BOOK.x + 56, BOOK.y + BOOK.h - 26, `${2 * k + 1}`, pixel(12, C.inkSoft)).setOrigin(0, 0.5));
    right.add(this.add.text(BOOK.x + BOOK.w - 56, BOOK.y + BOOK.h - 26, `${2 * k + 2}`, pixel(12, C.inkSoft)).setOrigin(1, 0.5));

    const old = this.spread;
    this.spread = next;
    if (!animate || !old || !pageAnimations()) {
      old?.destroy();
      this.stickOn(rosette, 250);
      return;
    }
    // Page turn: the page on the `dir` side lifts off the spine, folds flat, and lands on the other side.
    this.turning = true;
    old.setDepth(2);
    const from = dir > 0 ? 'right' : 'left';
    const to = dir > 0 ? 'left' : 'right';
    old[from].setVisible(false); // that page is the one turning; the flap stands in for it
    next[to].setVisible(false); // revealed when the flap lands
    const flap = this.add.container(MID, BOOK.y).setDepth(3);
    const sheet = (side) => {
      flap.removeAll(true);
      const s = side === 'right' ? 1 : -1;
      const g = this.add.graphics();
      g.fillStyle(side === 'right' ? PAPER : PAPER_LEFT, 1).fillRect(s > 0 ? 0 : -PW, 0, PW, BOOK.h);
      g.lineStyle(1, RULE, 0.6);
      for (let ly = 130; ly < BOOK.h - 40; ly += 32) g.lineBetween(s * 30, ly, s * (PW - 30), ly);
      const shade = this.add.graphics().fillStyle(0x000000, 1).fillRect(s > 0 ? 0 : -PW, 0, PW, BOOK.h).setAlpha(0);
      flap.add([g, shade]);
      return shade;
    };
    const shade1 = sheet(from);
    tween(this, {
      targets: flap, scaleX: 0, duration: 210, ease: 'Sine.easeIn',
      onUpdate: () => shade1.setAlpha(0.35 * (1 - flap.scaleX)),
      onComplete: () => {
        const shade2 = sheet(to);
        shade2.setAlpha(0.35);
        tween(this, {
          targets: flap, scaleX: 1, duration: 210, ease: 'Sine.easeOut',
          onUpdate: () => shade2.setAlpha(0.35 * (1 - flap.scaleX)),
          onComplete: () => {
            old.destroy();
            next[to].setVisible(true);
            flap.destroy();
            this.turning = false;
            this.stickOn(rosette, 40);
          },
        });
      },
    });
  }
}
