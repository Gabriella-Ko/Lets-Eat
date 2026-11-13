import Phaser from 'phaser';
import { tween } from '../ui/motion.js';
import { C, W, H, CHARACTERS, pixel, text, readText } from '../ui/theme.js';
import { panel, button, star, saveStars, portrait } from '../ui/widgets.js';
import { scorePick, describeTag } from '../logic/scoring.js';
import { recapRows } from '../logic/recap.js';
import { scrollArea } from '../ui/scroll.js';
import { pinMode, getPins } from '../ui/notebook.js';
import { badge } from '../ui/badge.js';
import { newFriends, markAnnounced } from '../ui/friendsAnnounced.js';
import { recordPick } from '../ui/visitStore.js';

const UNLOCK_DELAY_MS = 1400; // after the stars and the first reactions
const UNLOCK_DEPTH = 30; // above the clue recap (20)

const RECAP = { x: 100, y: 46, w: 760, h: 548 };
const RECAP_DEPTH = 20;
const RECAP_SUB = {
  perfect: 'every need in the chat, and the line that gave it away',
  partial: 'what you caught, and what slipped by',
  fail: 'the line that would have kept everyone safe',
};

const IMG = { x: 36, y: 168, w: 340, h: 228 }; // 3:2, matching the result art (images are cut to 680x456)
const REACT = { x: 396, y: 168, w: 528 };

/**
 * The friends react to the pick. Stars come from the game's own scoring (logic/scoring.js);
 * the reaction lines come from outcomes_level_XX.json. The boot test checks the two agree.
 * Left of the reactions is a slot for an outcome illustration (see imageKeys).
 * "Clue recap" opens a panel pairing each need with the chat line that revealed it (logic/recap.js).
 * data: { levelId, venueId, recap?: boolean (open the recap straight away; dev shortcut) }
 */
export default class OutcomeScene extends Phaser.Scene {
  constructor() {
    super('Outcome');
  }

  init(data) {
    const levels = this.registry.get('levels');
    this.level = levels.find((l) => l.id === data.levelId);
    this.nextLevel = levels.find((l) => l.number === this.level.number + 1);
    this.venue = this.level.venues.find((v) => v.id === data.venueId);
    this.openRecapOnStart = !!data.recap;
    this.recap = null;
    this.pageNote = null; // the scene object is reused between visits
    this.newFriendIds = [];
    this.unlockCard = null;
    this.unlockQueue = [];
  }

