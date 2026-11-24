import Phaser from 'phaser';
import { C, W, H, CHARACTERS, nameColor, hex, pixel, text, readText } from '../ui/theme.js';
import { button, portrait, star, loadProgress, keyHint } from '../ui/widgets.js';
import { scrollArea } from '../ui/scroll.js';
import { tween } from '../ui/motion.js';
import { play as playSfx } from '../ui/sfx.js';
import { chatPaceMs, highContrast, reduceMotion } from '../ui/settings.js';
import { starTotals } from '../logic/progress.js';
import { markEndingSeen } from '../ui/endingStore.js';
import { ending } from '../content.js';
import { goScene } from '../ui/sceneSwitch.js';

// Ending (bible: Campaign structure > Maya's send-off; Gabriella 2026-11-23: options 1 and 2 merged, chat first,
// then the photo page). Part 1: the final group chat, the next morning. Part 2: the group photo and roll call
// on a scrapbook page. Lines come from content/campaign/ending.json; the game never writes them itself.
const CHAT = { x: 24, y: 84, w: 604, h: 500 };
const CARD = { x: 648, y: 84, w: 288, h: 500 };
const BOOK = { x: 32, y: 112, w: 896, h: 440 };
const MID = BOOK.x + BOOK.w / 2;
const PW = BOOK.w / 2;
const PAPER = 0xfbf3e6;
const PAPER_LEFT = 0xf6ecdc;
const FRIENDS = Object.keys(CHARACTERS);
const COAST_PHOTO = 'ending_coast_photo';
const GROUP_PHOTO = 'ending_group_photo';
const TO_COME = '[line to come]';
const GREY = 0xd8d2cc;

/** Grey placeholder lines until the narrative writer has written content/campaign/ending.json. */
function chatLines() {
  if (Array.isArray(ending?.chat) && ending.chat.length) return ending.chat;
  return ['maya', 'brooke', 'liam', 'mina', 'roxy', 'cyrus', 'maya'].map((speaker, i) => ({
    speaker, emotion: 'HAPPY', text: TO_COME, photo: i === 0, placeholder: true,
  }));
}

export default class EndingScene extends Phaser.Scene {
  constructor() {
    super('Ending');
  }

  /** data: { part?: 1 | 2 } */
  init(data) {
    this.part = data?.part === 2 ? 2 : 1;
  }

  create() {
    // Seen is recorded only when the player leaves part 2 for the map (leave()), so a reload replays it.
    this.leaving = false;
    const kb = this.input.keyboard;
    // Phaser can hand the same keydown to a listener twice when keys come quickly; act once per native event.
    let last = null;
    this.onKey = (name, fn) => kb?.on(`keydown-${name}`, (e) => {
      if (e === last || this.registry.get('hudPanelOpen')) return;
      last = e;
      fn(e);
    });
    if (this.part === 1) this.createChat();
    else this.createPhotoPage();
    this.events.once('shutdown', () => this.timer?.remove(false));
  }

  // ---------------- Part 1: the final group chat ----------------

