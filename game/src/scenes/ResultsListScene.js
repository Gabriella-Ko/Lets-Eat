import Phaser from 'phaser';
import { C, W, pixel, text } from '../ui/theme.js';
import { panel, button } from '../ui/widgets.js';
import { notebook, pinMode, getPins } from '../ui/notebook.js';
import { scrollArea } from '../ui/scroll.js';
import { loadVisits, recordSeen } from '../ui/visitStore.js';
import { pastVisit } from '../logic/beenHere.js';
import { SORTS, filterOptions, applyView } from '../logic/resultsView.js';

const BADGE = { been: { label: 'BEEN HERE', fill: C.accent }, seen: { label: 'SEEN BEFORE', fill: C.blue } };

const LIST = { x: 24, y: 78, w: 290, h: 486 };
const DETAIL = { x: 330, y: 78, w: 342, h: 486 };

/**
 * Search results: one card per venue (name, cuisine, price), reviews in the detail panel,
 * and the Notebook alongside so the player can check clues against reviews.
 * Dietary and vibe tags stay hidden: the player learns them from reviews, as the bible intends.
 * "Been here before": a recurring venue the player met in an EARLIER level gets a badge on its card
 * (BEEN HERE if they picked it, SEEN BEFORE if it was only listed), and its detail panel adds that
 * level's reviews. It never says how the earlier pick scored (see logic/beenHere.js).
 * Sort and filter (top of the list): Mixed / Cheapest / A–Z, and chips for the price tiers and cuisines
 * in the level (several at once; none = all). Uses only what the cards show (logic/resultsView.js).
 * The choice is kept in the registry for this level, so it survives a trip back to the chat.
 * data: { levelId }
 */
export default class ResultsListScene extends Phaser.Scene {
  constructor() {
    super('Results');
  }

  init(data) {
    this.level = this.registry.get('levels').find((l) => l.id === data.levelId);
    this.selected = null;
  }

  create() {
    const lvl = this.level;
    this.add.text(W / 2 - 130, 36, 'PLACES NEARBY', pixel(24, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    button(this, 100, 36, '← Back to chat', () => this.scene.start('Chat', { levelId: lvl.id, revealAll: true }), { w: 168, h: 34, size: 15, fill: C.bar });

    panel(this, LIST.x, LIST.y, LIST.w, LIST.h);
    panel(this, DETAIL.x, DETAIL.y, DETAIL.w, DETAIL.h);
    this.notebook = pinMode(lvl) ? notebook(this, [], 'pinResults') : notebook(this);
    if (pinMode(lvl)) this.notebook.addPinned(lvl.script, getPins(this, lvl.id));
    else this.notebook.addAll(lvl.script);

    // The venues file often lists the answer first, so shuffle, seeded by level id so the order is stable.
    this.venues = seededShuffle(lvl.venues, lvl.id);
    // Look up earlier visits before recording this one.
    const levels = this.registry.get('levels');
    const visits = loadVisits();
    this.past = new Map(this.venues.map((v) => [v.id, pastVisit(visits, levels, v.id, lvl.number)]));
    recordSeen(lvl.id, this.venues.map((v) => v.id));

    this.viewKey = `resultsView:${lvl.id}`;
    this.view = { sort: 'mixed', prices: [], cuisines: [], ...(this.registry.get(this.viewKey) || {}) };
    this.options = filterOptions(this.venues);
    this.controls = this.add.container(0, 0);
    this.cardLayer = this.add.container(0, 0);
    this.cards = [];

    this.detail = this.add.container(0, 0);
    // Reviews scroll, so earlier-visit reviews never run into the button.
    this.reviews = scrollArea(this, DETAIL.x + 18, DETAIL.y + 98, DETAIL.w - 36, DETAIL.h - 98 - 74);
    this.moreHint = this.add.text(DETAIL.x + DETAIL.w - 18, DETAIL.y + DETAIL.h - 66, '↓ scroll for more', text(12, C.inkSoft)).setOrigin(1, 0.5).setVisible(false);
    this.reviews.onScroll(() => this.moreHint.setVisible(!!this.selected && !this.reviews.atBottom()));
    this.pickBtn = button(this, DETAIL.x + DETAIL.w / 2, DETAIL.y + DETAIL.h - 36, 'Recommend this', () => {
      this.scene.start('Outcome', { levelId: lvl.id, venueId: this.selected.id });
    }, { w: DETAIL.w - 40 });
    this.pickBtn.setVisible(false);
    this.empty = this.add.text(DETAIL.x + DETAIL.w / 2, DETAIL.y + DETAIL.h / 2, 'pick a place to read its reviews', text(15, C.inkSoft)).setOrigin(0.5);

    this.drawControls();
    this.drawCards();
  }

  /** Change the view, remember it for this level, and redraw. */
  setView(patch) {
    this.view = { ...this.view, ...patch };
    this.registry.set(this.viewKey, this.view);
    this.drawControls();
    this.drawCards();
  }

  /** A small rounded toggle. Returns its width. */
  pill(c, x, y, label, on, onClick, title) {
    const t = this.add.text(0, 0, label, pixel(12, on ? C.panel : C.ink, { fontStyle: 'bold' }));
    const w = Math.max(30, t.width + 18), h = 24;
    const g = this.add.graphics();
    const draw = (hover) => {
      g.clear();
      g.fillStyle(on ? C.accent : hover ? 0xfffaf2 : 0xffffff, 1).fillRoundedRect(x, y, w, h, 12);
      g.lineStyle(1, on ? C.accentDark : C.panelDark, 1).strokeRoundedRect(x, y, w, h, 12);
    };
    draw(false);
    t.setPosition(x + (w - t.width) / 2, y + (h - t.height) / 2);
    const z = this.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true });
    z.on('pointerover', () => draw(true));
    z.on('pointerout', () => draw(false));
    z.on('pointerdown', onClick);
    z.pillLabel = title || label;
    c.add([g, t, z]);
    return w;
  }