  create() {
    const lvl = this.level;
    const score = scorePick(lvl.spec, this.venue, this.registry.get('rules'));
    const outcome = lvl.outcomes[this.venue.id] || { lines: [] };
    saveStars(lvl.id, score.stars);
    recordPick(lvl.id, this.venue.id); // for "been here before" in later levels

    const title = { perfect: 'PERFECT MATCH!', partial: 'CLEARED', fail: 'OH NO…' }[score.result];
    this.add.text(W / 2, 38, title, pixel(38, score.result === 'fail' ? C.bad : C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    this.add.text(W / 2, 78, `You sent everyone to ${this.venue.name}`, pixel(17, C.highlight)).setOrigin(0.5);
    for (let i = 0; i < 3; i++) {
      const s = this.add.graphics({ x: W / 2 - 56 + i * 56, y: 124 });
      star(s, 0, 0, 22, i < score.stars);
      s.setScale(0);
      tween(this, { targets: s, scale: 1, delay: 200 + i * 180, duration: 260, ease: 'Back.easeOut' });
    }
    // The count in words too, so it never depends on telling the star colours apart.
    this.starsLabel = this.add.text(W / 2 + 100, 124, `${score.stars} of 3 stars`, pixel(14, C.label)).setOrigin(0, 0.5);

    this.drawImageSlot(score.result);
    this.newPageNote();

    // Reaction lines
    let y = REACT.y + 16;
    outcome.lines.forEach((line, i) => {
      const ch = CHARACTERS[line.speaker] || { name: line.speaker, color: C.inkSoft };
      const c = this.add.container(0, y);
      c.add(portrait(this, REACT.x + 42, 30, 52, line.speaker, line.emotion));
      c.add(this.add.text(REACT.x + 80, 0, ch.name.toUpperCase(), pixel(15, ch.color, { fontStyle: 'bold' })));
      const body = this.add.text(REACT.x + 94, 28, line.text, readText(15, C.ink, { wordWrap: { width: REACT.w - 130, useAdvancedWrap: true } }));
      const bubble = this.add.graphics().fillStyle(0xffffff, 1).fillRoundedRect(REACT.x + 80, 19, body.width + 28, body.height + 18, 10);
      c.add([bubble, body]);
      c.setAlpha(0);
      tween(this, { targets: c, alpha: 1, delay: 700 + i * 500, duration: 250 });
      y += Math.max(body.height + 46, 70);
    });
    const panelH = Math.max(IMG.h, y - REACT.y + 6);
    panel(this, REACT.x, REACT.y, REACT.w, panelH, C.panel, 10).setDepth(-1);

    // Hint: name each missed preference (partial) or the broken hard constraint (fail).
    let hint = '';
    if (score.result === 'partial') hint = `Missed: ${score.missed.map(describeTag).join(', ')}  (−1 star${score.missed.length > 1 ? ' each' : ''})`;
    if (score.result === 'fail') hint = `Not safe for everyone: ${score.missed.map(describeTag).join(', ')}. Reread the chat and try again.`;
    if (hint) this.add.text(W / 2, REACT.y + panelH + 18, hint, pixel(17, C.highlight, { wordWrap: { width: W - 120 }, align: 'center' })).setOrigin(0.5, 0);

    // Buttons
    this.score = score;
    const btns = [['Clue recap', () => this.openRecap(), C.bar]];
    if (score.result !== 'perfect') {
      btns.push(['Reread the chat', () => this.scene.start('Chat', { levelId: lvl.id, highlight: score.missed }), C.blue]);
      btns.push(['Try again', () => this.scene.start('Results', { levelId: lvl.id }), C.accent]);
    }
    if (score.result !== 'fail') {
      btns.push(this.nextLevel
        ? ['Next level →', () => this.scene.start('Chat', { levelId: this.nextLevel.id }), C.good]
        : ['Back to levels', () => this.scene.start('Menu'), C.good]);
    }
    if (score.result === 'fail') btns.push(['Levels', () => this.scene.start('Menu'), C.bar]);
    const bw = btns.length > 3 ? 196 : 210;
    const x0 = W / 2 - ((btns.length - 1) * (bw + 20)) / 2;
    btns.forEach(([label, fn, fill], i) => button(this, x0 + i * (bw + 20), H - 44, label, fn, { w: bw, fill }));

    // Keyboard: left/right move a focus ring between the buttons, Enter presses. While the unlock card is up
    // the keys work on its two buttons; while the recap is open, Enter closes it.
    this.focusBtns = btns.map(([, fn], i) => ({ x: x0 + i * (bw + 20), y: H - 44, w: bw, h: 44, fn }));
    this.focus = btns.length - 1; // the forward button (next level / try again / levels)
    this.focusRing = this.add.graphics().setDepth(UNLOCK_DEPTH + 5);
    const kb = this.input.keyboard;
    const move = (d) => {
      const list = this.activeButtons();
      if (!list.length) return;
      this.setFocus((this.focusIndex() + d + list.length) % list.length);
    };
    kb.on('keydown-LEFT', () => move(-1));
    kb.on('keydown-RIGHT', () => move(1));
    kb.on('keydown-ENTER', () => {
      if (this.recap && !this.unlockCard) return this.closeRecap();
      const b = this.activeButtons()[this.focusIndex()];
      if (b) b.fn();
    });
    this.drawFocus();

    this.input.keyboard.on('keydown-ESC', () => (this.unlockCard ? this.showNextUnlock() : this.closeRecap()));
    if (this.openRecapOnStart) this.openRecap();
  }

  /**
   * Clue recap panel: one row per need (✓ met / ✗ missed, missed first), each with the chat line(s)
   * tagged with it. In star levels a small star marks lines the player saved to the Notebook.
   * After a fail, only the broken need is shown (see recapRows).
   */
  openRecap() {
    if (this.recap) return;
    const lvl = this.level;
    const rows = recapRows(lvl, this.score);
    const saved = pinMode(lvl) ? new Set(getPins(this, lvl.id)) : null;
    const { x, y, w, h } = RECAP;
    const objs = [];
    const keep = (o) => (objs.push(o), o.setDepth(RECAP_DEPTH));

    // Shade blocks the buttons underneath; clicking it closes the panel.
    keep(this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0).setInteractive()).on('pointerdown', () => this.closeRecap());
    const bg = keep(this.add.graphics()); // drawn once the list height is known (panel shrinks to fit)
    keep(this.add.text(x + 28, y + 22, 'CLUE RECAP', pixel(26, C.ink, { fontStyle: 'bold' })));
    keep(this.add.text(x + 28, y + 56, RECAP_SUB[this.score.result], text(14, C.inkSoft)));

    const area = scrollArea(this, x + 20, y + 88, w - 40, h - 160);
    keep(area.content);
    const LIST_W = w - 40;
    let ry = 4;
    for (const row of rows) {
      // status badge
      const badge = this.add.graphics({ x: 16, y: ry + 12 });
      badge.fillStyle(row.met ? C.good : C.bad, 1).fillCircle(0, 0, 12);
      badge.lineStyle(3, 0xffffff, 1);
      if (row.met) badge.beginPath().moveTo(-5, 0).lineTo(-1, 4).lineTo(6, -4).strokePath();
      else badge.lineBetween(-4, -4, 4, 4).lineBetween(4, -4, -4, 4);
      const label = this.add.text(38, ry + 2, describeTag(row.tag), pixel(17, C.ink, { fontStyle: 'bold' }));
      const kind = this.add.text(38 + label.width + 10, ry + 6, row.kind, text(12, row.kind === 'nice-to-have' ? C.inkSoft : C.rust));
      area.content.add([badge, label, kind]);
      ry += 30;

      if (!row.lines.length) {
        area.content.add(this.add.text(38, ry, '(no chat line carries this need)', text(14, C.inkSoft)));
        ry += 26;
      }
      for (const { index, line } of row.lines) {
        const ch = CHARACTERS[line.speaker] || { name: line.speaker, color: C.inkSoft };
        const isSaved = saved?.has(index);
        const quoteX = 38 + 14;
        const quote = this.add.text(quoteX, ry + 4, `“${line.text}”`, readText(14, C.ink, { wordWrap: { width: LIST_W - quoteX - (saved ? 150 : 24), useAdvancedWrap: true } }));
        const who = this.add.text(quoteX, ry + quote.height + 6, ch.name, pixel(13, ch.color, { fontStyle: 'bold' }));
        const bar = this.add.graphics().fillStyle(isSaved ? C.accent : C.panelDark, 1).fillRect(38, ry + 2, 4, quote.height + who.height + 6);
        area.content.add([bar, quote, who]);
        if (saved) {
          // Star levels: did the player's Notebook catch this line?
          const sx = LIST_W - 130;
          const st = this.add.graphics({ x: sx, y: ry + 12 });
          const pts = [];
          for (let i = 0; i < 10; i++) {
            const r = i % 2 === 0 ? 8 : 3.5;
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
          }
          st.fillStyle(isSaved ? C.accent : 0xffffff, 1).fillPoints(pts, true);
          st.lineStyle(1.5, isSaved ? C.accent : C.inkSoft, 1).strokePoints(pts, true, true);
          const note = this.add.text(sx + 14, ry + 4, isSaved ? 'in your notebook' : 'not starred', text(12, isSaved ? C.accentDark : C.inkSoft));
          area.content.add([st, note]);
        }
        ry += quote.height + who.height + 16;
      }
      ry += 12;
    }
    // Panel height: fits the list, up to RECAP.h (then the list scrolls).
    const ph = Math.min(h, 88 + ry + 72);
    bg.fillStyle(0x000000, 0.18).fillRoundedRect(x + 3, y + 5, w, ph, 16);
    bg.fillStyle(C.panel, 1).fillRoundedRect(x, y, w, ph, 16);
    keep(this.add.zone(x + w / 2, y + ph / 2, w, ph).setInteractive()); // clicks inside the panel don't close it
    area.content.setDepth(RECAP_DEPTH + 1);

    // "more below" hint while the list overflows and isn't scrolled to the end
    const more = keep(this.add.text(x + w - 28, y + ph - 64, '↓ scroll for more', text(12, C.inkSoft)).setOrigin(1, 0.5));
    area.onScroll(() => more.active && more.setVisible(!area.atBottom()));
    area.setContentHeight(ry);

    const close = button(this, x + w / 2, y + ph - 36, 'Close', () => this.closeRecap(), { w: 180, fill: C.accent });
    keep(close);
    this.recap = { objs, rows };
    this.drawFocus();
  }

  /**
   * Bible (Scrapbook > Where): a small "new page" note when this level unlocked a scrapbook page.
   * Shown once per visit: the list is cleared after it's announced.
   */
  newPageNote() {
    // Friends met for the first time on this level get their own card first (announced once each).
    const friends = newFriends(this.level.guests);
    markAnnounced(friends);
    this.newFriendIds = friends;
    const key = `newPages:${this.level.id}`;
    const ids = this.registry.get(key) || [];
    this.unlockQueue = [...friends.map((id) => ({ type: 'friend', id })), ...ids.map((id) => ({ type: 'page', id }))];
    if (this.unlockQueue.length) this.time.delayedCall(UNLOCK_DELAY_MS, () => this.showNextUnlock());
    if (!ids.length) return;
    this.registry.set(key, []);
    const callbacks = this.registry.get('rules').callbacks || {};
    const titles = ids.map((id) => callbacks[id]?.title || id);
    const label = `${ids.length > 1 ? 'NEW SCRAPBOOK PAGES' : 'NEW SCRAPBOOK PAGE'}`;
    const c = this.add.container(W - 24, 22);
    const t1 = this.add.text(-14, 10, label, pixel(13, C.accent, { fontStyle: 'bold' })).setOrigin(1, 0);
    const t2 = this.add.text(-14, 30, titles.join(' · '), text(14, C.ink)).setOrigin(1, 0);
    const bw = Math.max(t1.width, t2.width) + 28;
    const g = this.add.graphics();
    g.fillStyle(C.panel, 1).fillRoundedRect(-bw, 0, bw, 58, 10);
    g.lineStyle(2, C.accent, 1).strokeRoundedRect(-bw, 0, bw, 58, 10);
    c.add([g, t1, t2]);
    c.setAlpha(0);
    tween(this, { targets: c, alpha: 1, y: 26, delay: 900, duration: 300, ease: 'Back.easeOut' });
    this.pageNote = { ids, titles };
  }

  /**
   * Unlock cards, shown one after another ~1.4 s into the Outcome screen:
   *  - "A new friend has joined!" (Gabriella, 2026-11-13): a friend met for the first time; their happy
   *    portrait pops in with rays and sparkles, then their name. "See friends" opens the Friends page.
   *  - "New scrapbook page!" (Gabriella, 2026-11-12): the page's badge pops in, then title and friend.
   *    "See it" opens that page in the Scrapbook.
   * "Keep going" closes (or "Next →" when more cards follow). Shown here, after the level, never in the chat,
   * so it can't flag which chat line was a callback (and so often a clue).
   */
  showNextUnlock() {
    this.closeUnlock();
    const item = this.unlockQueue?.shift();
    if (!item) return;
    const { type, id } = item;
    let view;
    if (type === 'friend') {
      const ch = CHARACTERS[id] || { name: id, color: C.inkSoft };
      view = {
        head: 'A NEW FRIEND HAS JOINED!', ruled: false,
        centre: (x, y) => portrait(this, x, y, 112, id, 'HAPPY'),
        title: ch.name.toUpperCase(), titleColor: ch.color, sub: 'say hi on your Friends page', subColor: C.inkSoft,
        seeLabel: 'See friends', see: () => this.scene.start('Friends'),
      };
    } else {
      const cb = (this.registry.get('rules').callbacks || {})[id];
      if (!cb) return this.showNextUnlock();
      const ch = CHARACTERS[cb.friend] || { name: cb.friend, color: C.inkSoft };
      view = {
        head: 'NEW SCRAPBOOK PAGE!', ruled: true,
        centre: (x, y) => badge(this, x, y, 120, { id, ...cb }, true),
        title: cb.title.toUpperCase(), titleColor: C.ink, sub: `a memory with ${ch.name}`, subColor: ch.color,
        seeLabel: 'See it', see: () => this.scene.start('Scrapbook', { select: id }),
      };
    }
    const D = UNLOCK_DEPTH;
    const objs = [];
    const keep = (o) => (objs.push(o), o.setDepth(D));
    const card = { x: W / 2 - 230, y: 120, w: 460, h: 380 };
    const bx = W / 2;
    const by = card.y + 150;

    const shade = keep(this.add.rectangle(0, 0, W, H, 0x000000, 0.65).setOrigin(0).setInteractive().setAlpha(0));
    tween(this, { targets: shade, alpha: 1, duration: 200 });
    const sheet = keep(this.add.container(0, 40).setAlpha(0));
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.25).fillRoundedRect(card.x + 4, card.y + 6, card.w, card.h, 18);
    bg.fillStyle(C.panel, 1).fillRoundedRect(card.x, card.y, card.w, card.h, 18);
    bg.lineStyle(3, C.accent, 1).strokeRoundedRect(card.x, card.y, card.w, card.h, 18);
    // faint ruled lines for a scrapbook page
    if (view.ruled) {
      bg.lineStyle(1, C.panelDark, 1);
      for (let ly = card.y + 60; ly < card.y + card.h - 20; ly += 26) bg.lineBetween(card.x + 24, ly, card.x + card.w - 24, ly);
    }
    const head = this.add.text(bx, card.y + 30, view.head, pixel(22, C.accent, { fontStyle: 'bold' })).setOrigin(0.5);
    sheet.add([bg, head]);
    tween(this, { targets: sheet, y: 0, alpha: 1, duration: 320, ease: 'Back.easeOut' });

    // rays behind the badge, slowly turning
    const rays = keep(this.add.graphics({ x: bx, y: by }).setDepth(D + 1).setAlpha(0));
    rays.fillStyle(C.highlight, 0.55);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12;
      rays.fillTriangle(0, 0, Math.cos(a - 0.12) * 110, Math.sin(a - 0.12) * 110, Math.cos(a + 0.12) * 110, Math.sin(a + 0.12) * 110);
    }
    tween(this, { targets: rays, alpha: 1, delay: 300, duration: 300 });
    tween(this, { targets: rays, angle: 360, duration: 12000, repeat: -1 });

