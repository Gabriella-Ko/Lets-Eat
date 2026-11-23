import Phaser from 'phaser';
import { C, W, CHARACTERS, pixel, readText } from '../ui/theme.js';
import { button, portrait, loadProgress } from '../ui/widgets.js';
import { loadOpened } from '../ui/openedStore.js';
import { friendCards } from '../logic/friends.js';
import { tween } from '../ui/motion.js';
import { play as playSfx } from '../ui/sfx.js';
import { pageAnimations } from '../ui/settings.js';

// Layout (Gabriella picked draft B3, 2026-11-23): bookmark tabs down the left, one per friend, sticking out of a
// spiral notebook page; the selected friend's polaroid is taped on the left of the page, with their name, needs
// (dot bullets on the ruled lines) and a "levels together" ink stamp beside it.
const PAGE = { x: 236, y: 92, w: 700, h: 512 };
const TAB = { y: 100, h: 74, step: 82, out: 196, outSel: 216, tuck: 20 };
const RULE0 = PAGE.y + 150; // first ruled line
const STEP = 34; // line spacing
const MARGIN_X = PAGE.x + 70;
const POL = { cx: PAGE.x + 230, cy: PAGE.y + 200, w: 248, h: 288, inset: 14, angle: -4 };

// Page turn (Gabriella picked "flip", 2026-11-23): switching friends turns the page over the spiral rings: it
// squeezes into the binding, darkening. Going back (up arrow / an earlier tab) plays it in reverse: the previous
// page swings out of the binding on top. The rings stay put; pages turn under them.
const TURN_MS = 340;
const TURN_SHADE = 0.45;

/** Needs as display lines: label, or ??? when not earned yet. */
function needLines(f) {
  if (!f.met) return [];
  if (f.noNeeds) return [{ text: 'Up for anything', known: true }];
  const l = f.needs.map((n) => ({ text: n.known ? n.label : '???', known: n.known }));
  return l.length ? l : [{ text: '???', known: false }];
}

/**
 * Friends (bible: Cast; Clue rules). One tab per friend: portrait, name and permanent needs
 * (rules.json characters). A friend counts as met once the player has opened a level they are a guest in;
 * a need shows only after the player has cleared (1+ stars) a level with that friend whose chat has a line
 * tagged with it, so implied clues are never solved early. Everything else reads "???".
 * Click a tab or use up/down to switch friends. Back with "← Levels" or Esc.
 */
export default class FriendsScene extends Phaser.Scene {
  constructor() {
    super('Friends');
  }

