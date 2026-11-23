import Phaser from 'phaser';
import { C, W, H, CHARACTERS, hex, pixel, text, readText, applyPalette } from '../ui/theme.js';
import { panel, button, portrait, star, resetProgress } from '../ui/widgets.js';
import { tween } from '../ui/motion.js';
import { OPTIONS, getSettings, setSetting, highContrast, reduceMotion, chatPaceMs } from '../ui/settings.js';
import { setEnabled as setMusicEnabled } from '../ui/music.js';

const ROWS = [
  { key: 'textSize', title: 'Text size', about: 'Makes the chat, reviews, Notebook and reactions easier to read.' },
  { key: 'chatPace', title: 'Chat pace', about: 'How long each "typing…" bubble lasts before the next message.' },
  { key: 'contrast', title: 'High contrast', about: 'Black text, lighter panels, stronger highlights and a faded chat backdrop.' },
  { key: 'motion', title: 'Animations', about: 'Sliding, popping, page turns and the badge sticking on. Off: things simply appear.' },
  { key: 'music', title: 'Music', about: 'Background music. Plays after your first click or key press.' },
];
const LEFT = { x: 40, y: 88, w: 540 };
const PREVIEW = { x: 604, y: 88, w: 316, h: 440 };
const ROW_H = 100; // five rows fill the column down to just above the key hint
const ROW_GAP = 10; // space between row panels
const PREVIEW_CHAT_H = 200; // height of the preview's chat area, above the review and stars
// The example exchange the Chat pace preview plays (Gabriella, 2026-11-23).
const PREVIEW_LINES = [
  { speaker: 'liam', mood: 'HUNGRY', text: 'starving. anyone up for noodles?' },
  { speaker: 'mina', mood: 'HAPPY', text: "only if there's something veggie!" },
  { speaker: 'cyrus', mood: 'NEUTRAL', text: 'and no peanuts please' },
];
const PREVIEW_HOLD_MS = 2000; // pause after the last line before the exchange starts again

/**
 * Accessibility options (saved per browser, see ui/settings.js). Mouse or keyboard:
 * up/down picks a setting, left/right changes it, Esc goes back. A change applies at once:
 * the palette is reapplied and this screen redraws, so the preview shows the result.
 * data: { focus?: row index to keep the keyboard focus on after a redraw }
 */
export default class OptionsScene extends Phaser.Scene {
  constructor() {
    super('Options');
  }

  init(data) {
    this.focus = data?.focus ?? 0;
  }