    const b = keep(view.centre(bx, by).setDepth(D + 2).setScale(0).setAngle(-25));
    tween(this, { targets: b, scale: 1, angle: 0, delay: 350, duration: 520, ease: 'Back.easeOut' });

    // sparkles burst out once the badge lands
    this.time.delayedCall(700, () => {
      if (this.unlockCard?.objs !== objs) return; // card already closed
      for (let i = 0; i < 14; i++) {
        const a = (i * Math.PI * 2) / 14 + Math.random() * 0.3;
        const s = keep(this.add.star(bx, by, 4, 2, 5, i % 2 ? C.gold : C.accent).setDepth(D + 3));
        tween(this, { targets: s, x: bx + Math.cos(a) * 130, y: by + Math.sin(a) * 110, alpha: 0, angle: 180, scale: 0.4, duration: 700, ease: 'Quad.easeOut' });
      }
    });

    const title = keep(this.add.text(bx, card.y + 252, view.title, pixel(22, view.titleColor, { fontStyle: 'bold' })).setOrigin(0.5).setDepth(D + 2).setAlpha(0));
    const who = keep(this.add.text(bx, card.y + 282, view.sub, text(15, view.subColor, { fontStyle: 'bold' })).setOrigin(0.5).setDepth(D + 2).setAlpha(0));
    tween(this, { targets: [title, who], alpha: 1, delay: 800, duration: 300 });

