import Phaser from 'phaser';
import { C, W, H, CHARACTERS, DISTRICTS, hex, pixel, text } from '../ui/theme.js';
import { panel, button, portrait } from '../ui/widgets.js';
import { scrollArea, DRAG_THRESHOLD } from '../ui/scroll.js';
import { notebook, NOTEBOOK, pinMode, getPins, setPins } from '../ui/notebook.js';

const CHAT = { x: 24, y: 78, w: 644, h: 486 };

/**
 * Chat pacing: after each message the next speaker shows a "typing…" bubble for TYPING_MS,
 * then their message arrives on its own (Gabriella, 2026-11-11: bubbles last 1 s).
 */
const TYPING_MS = 1000;
/** Resting the pointer this long on an older message pauses the chat. */
const HOVER_PAUSE_MS = 300;
const KEY_STEP = 48;

const PROMPT = {
  idle: 'scroll up anytime to reread. the chat will wait',
  reread: 'take your time. scroll down or click to keep going',
  manual: 'paused. press P or click to keep going',
  done: 'that’s the whole chat. take your time and scroll up to read it all',
  missed: 'highlighted: the lines you missed',
};

/**
 * The group chat. Messages arrive one at a time on their own, each announced by a typing bubble.
 * - Click the chat, space or enter: next message now.  A: show the whole chat.  P: pause / resume.
 * - Scroll (wheel, drag, arrows, Page Up/Down, Home/End): scrolling up pauses until back at the bottom.
 * - Resting the pointer on an older message pauses too.
 * Notebook: in chapter 1 tagged lines are copied in as they appear; from PIN_FROM_CHAPTER the player
 * pins lines themselves with the pin beside each message (any line, so pinning never reveals what's a clue).
 * data: { levelId, revealAll?: boolean, highlight?: string[] (clue tags to highlight after a missed pick) }
 * Opening a level with only { levelId } (from the menu or "next level") starts with no pins.
 */
export default class ChatScene extends Phaser.Scene {
  constructor() {
    super('Chat');
  }

  init(data) {
    this.level = this.registry.get('levels').find((l) => l.id === data.levelId);
    this.highlight = data.highlight || [];
    this.revealAll = !!data.revealAll || this.highlight.length > 0;
    this.pinning = pinMode(this.level);
    if (this.pinning && !this.revealAll) setPins(this, this.level.id, []);
  }