  create() {
    const levels = this.registry.get('levels') || [];
    const characters = (this.registry.get('rules') || {}).characters || {};
    const opened = loadOpened();
    this.cards = friendCards(levels, characters, loadProgress(), opened);
    // How many opened levels each friend was a guest in.
    for (const f of this.cards) f.together = levels.filter((l) => (l.guests || []).includes(f.id) && opened.includes(l.id)).length;

    button(this, 90, 36, '← Levels', () => this.scene.start('Menu'), { w: 140, h: 34, size: 15, fill: C.bar });
    this.add.text(W / 2, 36, 'FRIENDS', pixel(30, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    const met = this.cards.filter((c) => c.met).length;
    this.add.text(W / 2, 66, `what you've learned about the crew · met ${met}/${this.cards.length}`, pixel(15, C.highlight)).setOrigin(0.5);
    this.add.text(W / 2, 624, 'needs show up here once you clear a level where they come up in the chat', pixel(13, C.label)).setOrigin(0.5);

    this.sel = Math.max(0, this.cards.findIndex((f) => f.met));
    this.tabsC = null;
    this.pageC = null;
    this.turning = false;
    this.drawRings();
    this.refresh(false);

    // Phaser can hand the same keydown to a listener twice when keys come quickly; act once per native event.
    let last = null;
    const step = (d) => (e) => {
      if (e === last) return;
      last = e;
      this.select((this.sel + d + this.cards.length) % this.cards.length, d);
    };
    this.input.keyboard?.on('keydown-UP', step(-1));
    this.input.keyboard?.on('keydown-DOWN', step(1));
    const back = () => { if (!this.registry.get('hudPanelOpen')) this.scene.start('Menu'); };
    this.input.keyboard?.on('keydown-ESC', back);
    this.input.keyboard?.on('keydown-BACKSPACE', back);
  }

  /** dir: 1 forward (down), -1 back (up); from the tab order when not given. */
  select(i, dir) {
    if (i === this.sel || this.turning) return;
    dir = dir || (i > this.sel ? 1 : -1);
    this.sel = i;
    playSfx(this, 'page_turn'); // the page flip; a tab's own click is merged into it
    this.refresh(true, dir);
  }

  colourOf(f) {
    return f.met ? CHARACTERS[f.id]?.color ?? C.blue : C.goldDim;
  }

  /** Grey "?" box for a friend not met yet. */
  unknownFace(c, x, y, size) {
    const g = this.add.graphics();
    g.fillStyle(C.inkSoft, 0.35).fillRoundedRect(x - size / 2, y - size / 2, size, size, 6);
    c.add(g);
    c.add(this.add.text(x, y, '?', pixel(Math.round(size * 0.55), C.label, { fontStyle: 'bold' })).setOrigin(0.5));
  }

  refresh(animate, dir = 1) {
    this.tabsC?.destroy();
    const tabs = (this.tabsC = this.add.container(0, 0).setDepth(0));
    this.cards.forEach((f, i) => this.drawTab(tabs, f, i));

    // The page: an outer container pinned at the page's top-left corner (so it can turn about the binding or the
    // top edge), holding an inner one that cancels the offset so everything inside draws in screen coordinates.
    const f = this.cards[this.sel];
    const page = this.add.container(PAGE.x, PAGE.y).setDepth(1);
    const inner = this.add.container(-PAGE.x, -PAGE.y);
    page.add(inner);
    this.drawPage(inner, f);
    this.drawPolaroid(inner, f);
    this.drawInfo(inner, f);
    page.shade = this.add.graphics().fillStyle(0x000000, 1).fillRect(0, 0, PAGE.w, PAGE.h).setAlpha(0);
    page.add(page.shade);

    const old = this.pageC;
    this.pageC = page;
    if (!animate || !old || !pageAnimations()) {
      old?.destroy();
      return;
    }
    // Forward: the old page turns away on top, uncovering the new one. Back: the new page turns in on top.
    this.turning = true;
    const moving = dir > 0 ? old : page;
    (dir > 0 ? old : page).setDepth(2);
    (dir > 0 ? page : old).setDepth(1);
    if (dir < 0) {
      moving.scaleX = 0;
      moving.shade.setAlpha(TURN_SHADE);
    }
    tween(this, {
      targets: moving, scaleX: dir > 0 ? 0 : 1, duration: TURN_MS,
      ease: dir > 0 ? 'Quad.easeIn' : 'Quad.easeOut',
      onUpdate: () => { if (moving.active) moving.shade.setAlpha(TURN_SHADE * (1 - moving.scaleX)); },
      onComplete: () => {
        old.destroy();
        page.setDepth(1);
        page.shade.setAlpha(0);
        this.turning = false;
      },
    });
  }

  /** The spiral rings, over every page (pages turn under them); the punched holes are part of each page. */
  drawRings() {
    const g = this.add.graphics().setDepth(3);
    for (let ry = PAGE.y + 34; ry < PAGE.y + PAGE.h - 20; ry += 42) {
      g.lineStyle(4, 0x9a8f88, 1).beginPath().arc(PAGE.x + 14, ry, 13, Math.PI * 0.6, Math.PI * 1.45).strokePath();
    }
  }

  /** A bookmark tab, behind the page. The selected one sticks out further. */
  drawTab(root, f, i) {
    const on = i === this.sel;
    const len = (on ? TAB.outSel : TAB.out) + TAB.tuck;
    const x = PAGE.x + TAB.tuck - len;
    const y = TAB.y + i * TAB.step;
    const r = { tl: 12, bl: 12, tr: 0, br: 0 };
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.22).fillRoundedRect(x - 2, y + 4, len, TAB.h, r);
    g.fillStyle(this.colourOf(f), on ? 1 : 0.8).fillRoundedRect(x, y, len, TAB.h, r);
    root.add(g);
    const fx = x + 38;
    if (f.met) root.add(portrait(this, fx, y + TAB.h / 2, 44, f.id, 'HAPPY'));
    else this.unknownFace(root, fx, y + TAB.h / 2, 44);
    const name = f.met ? CHARACTERS[f.id]?.name || f.id : '???';
    root.add(this.add.text(fx + 34, y + TAB.h / 2, name, pixel(on ? 20 : 18, on ? 0xffffff : C.panel, { fontStyle: 'bold' })).setOrigin(0, 0.5));
    const hit = this.add.zone(x + len / 2, y + TAB.h / 2, len, TAB.h).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      playSfx(this, 'click');
      this.select(i);
    });
    root.add(hit);
  }

  /** Cream paper, ruled lines, a margin line, spiral rings, a strip in the friend's colour along the top. */
  drawPage(root, f) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25).fillRoundedRect(PAGE.x + 4, PAGE.y + 6, PAGE.w, PAGE.h, 8);
    g.fillStyle(0xfbf3e6, 1).fillRoundedRect(PAGE.x, PAGE.y, PAGE.w, PAGE.h, 8);
    g.fillStyle(this.colourOf(f), 1).fillRoundedRect(PAGE.x, PAGE.y, PAGE.w, 10, { tl: 8, tr: 8, bl: 0, br: 0 });
    g.lineStyle(1, 0xb9cfe0, 0.8);
    for (let ly = RULE0; ly < PAGE.y + PAGE.h - 14; ly += STEP) g.lineBetween(PAGE.x + 12, ly, PAGE.x + PAGE.w - 12, ly);
    g.lineStyle(1.5, 0xd98a8a, 0.7).lineBetween(MARGIN_X, PAGE.y + 10, MARGIN_X, PAGE.y + PAGE.h);
    for (let ry = PAGE.y + 34; ry < PAGE.y + PAGE.h - 20; ry += 42) g.fillStyle(C.bg, 1).fillCircle(PAGE.x + 26, ry, 7); // punched holes
    root.add(g);
  }

  /** The friend's polaroid, taped at two corners. */
  drawPolaroid(root, f) {
    const { w: pw, h: ph, inset } = POL;
    const photoS = pw - 2 * inset;
    const pol = this.add.container(POL.cx, POL.cy);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.28).fillRect(-pw / 2 + 5, -ph / 2 + 7, pw, ph);
    g.fillStyle(0xffffff, 1).fillRect(-pw / 2, -ph / 2, pw, ph);
    g.fillStyle(f.met ? this.colourOf(f) : C.bar, 1).fillRect(-pw / 2 + inset, -ph / 2 + inset, photoS, photoS);
    pol.add(g);
    const py = -ph / 2 + inset + photoS / 2;
    if (f.met) pol.add(portrait(this, 0, py, photoS - 18, f.id, 'HAPPY'));
    else this.unknownFace(pol, 0, py, photoS - 40);
    pol.add(this.add.text(0, ph / 2 - 30, f.met ? CHARACTERS[f.id]?.name || f.id : '???', pixel(18, C.inkSoft)).setOrigin(0.5));
    const tape = this.add.graphics().fillStyle(C.highlight, 0.72);
    tape.fillPoints([{ x: -pw / 2 - 22, y: -ph / 2 + 6 }, { x: -pw / 2 + 30, y: -ph / 2 - 26 }, { x: -pw / 2 + 44, y: -ph / 2 - 4 }, { x: -pw / 2 - 8, y: -ph / 2 + 28 }], true);
    tape.fillPoints([{ x: pw / 2 + 22, y: -ph / 2 + 6 }, { x: pw / 2 - 30, y: -ph / 2 - 26 }, { x: pw / 2 - 44, y: -ph / 2 - 4 }, { x: pw / 2 + 8, y: -ph / 2 + 28 }], true);
    pol.add(tape);
    pol.setAngle(POL.angle);
    root.add(pol);
  }

  /** Name, needs on the ruled lines, and a "levels together" stamp, written beside the polaroid. */
  drawInfo(root, f) {
    const col = this.colourOf(f);
    const ix = POL.cx + POL.w / 2 + 50;
    const iw = PAGE.x + PAGE.w - 40 - ix;
    const name = f.met ? (CHARACTERS[f.id]?.name || f.id).toUpperCase() : '???';
    root.add(this.add.text(ix, PAGE.y + 38, name, pixel(40, f.met ? col : C.inkSoft, { fontStyle: 'bold' })));
    if (!f.met) {
      root.add(this.add.text(ix, RULE0 + STEP - 26, "You haven't met yet.", readText(18, C.inkSoft)));
      return;
    }
    root.add(this.add.text(ix, RULE0 + STEP - 22, 'ALWAYS NEEDS', pixel(14, C.inkSoft, { fontStyle: 'bold' })));
    needLines(f).forEach((l, k) => {
      const ly = RULE0 + STEP * (k + 2);
      const t = this.add.text(ix + 28, ly - 26, l.text, readText(19, l.known ? C.ink : C.inkSoft, { fontStyle: l.known ? 'bold' : 'normal', wordWrap: { width: iw - 28 } }));
      const dot = this.add.graphics().fillStyle(l.known ? col : C.panelDark, 1).fillCircle(ix + 8, ly - 14, 6);
      root.add([dot, t]);
    });
    const st = this.add.container(PAGE.x + PAGE.w - 96, PAGE.y + PAGE.h - 84).setAngle(-12);
    st.add(this.add.graphics().lineStyle(3, C.bad, 0.75).strokeCircle(0, 0, 54).lineStyle(1.5, C.bad, 0.75).strokeCircle(0, 0, 46));
    st.add(this.add.text(0, -10, String(f.together), pixel(34, C.bad, { fontStyle: 'bold' })).setOrigin(0.5).setAlpha(0.8));
    st.add(this.add.text(0, 22, f.together === 1 ? 'LEVEL\nTOGETHER' : 'LEVELS\nTOGETHER', pixel(10, C.bad, { align: 'center', fontStyle: 'bold' })).setOrigin(0.5).setAlpha(0.8));
    root.add(st);
  }
}
