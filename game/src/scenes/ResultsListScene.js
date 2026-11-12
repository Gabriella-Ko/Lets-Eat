import Phaser from 'phaser';
import { C, W, pixel, text } from '../ui/theme.js';
import { panel, button } from '../ui/widgets.js';
import { notebook, pinMode, getPins } from '../ui/notebook.js';
import { scrollArea } from '../ui/scroll.js';
import { loadVisits, recordSeen } from '../ui/visitStore.js';
import { pastVisit } from '../logic/beenHere.js';

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
    const gap = 8;
    const cardH = Math.min(96, (LIST.h - 20 - gap * (this.venues.length - 1)) / this.venues.length);
    this.cards = this.venues.map((v, i) => this.makeCard(v, LIST.x + 10, LIST.y + 10 + i * (cardH + gap), LIST.w - 20, cardH));

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
  }

  makeCard(venue, x, y, w, h) {
    const g = this.add.graphics();
    const draw = (state) => {
      g.clear();
      g.fillStyle(state === 'selected' ? C.highlight : state === 'hover' ? 0xfffaf2 : 0xffffff, 1).fillRoundedRect(x, y, w, h, 8);
      g.lineStyle(state === 'selected' ? 3 : 1, state === 'selected' ? C.accent : C.panelDark, 1).strokeRoundedRect(x, y, w, h, 8);
    };
    draw();
    const iconSize = Math.min(h - 16, 60);
    this.add.image(x + 8 + iconSize / 2, y + h / 2, `icon_${venue.cuisine}`).setDisplaySize(iconSize, iconSize);
    this.add.text(x + iconSize + 20, y + h / 2 - 11, venue.name, pixel(17, C.ink, { fontStyle: 'bold' })).setOrigin(0, 0.5);
    this.add.text(x + iconSize + 20, y + h / 2 + 12, `${pretty(venue.cuisine)} · ${venue.price_tier}`, text(14, C.inkSoft)).setOrigin(0, 0.5);
    const past = this.past.get(venue.id);
    if (past) {
      // Bottom-right of the card, beside the short cuisine line, so it never collides with a long name.
      const b = BADGE[past.kind];
      const t = this.add.text(x + w - 14, y + h - 12, b.label, pixel(11, C.panel, { fontStyle: 'bold' })).setOrigin(1, 1);
      const pg = this.add.graphics().fillStyle(b.fill, 1).fillRoundedRect(t.x - t.width - 8, t.y - t.height - 3, t.width + 16, t.height + 6, 9);
      t.setDepth(1);
      pg.setDepth(0.5);
    }
    const zone = this.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true });
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