  create() {
    const lvl = this.level;
    this.add.text(W / 2, 36, `LEVEL ${lvl.number} · ${(DISTRICTS[lvl.district] || lvl.district).toUpperCase()}`, pixel(24, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    button(this, 80, 36, '← Levels', () => this.scene.start('Menu'), { w: 120, h: 34, size: 15, fill: C.bar });
    lvl.guests.forEach((g, i) => portrait(this, W - 40 - i * 46, 36, 36, g, 'NEUTRAL'));

    panel(this, CHAT.x, CHAT.y, CHAT.w, CHAT.h);
    this.bg = this.drawBackground(lvl.chapter);
    this.notebook = notebook(this, this.highlight, this.pinning ? 'pinChat' : 'auto');
    this.chat = scrollArea(this, CHAT.x + 10, CHAT.y + 10, CHAT.w - 20, CHAT.h - 20);
    this.chatY = 6;
    this.shown = 0;
    this.msgs = []; // { y, h } of each message, in chat content space (for hover-to-pause)
    this.firstHighlightY = null;
    this.typing = null;
    this.timer = null;
    // Three reasons to hold the next message; the chat waits while any is true.
    this.hold = { reread: false, manual: false, hover: false };
    this.hoverTimer = null;

    // While reading, the picture follows reading progress (see next()); once the whole chat is shown,
    // it follows the scroll position, so scrolling back up pans back up the picture.
    this.chat.onScroll((f, byUser) => {
      if (this.bg && this.done()) this.panBackground(this.bg, f);
      this.hold.reread = !this.chat.atBottom();
      // Scrolling is the player's signal; the pointer resting on a message only counts again once it moves.
      if (byUser) this.trackHover(null);
      this.applyHold();
    });

    this.prompt = this.add.text(CHAT.x + CHAT.w / 2, H - 44, PROMPT.idle, pixel(16, C.highlight)).setOrigin(0.5);
    const keyHint = `space: next   ·   P: pause   ·   A: show all   ·   ↑ ↓: scroll${this.pinning ? '   ·   star: save to notebook' : ''}`;
    this.keys = this.add.text(CHAT.x + CHAT.w / 2, H - 20, keyHint, text(12, C.inkSoft)).setOrigin(0.5);
    this.go = button(this, NOTEBOOK.x + NOTEBOOK.w / 2, H - 38, 'Find a place →', () => this.scene.start('Results', { levelId: lvl.id }), { w: NOTEBOOK.w });
    this.go.setVisible(false);

    // Only a tap on the chat panel skips ahead (not the Notebook), and not the end of a drag.
    this.input.on('pointerup', (p, over) => {
      if (over.some((o) => o.isPin)) return; // tapping a pin saves the line, it doesn't skip
      const inChat = p.downX >= CHAT.x && p.downX <= CHAT.x + CHAT.w && p.downY >= CHAT.y && p.downY <= CHAT.y + CHAT.h;
      if (inChat && Phaser.Math.Distance.Between(p.downX, p.downY, p.upX, p.upY) < DRAG_THRESHOLD) this.next();
    });
    this.input.on('pointermove', (p) => this.trackHover(p));
    this.input.on('gameout', () => this.trackHover(null));

    const kb = this.input.keyboard;
    kb.on('keydown-SPACE', () => this.next());
    kb.on('keydown-ENTER', () => this.next());
    kb.on('keydown-A', () => this.showAll());
    kb.on('keydown-P', () => {
      if (this.done()) return;
      this.hold.manual = !this.hold.manual;
      this.applyHold();
    });
    kb.on('keydown-UP', () => this.chat.scrollBy(-KEY_STEP));
    kb.on('keydown-DOWN', () => this.chat.scrollBy(KEY_STEP));
    kb.on('keydown-PAGE_UP', () => this.chat.scrollBy(-this.chat.viewHeight * 0.8));
    kb.on('keydown-PAGE_DOWN', () => this.chat.scrollBy(this.chat.viewHeight * 0.8));
    kb.on('keydown-HOME', () => this.chat.scrollBy(-1e6));
    kb.on('keydown-END', () => this.chat.scrollBy(1e6));

    if (this.revealAll) {
      while (!this.done()) this.next(true);
      if (this.firstHighlightY !== null) this.chat.scrollTo(this.firstHighlightY);
      this.refreshPrompt();
    } else {
      this.next();
    }
  }

  done() {
    return this.shown >= this.level.script.length;
  }

  /**
   * Chapter backdrop (chat_bg_chapter_XX, full picture, already muted by the art script).
   * Shown at the panel's width, so the tall picture is longer than the panel; it pans with the chat.
   */
  drawBackground(chapter) {
    const key = `chat_bg_chapter_${String(chapter).padStart(2, '0')}`;
    if (!this.textures.exists(key)) return null;
    const src = this.textures.get(key).getSourceImage();
    const img = this.add.image(CHAT.x, CHAT.y, key).setOrigin(0);
    img.setDisplaySize(CHAT.w, Math.max(CHAT.h, (CHAT.w * src.height) / src.width));
    const shape = this.make.graphics({}, false).fillStyle(0xffffff).fillRoundedRect(CHAT.x, CHAT.y, CHAT.w, CHAT.h, 16);
    img.setMask(shape.createGeometryMask());
    return img;
  }

  /** Top of the picture when the chat is at the top, bottom of the picture when it's scrolled to the end. */
  panBackground(img, fraction) {
    const y = CHAT.y - fraction * (img.displayHeight - CHAT.h);
    this.tweens.killTweensOf(img);
    this.tweens.add({ targets: img, y, duration: 350, ease: 'Sine.easeOut' });
  }

  next(instant = false) {
    const script = this.level.script;
    this.clearTyping();
    if (this.done()) return;
    const idx = this.shown++;
    const line = script[idx];
    this.addMessage(line, instant, idx);
    if (this.pinning ? getPins(this, this.level.id).includes(idx) : line.clue) this.notebook.add(line, idx);
    if (!instant) this.chat.scrollToBottom();
    if (this.bg && !instant && !this.done()) this.panBackground(this.bg, (this.shown - 1) / Math.max(1, script.length - 1));
    if (this.done()) {
      this.hold.manual = false;
      this.go.setVisible(true);
    } else if (!instant) {
      this.showTyping(script[this.shown].speaker);
      this.timer = this.time.delayedCall(TYPING_MS, () => this.next());
      this.applyHold();
    }
    this.refreshPrompt();
  }

  /** A: reveal every remaining message at once and jump to the end. */
  showAll() {
    if (this.done()) return;
    while (!this.done()) this.next(true);
    this.chat.scrollToBottom();
  }

  /** Pause the wait for the next message while the player is rereading, has paused, or rests on an older message. */
  applyHold() {
    const held = this.hold.reread || this.hold.manual || this.hold.hover;
    if (this.timer) this.timer.paused = held;
    if (this.typing) {
      this.tweens.killTweensOf(this.typing.c);
      this.typing.c.setAlpha(held ? 0.45 : 0.8);
    }
    this.refreshPrompt();
  }

  refreshPrompt() {
    if (!this.prompt) return;
    let msg = PROMPT.idle;
    if (this.done()) msg = this.highlight.length ? PROMPT.missed : PROMPT.done;
    else if (this.hold.manual) msg = PROMPT.manual;
    else if (this.hold.reread || this.hold.hover) msg = PROMPT.reread;
    if (this.prompt.text !== msg) this.prompt.setText(msg);
  }

  /** Resting on any message but the newest for HOVER_PAUSE_MS holds the chat; moving off releases it. */
  trackHover(p) {
    let overOlder = false;
    if (p && !this.done() && p.x >= CHAT.x && p.x <= CHAT.x + CHAT.w && p.y >= CHAT.y && p.y <= CHAT.y + CHAT.h) {
      const cy = p.y - this.chat.content.y;
      const i = this.msgs.findIndex((m) => cy >= m.y && cy <= m.y + m.h);
      overOlder = i >= 0 && i < this.msgs.length - 1;
    }
    if (overOlder) {
      if (!this.hold.hover && !this.hoverTimer) {
        this.hoverTimer = this.time.delayedCall(HOVER_PAUSE_MS, () => {
          this.hoverTimer = null;
          this.hold.hover = true;
          this.applyHold();
        });
      }
    } else {
      if (this.hoverTimer) this.hoverTimer.remove(false);
      this.hoverTimer = null;
      if (this.hold.hover) {
        this.hold.hover = false;
        this.applyHold();
      }
    }
  }

  /** "Name is typing" row under the last message: the speaker's portrait and three pulsing dots. */
  showTyping(speaker) {
    const ch = CHARACTERS[speaker] || { name: speaker, color: C.inkSoft };
    const c = this.add.container(0, this.chatY);
    const face = portrait(this, 30, 30, 52, speaker, 'NEUTRAL');
    const name = this.add.text(70, 0, `${ch.name.toUpperCase()} is typing`, pixel(15, ch.color, { fontStyle: 'bold', stroke: hex(C.panel), strokeThickness: 4 }));
    const bubble = this.add.graphics().fillStyle(C.panel, 1).fillRoundedRect(70, 19, 64, 34, 10);
    const dots = [0, 1, 2].map((i) => this.add.circle(88 + i * 14, 36, 4, C.inkSoft).setAlpha(0.3));
    c.add([bubble, face, name, ...dots]);
    // Slightly faded so it never reads as an empty message.
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 0.8, duration: 150 });
    // A full pulse across the three dots fits inside the 1 s bubble.
    dots.forEach((d, i) => this.tweens.add({ targets: d, alpha: 1, y: 32, duration: 250, delay: i * 100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    this.chat.content.add(c);
    this.typing = { c, dots };
    this.chat.setContentHeight(this.chatY + 64);
    this.chat.scrollToBottom();
  }

  clearTyping() {
    if (this.timer) this.timer.remove(false);
    this.timer = null;
    if (!this.typing) return;
    this.tweens.killTweensOf([this.typing.c, ...this.typing.dots]);
    this.typing.c.destroy();
    this.typing = null;
    this.chat.setContentHeight(this.chatY);
  }

  /**
   * Save-to-notebook star beside the bubble (Gabriella, 2026-11-11: star instead of a push-pin).
   * Always visible (touch has no hover). Unsaved: white outline star. Saved: filled orange star, the
   * bubble turns `C.starred` with an orange edge (see addMessage), and the line is in the Notebook.
   * Code still calls these "pins". onChange(pinned) lets the bubble redraw.
   */
  addPin(c, x, y, idx, line, onChange) {
    // Drawn around its own origin so the pop animation scales in place.
    const g = this.add.graphics({ x, y });
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 12 : 5.2;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    const draw = (pinned, hover) => {
      g.clear();
      g.fillStyle(pinned ? C.accent : 0xffffff, 1).fillPoints(pts, true);
      g.lineStyle(hover ? 2.5 : 2, pinned || hover ? C.ink : C.inkSoft, 1).strokePoints(pts, true, true);
    };
    const isPinned = () => getPins(this, this.level.id).includes(idx);
    draw(isPinned(), false);
    const zone = this.add.zone(x, y, 32, 32).setInteractive({ useHandCursor: true });
    zone.isPin = true;
    zone.on('pointerover', () => draw(isPinned(), true));
    zone.on('pointerout', () => draw(isPinned(), false));
    zone.on('pointerup', (p) => {
      const inChat = p.y >= CHAT.y && p.y <= CHAT.y + CHAT.h; // masked rows above/below the panel don't count
      if (!inChat || Phaser.Math.Distance.Between(p.downX, p.downY, p.upX, p.upY) >= DRAG_THRESHOLD) return;
      const pins = getPins(this, this.level.id);
      const pinned = !pins.includes(idx);
      setPins(this, this.level.id, pinned ? [...pins, idx] : pins.filter((i) => i !== idx));
      if (pinned) this.notebook.add(line, idx);
      else this.notebook.remove(idx);
      draw(pinned, true);
      onChange(pinned);
      this.tweens.add({ targets: g, scale: { from: 1.25, to: 1 }, duration: 160, ease: 'Back.easeOut' });
    });
    c.add([g, zone]);
  }

  addMessage(line, instant, idx) {
    const ch = CHARACTERS[line.speaker] || { name: line.speaker, color: C.inkSoft };
    const hl = line.clue && this.highlight.includes(line.clue);
    const y = this.chatY;
    const c = this.add.container(0, y);
    const face = portrait(this, 30, 30, 52, line.speaker, line.emotion);
    // Names sit on the backdrop, so a cream outline keeps them readable.
    const name = this.add.text(70, 0, ch.name.toUpperCase(), pixel(15, ch.color, { fontStyle: 'bold', stroke: hex(C.panel), strokeThickness: 4 }));
    // In pin levels, wrap a little narrower so the star fits beside the widest bubble.
    const wrap = CHAT.w - (this.pinning ? 164 : 140);
    const body = this.add.text(84, 28, line.text, text(16, C.ink, { wordWrap: { width: wrap, useAdvancedWrap: true } }));
    const bw = Math.max(body.width + 28, 60);
    const bh = body.height + 18;
    const bubble = this.add.graphics();
    // Missed line (after a wrong pick): yellow with a thick orange edge. Starred: soft cream with a thin
    // orange edge. If both, the missed highlight wins: it's the one the player needs to notice.
    const drawBubble = (starred) => {
      bubble.clear();
      const fill = hl ? C.highlight : starred ? C.starred : 0xffffff;
      bubble.fillStyle(fill, 1).fillRoundedRect(70, 19, bw, bh, 10);
      if (hl) bubble.lineStyle(3, C.accent, 1).strokeRoundedRect(70, 19, bw, bh, 10);
      else if (starred) bubble.lineStyle(2, C.accent, 1).strokeRoundedRect(70, 19, bw, bh, 10);
    };
    drawBubble(this.pinning && getPins(this, this.level.id).includes(idx));
    c.add([bubble, face, name, body]);
    if (this.pinning) this.addPin(c, 70 + bw + 20, 19 + Math.min(bh / 2, 18), idx, line, drawBubble);
    this.chat.content.add(c);
    if (hl && this.firstHighlightY === null) this.firstHighlightY = y;
    const rowH = Math.max(19 + bh, 64);
    this.msgs.push({ y, h: rowH });
    this.chatY += rowH + 10;
    this.chat.setContentHeight(this.chatY);
    if (!instant) {
      c.setAlpha(0);
      c.x = -12;
      this.tweens.add({ targets: c, alpha: 1, x: 0, duration: 180, ease: 'Quad.easeOut' });
    }
  }
}
