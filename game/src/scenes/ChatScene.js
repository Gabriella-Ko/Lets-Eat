import Phaser from 'phaser';
import { C, W, H, CHARACTERS, DISTRICTS, hex, pixel, text } from '../ui/theme.js';
import { panel, button, portrait } from '../ui/widgets.js';
import { scrollArea } from '../ui/scroll.js';
import { notebook, NOTEBOOK } from '../ui/notebook.js';

const CHAT = { x: 24, y: 78, w: 644, h: 486 };

/**
 * The group chat. Messages appear one at a time (click, space or enter).
 * Tagged lines are copied into the Notebook as the player reads them.
 * data: { levelId, revealAll?: boolean, highlight?: string[] (clue tags to highlight after a missed pick) }
 */
export default class ChatScene extends Phaser.Scene {
  constructor() {
    super('Chat');
  }

  init(data) {
    this.level = this.registry.get('levels').find((l) => l.id === data.levelId);
    this.highlight = data.highlight || [];
    this.revealAll = !!data.revealAll || this.highlight.length > 0;
  }

  create() {
    const lvl = this.level;
    this.add.text(W / 2, 36, `LEVEL ${lvl.number} · ${(DISTRICTS[lvl.district] || lvl.district).toUpperCase()}`, pixel(24, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    button(this, 80, 36, '← Levels', () => this.scene.start('Menu'), { w: 120, h: 34, size: 15, fill: C.bar });
    lvl.guests.forEach((g, i) => portrait(this, W - 40 - i * 46, 36, 36, g, 'NEUTRAL'));

    panel(this, CHAT.x, CHAT.y, CHAT.w, CHAT.h);
    this.bg = this.drawBackground(lvl.chapter);
    this.notebook = notebook(this, this.highlight);
    this.chat = scrollArea(this, CHAT.x + 10, CHAT.y + 10, CHAT.w - 20, CHAT.h - 20);
    // While reading, the picture follows reading progress (see next()); once the whole chat is shown,
    // it follows the scroll position, so scrolling back up pans back up the picture.
    this.chat.onScroll((f) => {
      if (this.bg && this.shown >= lvl.script.length) this.panBackground(this.bg, f);
    });
    this.chatY = 6;
    this.shown = 0;
    this.firstHighlightY = null;

    this.prompt = this.add.text(CHAT.x + CHAT.w / 2, H - 38, 'click or press space to keep reading', pixel(16, C.highlight)).setOrigin(0.5);
    this.go = button(this, NOTEBOOK.x + NOTEBOOK.w / 2, H - 38, 'Find a place →', () => this.scene.start('Results', { levelId: lvl.id }), { w: NOTEBOOK.w });
    this.go.setVisible(false);

    this.input.on('pointerdown', () => this.next());
    this.input.keyboard.on('keydown-SPACE', () => this.next());
    this.input.keyboard.on('keydown-ENTER', () => this.next());

    if (this.revealAll) {
      while (this.shown < lvl.script.length) this.next(true);
      if (this.firstHighlightY !== null) this.chat.scrollTo(this.firstHighlightY);
      if (this.highlight.length) this.prompt.setText('highlighted: the lines you missed');
    } else {
      this.next();
    }
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
    if (this.shown >= script.length) return;
    const line = script[this.shown++];
    this.addMessage(line, instant);
    if (line.clue) this.notebook.add(line);
    if (!instant) this.chat.scrollToBottom();
    if (this.bg && !instant && this.shown < script.length) this.panBackground(this.bg, (this.shown - 1) / Math.max(1, script.length - 1));
    if (this.shown >= script.length) {
      if (!this.highlight.length) this.prompt.setText('that’s the whole chat. scroll up to reread');
      this.go.setVisible(true);
    }
  }

  addMessage(line, instant) {
    const ch = CHARACTERS[line.speaker] || { name: line.speaker, color: C.inkSoft };
    const hl = line.clue && this.highlight.includes(line.clue);
    const y = this.chatY;
    const c = this.add.container(0, y);
    const face = portrait(this, 30, 30, 52, line.speaker, line.emotion);
    // Names sit on the backdrop, so a cream outline keeps them readable.
    const name = this.add.text(70, 0, ch.name.toUpperCase(), pixel(15, ch.color, { fontStyle: 'bold', stroke: hex(C.panel), strokeThickness: 4 }));
    const body = this.add.text(84, 28, line.text, text(16, C.ink, { wordWrap: { width: CHAT.w - 140, useAdvancedWrap: true } }));
    const bw = Math.max(body.width + 28, 60);
    const bh = body.height + 18;
    const bubble = this.add.graphics();
    bubble.fillStyle(hl ? C.highlight : 0xffffff, 1).fillRoundedRect(70, 19, bw, bh, 10);
    if (hl) bubble.lineStyle(3, C.accent, 1).strokeRoundedRect(70, 19, bw, bh, 10);
    c.add([bubble, face, name, body]);
    this.chat.content.add(c);
    if (hl && this.firstHighlightY === null) this.firstHighlightY = y;
    this.chatY += Math.max(19 + bh, 64) + 10;
    this.chat.setContentHeight(this.chatY);
    if (!instant) {
      c.setAlpha(0);
      c.x = -12;
      this.tweens.add({ targets: c, alpha: 1, x: 0, duration: 180, ease: 'Quad.easeOut' });
    }
  }
}