  /** SORT row, then SHOW chips (price tiers, and cuisines when there's more than one), wrapping as needed. */
  drawControls() {
    const c = this.controls;
    c.removeAll(true);
    const x0 = LIST.x + 12, right = LIST.x + LIST.w - 12, labelW = 46, rowH = 30;
    let y = LIST.y + 12;
    c.add(this.add.text(x0, y + 5, 'SORT', pixel(12, C.inkSoft, { fontStyle: 'bold' })));
    let x = x0 + labelW;
    for (const s of SORTS) x += this.pill(c, x, y, s.label, this.view.sort === s.id, () => this.setView({ sort: s.id }), `sort:${s.id}`) + 6;

    const chips = [
      ...this.options.prices.map((p) => ({ key: 'prices', value: p, label: p })),
      ...(this.options.cuisines.length > 1 ? this.options.cuisines.map((cu) => ({ key: 'cuisines', value: cu, label: pretty(cu) })) : []),
    ];
    if (chips.length > 1) {
      y += rowH;
      c.add(this.add.text(x0, y + 5, 'SHOW', pixel(12, C.inkSoft, { fontStyle: 'bold' })));
      x = x0 + labelW;
      for (const ch of chips) {
        const list = this.view[ch.key];
        const on = list.includes(ch.value);
        const t = this.add.text(0, 0, ch.label, pixel(12, C.ink, { fontStyle: 'bold' }));
        const w = Math.max(30, t.width + 18);
        t.destroy();
        if (x + w > right) { x = x0 + labelW; y += rowH; }
        x += this.pill(c, x, y, ch.label, on, () => this.setView({ [ch.key]: on ? list.filter((v) => v !== ch.value) : [...list, ch.value] }), `${ch.key}:${ch.value}`) + 6;
      }
    }
    this.cardsTop = y + rowH + 6;
    c.add(this.add.graphics().lineStyle(1, C.panelDark, 1).lineBetween(LIST.x + 10, this.cardsTop - 4, LIST.x + LIST.w - 10, this.cardsTop - 4));
  }

  drawCards() {
    this.cardLayer.removeAll(true);
    const shown = applyView(this.venues, this.view);
    this.shown = shown;
    // Card size from the full list, so cards don't jump in size when a filter hides some.
    const gap = 8, top = this.cardsTop, avail = LIST.y + LIST.h - 10 - top;
    const cardH = Math.min(96, (avail - gap * (this.venues.length - 1)) / this.venues.length);
    this.cards = shown.map((v, i) => this.makeCard(v, LIST.x + 10, top + i * (cardH + gap), LIST.w - 20, cardH));
    if (!shown.length) {
      this.cardLayer.add(this.add.text(LIST.x + LIST.w / 2, top + 40, 'no places match these filters', text(14, C.inkSoft)).setOrigin(0.5));
      this.cardLayer.add(button(this, LIST.x + LIST.w / 2, top + 84, 'Clear filters', () => this.setView({ prices: [], cuisines: [] }), { w: 160, h: 34, size: 14, fill: C.blue }));
    }
    const filtered = this.view.prices.length || this.view.cuisines.length;
    if (filtered && shown.length) {
      this.cardLayer.add(this.add.text(LIST.x + LIST.w - 12, LIST.y + LIST.h - 8, `${shown.length} of ${this.venues.length} places`, text(12, C.inkSoft)).setOrigin(1, 1));
    }
    // A selected place that the filters hide is deselected.
    if (this.selected && !shown.includes(this.selected)) this.deselect();
    else if (this.selected) this.cards.forEach((c) => c.draw(c.venue === this.selected ? 'selected' : undefined));
  }

  deselect() {
    this.selected = null;
    this.detail.removeAll(true);
    this.reviews.content.removeAll(true);
    this.reviews.setContentHeight(0);
    this.moreHint.setVisible(false);
    this.pickBtn.setVisible(false);
    this.empty.setVisible(true);
  }