  createChat() {
    this.lines = chatLines();
    this.shown = 0;
    this.chatY = 12;
    this.typing = null;

    this.add.text(CHAT.x + CHAT.w / 2, 30, 'THE GROUP CHAT', pixel(28, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    this.add.text(CHAT.x + CHAT.w / 2, 60, 'the next morning', pixel(15, C.highlight)).setOrigin(0.5);

    const g = this.add.graphics();
    g.fillStyle(C.panel, 1).fillRoundedRect(CHAT.x, CHAT.y, CHAT.w, CHAT.h, 16);
    this.drawBackground();
    this.chat = scrollArea(this, CHAT.x, CHAT.y, CHAT.w, CHAT.h);
    // Key hint (bug hunt KB-09): every key part 1 handles.
    this.keys = keyHint(this, 'space or enter: next · a: show all · ↑ ↓: scroll · m: music · esc: skip · backspace too', { x: CHAT.x + CHAT.w / 2, y: H - 28 });

    this.onKey('SPACE', () => this.advance());
    this.onKey('ENTER', () => (this.done() ? this.toPart2() : this.advance()));
    this.onKey('RIGHT', () => { if (this.done()) this.toPart2(); });
    this.onKey('A', () => this.showAll());
    this.onKey('UP', () => this.chat.scrollBy(-60));
    this.onKey('DOWN', () => this.chat.scrollBy(60));
    this.onKey('ESC', () => this.toPart2());
    this.onKey('BACKSPACE', () => this.toPart2());
    this.input.on('pointerup', (p) => {
      const inChat = p.x >= CHAT.x && p.x <= CHAT.x + CHAT.w && p.y >= CHAT.y && p.y <= CHAT.y + CHAT.h;
      if (inChat && Phaser.Math.Distance.Between(p.downX, p.downY, p.upX, p.upY) < 6) this.advance();
    });

    this.queueNext();
  }

  done() {
    return this.shown >= this.lines.length;
  }

  /** Chapter 4 backdrop, at the panel's width, faded under High contrast, as on the Chat screen. */
  drawBackground() {
    const key = 'chat_bg_chapter_04';
    if (!this.textures.exists(key)) return;
    const src = this.textures.get(key).getSourceImage();
    const img = this.add.image(CHAT.x, CHAT.y, key).setOrigin(0);
    img.setDisplaySize(CHAT.w, Math.max(CHAT.h, (CHAT.w * src.height) / src.width));
    const shape = this.make.graphics({}, false).fillStyle(0xffffff).fillRoundedRect(CHAT.x, CHAT.y, CHAT.w, CHAT.h, 16);
    img.setMask(shape.createGeometryMask());
    if (highContrast()) img.setAlpha(0.25);
  }

  /** "<name> is typing" for the Chat pace, then the next message. */
  queueNext() {
    if (this.done()) return;
    this.showTyping(this.lines[this.shown].speaker);
    this.timer = this.time.delayedCall(chatPaceMs(), () => this.advance());
  }

  advance(instant = false) {
    if (this.done()) return;
    this.clearTyping();
    this.addMessage(this.lines[this.shown++], instant);
    if (this.done()) this.showEndCard();
    else if (!instant) this.queueNext();
  }

  showAll() {
    while (!this.done()) this.advance(true);
  }

  showTyping(speaker) {
    const ch = CHARACTERS[speaker] || { name: speaker || '', color: C.inkSoft };
    const c = this.add.container(0, this.chatY);
    const face = portrait(this, 30, 30, 52, speaker, 'NEUTRAL');
    const name = this.add.text(70, 0, `${ch.name.toUpperCase()} is typing`, pixel(15, nameColor(speaker), { fontStyle: 'bold', stroke: hex(C.panel), strokeThickness: 4 }));
    const bubble = this.add.graphics().fillStyle(0xffffff, 1).fillRoundedRect(70, 19, 64, 34, 10);
    const dots = [0, 1, 2].map((i) => this.add.circle(88 + i * 14, 36, 4, C.inkSoft).setAlpha(0.3));
    c.add([bubble, face, name, ...dots]);
    c.setAlpha(0);
    tween(this, { targets: c, alpha: 0.8, duration: 150 });
    dots.forEach((d, i) => tween(this, { targets: d, alpha: 1, y: 32, duration: 250, delay: i * 100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    this.chat.content.add(c);
    this.typing = { c, dots };
    this.chat.setContentHeight(this.chatY + 64);
    this.chat.scrollToBottom();
  }

  clearTyping() {
    this.timer?.remove(false);
    this.timer = null;
    if (!this.typing) return;
    this.tweens.killTweensOf([this.typing.c, ...this.typing.dots]);
    this.typing.c.destroy();
    this.typing = null;
    this.chat.setContentHeight(this.chatY);
  }

  /** Portrait, name and a white bubble; a line with "photo" carries ending_coast_photo inside the bubble. */
  addMessage(line, instant) {
    const ch = CHARACTERS[line.speaker] || { name: line.speaker || '', color: C.inkSoft };
    const grey = !!line.placeholder;
    const c = this.add.container(0, this.chatY);
    const face = portrait(this, 30, 30, 52, line.speaker, line.emotion);
    const name = this.add.text(70, 0, ch.name.toUpperCase(), pixel(15, nameColor(line.speaker), { fontStyle: 'bold', stroke: hex(C.panel), strokeThickness: 4 }));
    const maxW = CHAT.w - 70 - 30;
    const t = this.add.text(84, 30, line.text || TO_COME, readText(15, grey ? C.inkSoft : C.ink, { wordWrap: { width: maxW - 28 } }));
    let bw = Math.max(80, t.width + 28);
    let bh = t.height + 20;
    const extra = [];
    if (line.photo) {
      const pw = Math.min(280, maxW - 28), ph = Math.round((pw * 2) / 3);
      const pc = this.add.container(0, 0);
      this.art(pc, COAST_PHOTO, 84, 30 + t.height + 10, pw, ph);
      extra.push(pc);
      bh += ph + 10;
      bw = Math.max(bw, pw + 28);
    }
    const bubble = this.add.graphics().fillStyle(grey ? GREY : 0xffffff, 1).fillRoundedRect(70, 20, bw, bh, 10);
    c.add([bubble, face, name, t, ...extra]);
    this.chat.content.add(c);
    this.chatY += Math.max(64, 20 + bh + 14);
    this.chat.setContentHeight(this.chatY);
    this.chat.scrollToBottom();
    if (!instant) {
      c.setAlpha(0);
      c.x = -12;
      tween(this, { targets: c, alpha: 1, x: 0, duration: 220, ease: 'Sine.easeOut' });
    }
  }

  /** The art if loaded; otherwise the striped "ART GOES HERE" placeholder naming the file (as the Scrapbook does). */
  art(c, key, x, y, w, h) {
    if (this.textures.exists(key)) {
      c.add(this.add.image(x + w / 2, y + h / 2, key).setDisplaySize(w, h));
      return;
    }
    const g = this.add.graphics();
    g.fillStyle(C.blue, 1).fillRect(x, y, w, h);
    g.lineStyle(2, C.label, 0.5);
    for (let i = 0; i < w + h; i += 18) g.lineBetween(x + Math.max(0, i - h), y + Math.min(h, i), x + Math.min(w, i), y + Math.max(0, i - w));
    g.fillStyle(C.bar, 0.85).fillRoundedRect(x + 16, y + h / 2 - 30, w - 32, 60, 6);
    c.add([g,
      this.add.text(x + w / 2, y + h / 2 - 10, 'ART GOES HERE', pixel(15, C.label, { fontStyle: 'bold' })).setOrigin(0.5),
      this.add.text(x + w / 2, y + h / 2 + 12, `${key}.png`, text(11, C.label)).setOrigin(0.5)]);
  }

  /** "The End": campaign stars, the six friends' faces and Continue. */
  showEndCard() {
    this.keys.setHint('enter or →: continue · ↑ ↓: scroll · m: music · esc: skip · backspace too');
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(CARD.x + 4, CARD.y + 6, CARD.w, CARD.h, 16);
    g.fillStyle(C.panel, 1).fillRoundedRect(CARD.x, CARD.y, CARD.w, CARD.h, 16);
    c.add(g);
    const cx = CARD.x + CARD.w / 2;
    c.add(this.add.text(cx, CARD.y + 48, 'The End', pixel(40, C.ink, { fontStyle: 'bold' })).setOrigin(0.5));
    const levels = this.registry.get('levels') || [];
    const { earned, max } = starTotals(levels, loadProgress());
    const sg = this.add.graphics();
    star(sg, cx - 58, CARD.y + 112, 18, true);
    c.add([sg, this.add.text(cx - 32, CARD.y + 112, `${earned} / ${max}`, pixel(26, C.ink, { fontStyle: 'bold' })).setOrigin(0, 0.5)]);
    c.add(this.add.text(cx, CARD.y + 146, 'campaign stars', pixel(14, C.inkSoft)).setOrigin(0.5));
    FRIENDS.forEach((id, i) => {
      const x = cx + ((i % 3) - 1) * 84, y = CARD.y + 220 + Math.floor(i / 3) * 104;
      c.add(portrait(this, x, y, 64, id, 'HAPPY'));
      c.add(this.add.text(x, y + 46, CHARACTERS[id].name, pixel(14, nameColor(id), { fontStyle: 'bold' })).setOrigin(0.5));
    });
    c.add(button(this, cx, CARD.y + CARD.h - 44, 'Continue →', () => this.toPart2(), { w: 200, h: 44, fill: C.good }));
    c.setAlpha(0);
    c.x = 40;
    tween(this, { targets: c, alpha: 1, x: 0, duration: 400, ease: 'Back.easeOut' });
  }

  toPart2() {
    if (this.leaving) return;
    this.leaving = true;
    if (this.done()) playSfx(this, 'click');
    this.scene.restart({ part: 2 });
  }

  // ---------------- Part 2: the group photo + roll call ----------------

  createPhotoPage() {
    this.ready = false;
    this.add.text(W / 2, 34, 'THE SEND-OFF', pixel(30, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    this.add.text(W / 2, 66, 'chapter 4 · waterfront · the end', pixel(15, C.highlight)).setOrigin(0.5);

    const B = BOOK;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(B.x + 4, B.y + 8, B.w, B.h, 10);
    g.fillStyle(CHARACTERS.maya.color, 1).fillRoundedRect(B.x - 8, B.y - 6, B.w + 16, B.h + 14, 12);
    g.fillStyle(PAPER_LEFT, 1).fillRoundedRect(B.x, B.y, PW, B.h, { tl: 8, bl: 8, tr: 0, br: 0 });
    g.fillStyle(PAPER, 1).fillRoundedRect(MID, B.y, PW, B.h, { tl: 0, bl: 0, tr: 8, br: 8 });
    for (let i = 0; i < 14; i++) {
      g.fillStyle(0x000000, 0.14 * (1 - i / 14)).fillRect(MID - i - 1, B.y, 1, B.h);
      g.fillStyle(0x000000, 0.1 * (1 - i / 14)).fillRect(MID + i, B.y, 1, B.h);
    }

    this.add.text(MID + PW / 2, B.y + 34, 'ROLL CALL', pixel(24, C.ink, { fontStyle: 'bold' })).setOrigin(0.5);

    const next = () => this.leave();
    this.onKey('ENTER', () => { if (this.ready) next(); });
    this.onKey('RIGHT', () => { if (this.ready) next(); });
    this.onKey('ESC', () => this.leave(false));
    this.onKey('BACKSPACE', () => this.leave(false));
    // Key hint (bug hunt KB-09): Esc / Backspace work from the start; Enter / → join once Continue is up
    // (rollCall). Left of centre so it stays clear of the Continue button bottom right.
    this.keys = keyHint(this, 'm: music  ·  esc: back to the map  ·  backspace too', { x: 380 });

    this.dropPolaroid(() => this.rollCall());
  }

  /** The polaroid of all six drops onto the left page, then is taped on. */
  dropPolaroid(onDone) {
    const aw = 340, ah = 228, b = 12, foot = 62;
    const fw = aw + 2 * b, fh = ah + b + foot;
    const cx = BOOK.x + PW / 2, cy = BOOK.y + BOOK.h / 2 + 4;
    const c = this.add.container(cx, cy).setDepth(2);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.28).fillRect(-fw / 2 + 5, -fh / 2 + 7, fw, fh);
    g.fillStyle(0xffffff, 1).fillRect(-fw / 2, -fh / 2, fw, fh);
    c.add(g);
    this.art(c, GROUP_PHOTO, -aw / 2, -fh / 2 + b, aw, ah);
    const caption = typeof ending?.caption === 'string' && ending.caption ? ending.caption : '[caption to come]';
    c.add(this.add.text(0, fh / 2 - foot / 2, caption, readText(17, ending?.caption ? C.ink : C.inkSoft, {
      fontStyle: 'italic', align: 'center', wordWrap: { width: fw - 32 },
    })).setOrigin(0.5));

    const tape = this.add.graphics().fillStyle(C.highlight, 0.72);
    tape.fillPoints([{ x: -40, y: -fh / 2 - 14 }, { x: 40, y: -fh / 2 - 22 }, { x: 44, y: -fh / 2 + 8 }, { x: -36, y: -fh / 2 + 16 }], true);
    tape.setAlpha(0);
    c.add(tape);

    c.y = cy - 320;
    c.angle = -14;
    c.setAlpha(0);
    tween(this, {
      targets: c, y: cy, angle: -3, alpha: 1, duration: 700, ease: 'Back.easeOut',
      onComplete: () => {
        playSfx(this, 'outcome_perfect');
        tape.setScale(1.3);
        tween(this, {
          targets: tape, alpha: 1, scaleX: 1, scaleY: 1, duration: 220, delay: 250,
          onComplete: () => { playSfx(this, 'badge_stuck'); onDone(); },
        });
      },
    });
  }

  /** One closing line per friend, portrait and name colour, appearing one by one; then thanks and Continue. */
  rollCall() {
    const step = reduceMotion() ? 0 : 450;
    const x0 = MID + 28, y0 = BOOK.y + 70, rowH = 54;
    FRIENDS.forEach((id, i) => {
      const entry = ending?.roll_call?.[id];
      const grey = !entry?.text;
      const c = this.add.container(x0, y0 + i * rowH).setAlpha(0);
      c.add(portrait(this, 22, 22, 40, id, entry?.emotion || 'HAPPY'));
      c.add(this.add.text(52, 0, CHARACTERS[id].name.toUpperCase(), pixel(14, nameColor(id), { fontStyle: 'bold' })));
      const body = this.add.text(52, 20, entry?.text || TO_COME, readText(13, grey ? C.inkSoft : C.ink, { wordWrap: { width: PW - 100 } }));
      if (grey) c.add(this.add.graphics().fillStyle(GREY, 1).fillRoundedRect(46, 17, body.width + 12, body.height + 6, 6));
      c.add(body);
      this.time.delayedCall(step * (i + 1), () => tween(this, { targets: c, alpha: 1, duration: 260 }));
    });
    this.time.delayedCall(step * (FRIENDS.length + 1.5), () => {
      const thanks = this.add.text(MID + PW / 2, BOOK.y + BOOK.h - 30, 'thanks for always knowing where to eat.', readText(16, C.ink, { fontStyle: 'italic' })).setOrigin(0.5).setAlpha(0);
      const btn = button(this, W - 130, H - 44, 'Continue →', () => this.leave(), { w: 200, h: 44, fill: C.good }).setAlpha(0);
      tween(this, { targets: [thanks, btn], alpha: 1, duration: 400, onComplete: () => {
        this.ready = true;
        this.keys.setHint('enter or →: continue  ·  m: music  ·  esc: back to the map  ·  backspace too');
      } });
    });
  }

  /** Back to the map. click: false for Esc/Backspace (no button pressed). */
  leave(click = true) {
    if (this.leaving) return;
    this.leaving = true;
    if (click && !this.ready) return void (this.leaving = false);
    if (click) playSfx(this, 'click');
    markEndingSeen(); // only now: a reload or closed tab mid-ending offers it again
    goScene(this, 'Menu');
  }
}
