import Phaser from 'phaser';
import { C, W, pixel, text, readText } from '../ui/theme.js';
import { panel, button } from '../ui/widgets.js';
import { scrollArea } from '../ui/scroll.js';

const BOX = { x: 60, y: 96, w: W - 120, h: 500 };
const PAD = 28;

/**
 * Credits (bible: Game identity > Audio): every entry of public/credits.json, loaded by BootScene
 * into the registry as 'credits'. Music: title, artist, source, license and credit line; then art.
 * The list scrolls (wheel, drag, arrows, Page Up/Down, Home/End). Back with "← Levels" or Esc.
 */
export default class CreditsScene extends Phaser.Scene {
  constructor() {
    super('Credits');
  }

  create() {
    const credits = this.registry.get('credits') || {};
    const music = Array.isArray(credits.music) ? credits.music : [];
    const art = Array.isArray(credits.art) ? credits.art : [];

    button(this, 80, 36, '← Levels', () => this.scene.start('Menu'), { w: 120, h: 34, size: 15, fill: C.bar });
    this.add.text(W / 2, 36, 'CREDITS', pixel(30, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    this.add.text(W / 2, 66, 'the music and art in this game', pixel(15, C.highlight)).setOrigin(0.5);

    panel(this, BOX.x, BOX.y, BOX.w, BOX.h);
    const area = scrollArea(this, BOX.x + 4, BOX.y + 8, BOX.w - 8, BOX.h - 16);
    const wrap = { wordWrap: { width: BOX.w - PAD * 2 - 8, useAdvancedWrap: true } };
    let y = 12;
    const add = (obj, gap = 6) => {
      area.content.add(obj);
      y += obj.height + gap;
      return obj;
    };
    const heading = (label) => {
      add(this.add.text(PAD, y, label, pixel(20, C.ink, { fontStyle: 'bold' })), 4);
      area.content.add(this.add.graphics().fillStyle(C.accent, 1).fillRect(PAD, y, 60, 3));
      y += 14;
    };
    const line = (label, value) => {
      if (value === null || value === undefined || value === '') return;
      add(this.add.text(PAD + 12, y, `${label}: ${value}`, readText(14, C.inkSoft, wrap)), 3);
    };

    heading(`MUSIC (${music.length})`);
    if (!music.length) {
      add(this.add.text(PAD, y, 'No music yet. Tracks will be credited here once they are added to the game.', readText(15, C.inkSoft, wrap)), 18);
    }
    for (const m of music) {
      add(this.add.text(PAD, y, m.title || m.file || 'Untitled track', readText(16, C.ink, { ...wrap, fontStyle: 'bold' })), 4);
      line('Artist', m.artist);
      line('Source', m.source);
      line('License', m.license);
      add(this.add.text(PAD + 12, y, m.credit_line || '', readText(14, C.ink, { ...wrap, fontStyle: 'italic' })), 16);
    }

    y += 8;
    heading('ART');
    if (!art.length) add(this.add.text(PAD, y, 'No art credits yet.', readText(15, C.inkSoft, wrap)), 18);
    for (const a of art) {
      add(this.add.text(PAD, y, a.what || 'Art', readText(16, C.ink, { ...wrap, fontStyle: 'bold' })), 4);
      line('Artist', a.artist);
      line('Source', a.source);
      line('License', a.license);
      add(this.add.text(PAD + 12, y, a.credit_line || '', readText(14, C.ink, { ...wrap, fontStyle: 'italic' })), 16);
    }
    area.setContentHeight(y + 8);

    const hint = this.add.text(W / 2, BOX.y + BOX.h + 22, '', pixel(13, C.label)).setOrigin(0.5);
    const updateHint = () => hint.setText(area.atBottom() ? '' : '↓ scroll for more');
    area.onScroll(updateHint);
    updateHint();

    const kb = this.input.keyboard;
    if (kb) {
      const page = area.viewHeight - 40;
      kb.on('keydown-ESC', () => this.scene.start('Menu'));
      kb.on('keydown-UP', () => area.scrollBy(-40));
      kb.on('keydown-DOWN', () => area.scrollBy(40));
      kb.on('keydown-PAGE_UP', () => area.scrollBy(-page));
      kb.on('keydown-PAGE_DOWN', () => area.scrollBy(page));
      kb.on('keydown-HOME', () => area.scrollBy(-1e6));
      kb.on('keydown-END', () => area.scrollBy(1e6));
    }
  }
}
