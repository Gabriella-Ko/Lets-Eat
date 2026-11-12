import Phaser from 'phaser';
import { C, W, H, CHARACTERS, hex, pixel, text, readText, applyPalette } from '../ui/theme.js';
import { panel, button, portrait, star } from '../ui/widgets.js';
import { OPTIONS, getSettings, setSetting, highContrast } from '../ui/settings.js';

const ROWS = [
  { key: 'textSize', title: 'Text size', about: 'Makes the chat, reviews, Notebook and reactions easier to read.' },
  { key: 'chatPace', title: 'Chat pace', about: 'How long each "typing…" bubble lasts before the next message.' },
  { key: 'contrast', title: 'High contrast', about: 'Black text, lighter panels, stronger highlights and a faded chat backdrop.' },
  { key: 'motion', title: 'Reduce motion', about: 'No sliding, popping, pulsing or spinning: things simply appear.' },
];
const LEFT = { x: 40, y: 92, w: 540 };
const PREVIEW = { x: 604, y: 92, w: 316, h: 440 };
const ROW_H = 104;

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
    this.add.text(LEFT.x, H - 34, '↑ ↓ choose a setting   ·   ← → change it   ·   Esc: back', text(13, C.label));
    this.drawFocus();

    const kb = this.input.keyboard;
    kb.on('keydown-UP', () => { this.focus = (this.focus + ROWS.length - 1) % ROWS.length; this.drawFocus(); });
    kb.on('keydown-DOWN', () => { this.focus = (this.focus + 1) % ROWS.length; this.drawFocus(); });
    kb.on('keydown-LEFT', () => this.step(-1));
    kb.on('keydown-RIGHT', () => this.step(1));
    kb.on('keydown-ESC', () => this.scene.start('Menu'));
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