  create() {
    this.cameras.main.setBackgroundColor(C.bg);
    button(this, 90, 36, '← Levels', () => this.scene.start('Menu'), { w: 140, h: 34, size: 15, fill: C.bar });
    this.add.text(W / 2, 36, 'OPTIONS', pixel(30, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    this.add.text(W / 2, 66, 'changes apply straight away and are saved on this device', pixel(14, C.highlight)).setOrigin(0.5);

    const s = getSettings();
    this.rowFrames = ROWS.map((row, i) => this.drawRow(row, i, s[row.key]));
    this.drawPreview();
    this.previewMotion();
    this.previewChatPace();
    this.add.text(LEFT.x + 24, H - 34, '↑ ↓ choose a setting   ·   ← → change it   ·   H: how to play   ·   Esc: back', text(13, C.label));
    button(this, PREVIEW.x + PREVIEW.w / 2, H - 70, 'How to play', () => this.howToPlay(), { w: PREVIEW.w, h: 40, size: 16 });
    button(this, W - 110, 36, 'Reset progress', () => this.confirmReset(), { w: 180, h: 34, size: 14, fill: C.bad });
    this.drawFocus();

    // While How to play or the reset check is up, its own keys act and this screen's keys wait.
    this.helpOpen = false;
    const kb = this.input.keyboard;
    const when = (fn) => () => { if (!this.helpOpen) fn(); };
    kb.on('keydown-UP', when(() => { this.focus = (this.focus + ROWS.length - 1) % ROWS.length; this.drawFocus(); }));
    kb.on('keydown-DOWN', when(() => { this.focus = (this.focus + 1) % ROWS.length; this.drawFocus(); }));
    kb.on('keydown-LEFT', when(() => this.step(-1)));
    kb.on('keydown-RIGHT', when(() => this.step(1)));
    kb.on('keydown-H', when(() => this.howToPlay()));
    const back = when(() => { if (!this.registry.get('hudPanelOpen')) this.scene.start('Menu'); });
    kb.on('keydown-ESC', back);
    kb.on('keydown-BACKSPACE', back);
  }

  /**
   * Show the How to play steps again, over a real level screen (level 1's chat with its first messages),
   * since the steps point at parts of that screen. Closing them comes back here.
   * (They also open on their own the first time level 1 starts.)
   */
  howToPlay() {
    if (this.helpOpen) return;
    const first = this.registry.get('levels')?.[0];
    if (!first) return;
    this.scene.start('Chat', { levelId: first.id, howToPlay: true, returnTo: 'Options' });
  }

  /**
   * Reset progress, after a check drawn in the game (no browser confirm()).
   * Reset: clears stars, Scrapbook pages, friends and "been here" history and the seen intros (resetProgress), then back to the menu.
   * Cancel (or Esc): closes the check and changes nothing. Enter does not reset, so it can't happen by accident.
   */
  confirmReset() {
    if (this.helpOpen) return;
    this.helpOpen = true;
    const layer = this.add.container(0, 0).setDepth(100);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setInteractive(); // blocks clicks below
    const bw = 460, bh = 230, bx = (W - bw) / 2, by = (H - bh) / 2;
    const box = this.add.container(0, 0);
    const card = panel(this, bx, by, bw, bh);
    const title = this.add.text(W / 2, by + 30, 'RESET PROGRESS?', pixel(22, C.ink, { fontStyle: 'bold' })).setOrigin(0.5);
    const body = this.add.text(W / 2, by + 62, 'Clears your stars (levels lock again), Scrapbook pages, friends met and the places you have been, and shows How to play and the chapter cards again. Your options and music stay as they are.',
      readText(15, C.inkSoft, { align: 'center', wordWrap: { width: bw - 60 } })).setOrigin(0.5, 0);
    const close = () => {
      if (this.registry.get('hudPanelOpen')) return; // that Esc belongs to the volume panel
      this.input.keyboard.off('keydown-ESC', close);
      layer.destroy();
      this.helpOpen = false;
    };
    const reset = () => {
      this.input.keyboard.off('keydown-ESC', close);
      resetProgress();
      this.scene.start('Menu');
    };
    const cancelBtn = button(this, W / 2 - 100, by + bh - 40, 'Cancel', close, { w: 160, h: 40, size: 16, fill: C.bar });
    const resetBtn = button(this, W / 2 + 100, by + bh - 40, 'Reset', reset, { w: 160, h: 40, size: 16, fill: C.bad });
    box.add([card, title, body, cancelBtn, resetBtn]);
    layer.add([shade, box]);
    this.input.keyboard.on('keydown-ESC', close);
    shade.setAlpha(0);
    box.setAlpha(0).setY(16);
    tween(this, { targets: shade, alpha: 1, duration: 150 });
    tween(this, { targets: box, alpha: 1, y: 0, duration: 200, ease: 'Quad.easeOut' });
  }

  /** Move the focused setting one choice left or right. */
  step(dir) {
    const row = ROWS[this.focus];
    const opts = OPTIONS[row.key];
    const i = opts.findIndex((o) => o.id === getSettings()[row.key]);
    const next = opts[Math.min(opts.length - 1, Math.max(0, i + dir))];
    if (next && next.id !== opts[i]?.id) this.choose(row.key, next.id);
  }

  choose(key, id) {
    setSetting(key, id);
    if (key === 'music') setMusicEnabled(id === 'on');
    applyPalette();
    this.scene.restart({ focus: this.focus });
  }

  drawRow(row, i, current) {
    const y = LEFT.y + i * ROW_H;
    const frame = this.add.graphics();
    panel(this, LEFT.x, y, LEFT.w, ROW_H - ROW_GAP, C.panel, 12);
    this.add.text(LEFT.x + 20, y + 12, row.title.toUpperCase(), pixel(17, C.ink, { fontStyle: 'bold' }));
    this.add.text(LEFT.x + 20, y + 38, row.about, text(13, C.inkSoft, { wordWrap: { width: LEFT.w - 40 } }));
    // The choice buttons sit at the right of the title line, the description underneath.
    const h = 26;
    const py = y + 9;
    const labels = OPTIONS[row.key].map((o) => this.add.text(0, 0, o.label, pixel(14, o.id === current ? C.panel : C.ink, { fontStyle: 'bold' })));
    let x = LEFT.x + LEFT.w - 16 - labels.reduce((sum, t) => sum + t.width + 26 + 8, -8);
    for (const [k, o] of OPTIONS[row.key].entries()) {
      const on = o.id === current;
      const t = labels[k];
      const w = t.width + 26;
      const bx = x; // this button's own x: the loop moves `x` on, and hover redraws happen later
      const g = this.add.graphics();
      const draw = (hover) => {
        g.clear();
        g.fillStyle(on ? C.accent : hover ? C.starred : 0xffffff, 1).fillRoundedRect(bx, py, w, h, 13);
        g.lineStyle(on ? 2 : 1, on ? C.accentDark : C.inkSoft, 1).strokeRoundedRect(bx, py, w, h, 13);
      };
      draw(false);
      t.setPosition(bx + 13, py + (h - t.height) / 2).setDepth(1);
      const z = this.add.zone(bx + w / 2, py + h / 2, w, h).setInteractive({ useHandCursor: true });
      z.optionId = `${row.key}:${o.id}`;
      z.on('pointerover', () => draw(true));
      z.on('pointerout', () => draw(false));
      z.on('pointerdown', () => { this.focus = i; if (!on) this.choose(row.key, o.id); else this.drawFocus(); });
      x += w + 8;
    }
    return { frame, y };
  }

  /** A clear ring around the setting the arrow keys act on. */
  drawFocus() {
    this.rowFrames.forEach(({ frame, y }, i) => {
      frame.clear();
      if (i === this.focus) frame.lineStyle(3, C.highlight, 1).strokeRoundedRect(LEFT.x - 5, y - 5, LEFT.w + 10, ROW_H - ROW_GAP + 10, 15);
    });
  }

  drawPreview() {
    const { x, y, w, h } = PREVIEW;
    panel(this, x, y, w, h);
    this.add.text(x + 18, y + 14, 'PREVIEW', pixel(16, C.ink, { fontStyle: 'bold' }));
    // the chat area: previewChatPace() plays an example exchange here, clipped to this box
    const chatTop = y + 42;
    this.previewChat = this.add.container(x, chatTop).setDepth(1);
    const clip = this.make.graphics({ add: false }).fillStyle(0xffffff, 1).fillRect(x, chatTop, w, PREVIEW_CHAT_H);
    this.previewChat.setMask(clip.createGeometryMask());
    let cy = chatTop + PREVIEW_CHAT_H + 8;
    // a review
    this.add.text(x + 18, cy, 'REVIEWS', pixel(14, C.ink, { fontStyle: 'bold' }));
    cy += 22;
    const rv = this.add.text(x + 30, cy + 9, '“Big bowls, quick service and a sunny patio. Under ten bucks.”', readText(14, C.ink, { wordWrap: { width: w - 60, useAdvancedWrap: true }, lineSpacing: 2 })).setDepth(1);
    this.add.graphics().fillStyle(0xffffff, 1).fillRoundedRect(x + 18, cy, w - 36, rv.height + 18, 8);
    cy += rv.height + 34;
    // stars, on the dark background the result screen shows them on: filled, and empty with an outline
    const sg = this.add.graphics();
    sg.fillStyle(C.bg, 1).fillRoundedRect(x + 18, cy - 6, w - 36, 44, 10);
    // each star is its own graphics, drawn around (0, 0), so previewMotion() can scale it from its centre
    this.previewStars = [0, 1, 2].map((i) => {
      const g = this.add.graphics().setPosition(x + 42 + i * 40, cy + 16);
      star(g, 0, 0, 15, i < 2);
      return g;
    });
    this.add.text(x + 42 + 3 * 40 - 4, cy + 16, '2 of 3 stars', pixel(14, C.label)).setOrigin(0, 0.5);
  }

  /**
   * Plays an example exchange in the PREVIEW panel's chat area, the way the chat does, at the chosen
   * Chat pace: each speaker's "typing" row lasts chatPaceMs(), then their message replaces it, then the
   * next speaker types. After the last line it holds PREVIEW_HOLD_MS, clears and starts again, looping
   * while the screen is open. A change of setting restarts the screen, so a new pace applies at once.
   * With Animations off the timing is the same, but rows simply appear (tween() jumps to the end).
   * Its timer is removed when the screen shuts down.
   */
  previewChatPace() {
    const layer = this.previewChat;
    if (!layer) return;
    const w = PREVIEW.w;
    let rowY = 0;
    let typing = null;
    const clearTyping = () => {
      if (!typing) return;
      this.tweens.killTweensOf([typing.c, ...typing.dots]);
      typing.c.destroy();
      typing = null;
    };
    // keep the newest row in view, like the chat scrolling to the bottom
    const follow = (bottom) => layer.setY(PREVIEW.y + 42 - Math.max(0, bottom - PREVIEW_CHAT_H));
    const showTyping = (speaker) => {
      const ch = CHARACTERS[speaker] || { name: speaker, color: C.inkSoft };
      const c = this.add.container(0, rowY);
      const face = portrait(this, 18 + 18, 20, 36, speaker, 'NEUTRAL');
      const name = this.add.text(62, 0, `${ch.name.toUpperCase()} is typing`, pixel(13, ch.color, { fontStyle: 'bold', stroke: hex(C.panel), strokeThickness: 3 }));
      const bubble = this.add.graphics().fillStyle(0xffffff, 1).fillRoundedRect(62, 17, 54, 26, 9);
      const dots = [0, 1, 2].map((i) => this.add.circle(77 + i * 12, 30, 3.5, C.inkSoft).setAlpha(0.3));
      c.add([bubble, face, name, ...dots]);
      layer.add(c);
      c.setAlpha(0);
      tween(this, { targets: c, alpha: 0.8, duration: 150 });
      dots.forEach((d, i) => tween(this, { targets: d, alpha: 1, y: 27, duration: 250, delay: i * 100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
      typing = { c, dots };
      follow(rowY + 46);
    };
    const showLine = (line) => {
      const ch = CHARACTERS[line.speaker] || { name: line.speaker, color: C.inkSoft };
      const c = this.add.container(0, rowY);
      const face = portrait(this, 18 + 18, 20, 36, line.speaker, line.mood);
      const name = this.add.text(62, 0, ch.name.toUpperCase(), pixel(13, ch.color, { fontStyle: 'bold', stroke: hex(C.panel), strokeThickness: 3 }));
      const body = this.add.text(73, 23, line.text, readText(13, C.ink, { wordWrap: { width: w - 62 - 18 - 22, useAdvancedWrap: true } }));
      const bw = body.width + 22, bh = body.height + 12;
      const bubble = this.add.graphics().fillStyle(0xffffff, 1).fillRoundedRect(62, 17, bw, bh, 9)
        .lineStyle(highContrast() ? 1 : 0, C.inkSoft, 1).strokeRoundedRect(62, 17, bw, bh, 9);
      c.add([bubble, face, name, body]);
      layer.add(c);
      c.setPosition(-16, rowY).setAlpha(0);
      tween(this, { targets: c, x: 0, alpha: 1, duration: 260, ease: 'Quad.easeOut' });
      rowY += Math.max(42, 17 + bh) + 8;
      follow(rowY);
    };
    const step = (i) => {
      if (i >= PREVIEW_LINES.length) {
        this.chatPreviewTimer = this.time.delayedCall(PREVIEW_HOLD_MS, () => {
          this.tweens.killTweensOf(layer.list);
          layer.removeAll(true);
          rowY = 0;
          follow(0);
          step(0);
        });
        return;
      }
      showTyping(PREVIEW_LINES[i].speaker);
      this.chatPreviewTimer = this.time.delayedCall(chatPaceMs(), () => {
        clearTyping();
        showLine(PREVIEW_LINES[i]);
        step(i + 1);
      });
    };
    step(0);
    this.events.once('shutdown', () => {
      this.chatPreviewTimer?.remove(false);
      this.chatPreviewTimer = null;
    });
  }

  /**
   * Shows what the Animations option does, in the PREVIEW panel. On: the three stars pop in one after
   * another (scale 0 to 1, Back.easeOut, like the Outcome screen), again every 2.6 s (the chat lines
   * slide in through previewChatPace()). Off: the stars are shown still, all at once. A change of setting
   * restarts this screen, which stops the loop and runs this again with the new value.
   */
  previewMotion() {
    const stars = this.previewStars || [];
    if (reduceMotion()) {
      stars.forEach((s) => s.setScale(1));
      return;
    }
    const play = () => {
      stars.forEach((s, i) => {
        s.setScale(0);
        tween(this, { targets: s, scale: 1, duration: 320, delay: 450 + i * 220, ease: 'Back.easeOut' });
      });
    };
    play();
    this.time.addEvent({ delay: 2600, loop: true, callback: play });
  }
}