  makeCard(venue, x, y, w, h) {
    const layer = this.add.container(0, 0);
    this.cardLayer.add(layer);
    const g = this.add.graphics();
    const draw = (state) => {
      g.clear();
      g.fillStyle(state === 'selected' ? C.highlight : state === 'hover' ? 0xfffaf2 : 0xffffff, 1).fillRoundedRect(x, y, w, h, 8);
      g.lineStyle(state === 'selected' ? 3 : 1, state === 'selected' ? C.accent : C.panelDark, 1).strokeRoundedRect(x, y, w, h, 8);
    };
    draw();
    layer.add(g);
    const iconSize = Math.min(h - 16, 60);
    // Tighter text on short cards (chapters with 6-7 venues).
    const tight = h < 64;
    layer.add(this.add.image(x + 8 + iconSize / 2, y + h / 2, `icon_${venue.cuisine}`).setDisplaySize(iconSize, iconSize));
    layer.add(this.add.text(x + iconSize + 20, y + h / 2 - (tight ? 9 : 11), venue.name, pixel(tight ? 15 : 17, C.ink, { fontStyle: 'bold' })).setOrigin(0, 0.5));
    layer.add(this.add.text(x + iconSize + 20, y + h / 2 + (tight ? 10 : 12), `${pretty(venue.cuisine)} · ${venue.price_tier}`, text(tight ? 13 : 14, C.inkSoft)).setOrigin(0, 0.5));
    const past = this.past.get(venue.id);
    if (past) {
      // Bottom-right of the card, beside the short cuisine line, so it never collides with a long name.
      const b = BADGE[past.kind];
      const t = this.add.text(x + w - 14, y + h - (tight ? 7 : 12), b.label, pixel(11, C.panel, { fontStyle: 'bold' })).setOrigin(1, 1);
      const pg = this.add.graphics().fillStyle(b.fill, 1).fillRoundedRect(t.x - t.width - 8, t.y - t.height - 3, t.width + 16, t.height + 6, 9);
      layer.add([pg, t]);
    }
    const zone = this.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true });
    layer.add(zone);
    const card = { venue, draw };
    zone.on('pointerover', () => this.selected !== venue && draw('hover'));
    zone.on('pointerout', () => this.selected !== venue && draw());
    zone.on('pointerdown', () => this.select(card));
    return card;
  }

  select(card) {
    this.selected = card.venue;
    this.cards.forEach((c) => c.draw(c === card ? 'selected' : undefined));
    this.empty.setVisible(false);
    this.detail.removeAll(true);

    const v = card.venue;
    const x = DETAIL.x + 18;
    let y = DETAIL.y + 18;
    const items = [
      this.add.image(x + 30, y + 30, `icon_${v.cuisine}`).setDisplaySize(60, 60),
      this.add.text(x + 74, y + 4, v.name, pixel(22, C.ink, { fontStyle: 'bold', wordWrap: { width: DETAIL.w - 110 } })),
      this.add.text(x + 74, y + 36, `${pretty(v.cuisine)} · ${v.price_tier}`, text(15, C.inkSoft)),
    ];
    this.detail.add(items);

    // Reviews (scrollable): today's, then what the player saw on an earlier visit.
    const area = this.reviews;
    area.content.removeAll(true);
    const RW = DETAIL.w - 36;
    let ry = 0;
    const add = (o) => (area.content.add(o), o);
    const review = (r, past) => {
      const t = add(this.add.text(12, ry + 9, `“${r}”`, text(14, past ? C.inkSoft : C.ink, { wordWrap: { width: RW - 24, useAdvancedWrap: true }, lineSpacing: 2 })));
      const g = this.add.graphics().fillStyle(past ? 0xfaf3ea : 0xffffff, 1).fillRoundedRect(0, ry, RW, t.height + 18, 8);
      area.content.addAt(g, area.content.getIndex(t));
      ry += t.height + 28;
    };
    add(this.add.text(0, ry, 'REVIEWS', pixel(16, C.ink, { fontStyle: 'bold' })));
    ry += 26;
    for (const r of v.reviews) review(r, false);

    const past = this.past.get(v.id);
    if (past) {
      const b = BADGE[past.kind];
      add(this.add.graphics().lineStyle(1, C.panelDark, 1).lineBetween(0, ry, RW, ry));
      ry += 12;
      add(this.add.text(0, ry, `FROM LEVEL ${past.last.number}`, pixel(15, C.ink, { fontStyle: 'bold' })));
      const tag = add(this.add.text(RW, ry + 2, b.label, pixel(11, b.fill, { fontStyle: 'bold' })).setOrigin(1, 0));
      ry += Math.max(22, tag.height + 6);
      const note = past.pickedIn.length
        ? `you sent the crew here in level ${past.pickedIn.join(' and ')}.`
        : `it was on the list in level ${past.last.number}.`;
      const n = add(this.add.text(0, ry, note, text(13, C.inkSoft, { fontStyle: 'italic', wordWrap: { width: RW } })));
      ry += n.height + 8;
      for (const r of past.last.reviews) review(r, true);
    }
    area.setContentHeight(ry);
    area.scrollTo(-1e6);
    this.pickBtn.setVisible(true);
  }
}

const pretty = (s) => s.replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase());

function seededShuffle(arr, seedStr) {
  let seed = 0;
  for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
