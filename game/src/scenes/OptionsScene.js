import Phaser from 'phaser';
import { C, W, H, CHARACTERS, hex, pixel, text, readText, applyPalette } from '../ui/theme.js';
import { panel, button, portrait, star, resetProgress } from '../ui/widgets.js';
import { tween } from '../ui/motion.js';
import { OPTIONS, getSettings, setSetting, highContrast } from '../ui/settings.js';
import { setEnabled as setMusicEnabled } from '../ui/music.js';

const ROWS = [
  { key: 'textSize', title: 'Text size', about: 'Makes the chat, reviews, Notebook and reactions easier to read.' },
  { key: 'chatPace', title: 'Chat pace', about: 'How long each "typing…" bubble lasts before the next message.' },
  { key: 'contrast', title: 'High contrast', about: 'Black text, lighter panels, stronger highlights and a faded chat backdrop.' },
  { key: 'motion', title: 'Reduce motion', about: 'No sliding, popping, pulsing or spinning: things simply appear.' },
  { key: 'music', title: 'Music', about: 'Background music. Plays after your first click or key press.' },
];
const LEFT = { x: 40, y: 88, w: 540 };
const PREVIEW = { x: 604, y: 88, w: 316, h: 440 };
const ROW_H = 98; // five rows still clear the key hint at the bottom

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
    button(this, 80, 36, '← Levels', () => this.scene.start('Menu'), { w: 120, h: 34, size: 15, fill: C.bar });
    this.add.text(W / 2, 36, 'OPTIONS', pixel(30, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    this.add.text(W / 2, 66, 'changes apply straight away and are saved on this device', pixel(14, C.highlight)).setOrigin(0.5);

    const s = getSettings();
    this.rowFrames = ROWS.map((row, i) => this.drawRow(row, i, s[row.key]));
    this.drawPreview();
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
    kb.on('keydown-ESC', when(() => this.scene.start('Menu')));
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
    panel(this, LEFT.x, y, LEFT.w, ROW_H - 14, C.panel, 12);
    this.add.text(LEFT.x + 20, y + 14, row.title.toUpperCase(), pixel(17, C.ink, { fontStyle: 'bold' }));
    const about = this.add.text(LEFT.x + 20, y + 38, row.about, text(13, C.inkSoft, { wordWrap: { width: LEFT.w - 40 } }));
    let x = LEFT.x + 20;
    // Buttons sit under the description, however many lines it takes.
    const py = Math.max(about.y + about.height + 6, y + ROW_H - 14 - 28 - 10);
    for (const o of OPTIONS[row.key]) {
      const on = o.id === current;
      const t = this.add.text(0, 0, o.label, pixel(14, on ? C.panel : C.ink, { fontStyle: 'bold' }));
      const w = t.width + 26, h = 28;
      const bx = x; // this button's own x: the loop moves `x` on, and hover redraws happen later
      const g = this.add.graphics();
      const draw = (hover) => {
        g.clear();
        g.fillStyle(on ? C.accent : hover ? C.starred : 0xffffff, 1).fillRoundedRect(bx, py, w, h, 14);
        g.lineStyle(on ? 2 : 1, on ? C.accentDark : C.inkSoft, 1).strokeRoundedRect(bx, py, w, h, 14);
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
      if (i === this.focus) frame.lineStyle(3, C.highlight, 1).strokeRoundedRect(LEFT.x - 5, y - 5, LEFT.w + 10, ROW_H - 4, 15);
    });
  }

  drawPreview() {
    const { x, y, w, h } = PREVIEW;
    panel(this, x, y, w, h);
    this.add.text(x + 18, y + 14, 'PREVIEW', pixel(16, C.ink, { fontStyle: 'bold' }));
    // a chat message, as the chat draws it
    const ch = CHARACTERS.liam;
    let cy = y + 48;
    portrait(this, x + 18 + 26, cy + 30, 52, 'liam', 'HUNGRY');
    this.add.text(x + 82, cy, ch.name.toUpperCase(), pixel(15, ch.color, { fontStyle: 'bold', stroke: hex(C.panel), strokeThickness: 4 }));
    const body = this.add.text(x + 96, cy + 28, 'starving. anyone up for noodles?', readText(16, C.ink, { wordWrap: { width: w - 120, useAdvancedWrap: true } })).setDepth(1);
    this.add.graphics().fillStyle(0xffffff, 1).fillRoundedRect(x + 82, cy + 19, body.width + 28, body.height + 18, 10)
      .lineStyle(highContrast() ? 1 : 0, C.inkSoft, 1).strokeRoundedRect(x + 82, cy + 19, body.width + 28, body.height + 18, 10);
    cy += Math.max(64, body.height + 46) + 14;
    // a review
    this.add.text(x + 18, cy, 'REVIEWS', pixel(14, C.ink, { fontStyle: 'bold' }));
    cy += 22;
    const rv = this.add.text(x + 30, cy + 9, '“Big bowls, quick service and a sunny patio. Under ten bucks.”', readText(14, C.ink, { wordWrap: { width: w - 60, useAdvancedWrap: true }, lineSpacing: 2 })).setDepth(1);
    this.add.graphics().fillStyle(0xffffff, 1).fillRoundedRect(x + 18, cy, w - 36, rv.height + 18, 8);
    cy += rv.height + 34;
    // stars, on the dark background the result screen shows them on: filled, and empty with an outline
    const sg = this.add.graphics();
    sg.fillStyle(C.bg, 1).fillRoundedRect(x + 18, cy - 6, w - 36, 44, 10);
    for (let i = 0; i < 3; i++) star(sg, x + 42 + i * 40, cy + 16, 15, i < 2);
    this.add.text(x + 42 + 3 * 40 - 4, cy + 16, '2 of 3 stars', pixel(14, C.label)).setOrigin(0, 0.5);
  }
}