    const next = this.unlockQueue[0];
    const nextLabel = !next ? 'Keep going' : next.type === 'friend' ? 'Next friend →' : 'Next page →';
    const seeIt = view.see;
    const see = keep(button(this, bx - 105, card.y + card.h - 44, view.seeLabel, seeIt, { w: 190, fill: C.blue }).setDepth(D + 2).setAlpha(0));
    const go = keep(button(this, bx + 105, card.y + card.h - 44, nextLabel, () => this.showNextUnlock(), { w: 190, fill: C.accent }).setDepth(D + 2).setAlpha(0));
    tween(this, { targets: [see, go], alpha: 1, delay: 950, duration: 250 });

    this.unlockCard = {
      id, type, objs, focus: 1,
      buttons: [
        { x: bx - 105, y: card.y + card.h - 44, w: 190, h: 44, fn: seeIt },
        { x: bx + 105, y: card.y + card.h - 44, w: 190, h: 44, fn: () => this.showNextUnlock() },
      ],
    };
    this.drawFocus();
  }

  closeUnlock() {
    if (!this.unlockCard) return;
    for (const o of this.unlockCard.objs) {
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    this.unlockCard = null;
    this.drawFocus();
  }

  closeRecap() {
    if (!this.recap) return;
    for (const o of this.recap.objs) o.destroy();
    this.recap = null;
    this.drawFocus();
  }

  /** The buttons the arrow keys move between: the unlock card's while it's up, else the bottom row. */
  activeButtons() {
    if (this.unlockCard) return this.unlockCard.buttons || [];
    return this.recap ? [] : this.focusBtns || [];
  }

  focusIndex() {
    return this.unlockCard ? this.unlockCard.focus || 0 : this.focus;
  }

  setFocus(i) {
    if (this.unlockCard) this.unlockCard.focus = i;
    else this.focus = i;
    this.drawFocus();
  }

  /** Focus ring in C.highlight (read at draw time so High contrast applies); hidden while the recap is open. */
  drawFocus() {
    const g = this.focusRing;
    if (!g) return;
    g.clear();
    const b = this.activeButtons()[this.focusIndex()];
    if (b) g.lineStyle(4, C.highlight, 1).strokeRoundedRect(b.x - b.w / 2 - 5, b.y - b.h / 2 - 5, b.w + 10, b.h + 10, 12);
  }

  /**
   * Outcome illustration slot. Uses the first texture that exists:
   *   outcome_<level>_<venue>  (one picture per pick)   e.g. outcome_level_03_campus_bun_stop
   *   outcome_<level>_<result> (perfect|partial|fail)    e.g. outcome_level_03_fail
   *   outcome_<result>                                   e.g. outcome_perfect
   * None loaded yet, so it shows a framed placeholder naming the per-result key.
   */
  drawImageSlot(result) {
    const keys = [`outcome_${this.level.id}_${this.venue.id}`, `outcome_${this.level.id}_${result}`, `outcome_${result}`];
    const key = keys.find((k) => this.textures.exists(k));
    const { x, y, w, h } = IMG;
    const g = this.add.graphics();
    g.fillStyle(C.bar, 1).fillRoundedRect(x - 5, y - 5, w + 10, h + 10, 10);
    if (key) {
      this.add.image(x + w / 2, y + h / 2, key).setDisplaySize(w, h);
      return;
    }
    const tint = { perfect: C.blue, partial: C.rust, fail: C.angry }[result];
    g.fillStyle(tint, 1).fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(2, C.label, 0.6);
    for (let i = 0; i < w + h; i += 18) g.lineBetween(x + Math.max(0, i - h), y + Math.min(h, i), x + Math.min(w, i), y + Math.max(0, i - w));
    g.fillStyle(C.bar, 0.85).fillRoundedRect(x + 30, y + h / 2 - 34, w - 60, 68, 6);
    this.add.text(x + w / 2, y + h / 2 - 12, 'IMAGE GOES HERE', pixel(18, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    // Name the source file Gabriella would add: assets/art/level_XX_result_<venue name>.jpg
    const venueName = this.venue.id.replace(`${this.level.district}_`, '');
    this.add.text(x + w / 2, y + h / 2 + 14, `assets/art/${this.level.id}_result_${venueName}.jpg`, text(12, C.label)).setOrigin(0.5);
  }
}
