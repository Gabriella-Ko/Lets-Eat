import Phaser from 'phaser';
import { C, W, H, pixel, text, readText } from '../ui/theme.js';
import { panel, button } from '../ui/widgets.js';
import { scrollArea } from '../ui/scroll.js';
import { reduceMotion } from '../ui/settings.js';

const ART_KEY = 'title_screen'; // same picture as TitleScene (manifest group 'ui')
const SHADE_ALPHA = 0.35; // dark see-through layer over the picture
const HEADER_FADE_H = 110; // extra dark fade behind the header
const PANEL_ALPHA = 0.55; // credits panel lets the picture show through
const TEXT_HALO_PX = 3; // soft light outline on the panel text, so it reads over the picture
const BOX = { x: 60, y: 96, w: W - 120, h: 500 };
const PAD = 28;
const ROLL_PX_PER_S = 24; // slow, readable roll
const START_DELAY_MS = 1500;
const USER_PAUSE_MS = 5000;
const END_HOLD_MS = 4000;

/**
 * Credits (bible: Game identity > Audio): every entry of public/credits.json, loaded by BootScene
 * into the registry as 'credits'. Music: title, artist, source, license and credit line; then art.
 * The list rolls up slowly by itself (not with Reduce motion); scrolling (wheel, drag, arrows, Page Up/Down,
 * Home/End) pauses the roll for a few seconds. Back with "← Levels" or Esc.
 */
export default class CreditsScene extends Phaser.Scene {
  constructor() {
    super('Credits');
  }

  create() {
    const credits = this.registry.get('credits') || {};
    const music = Array.isArray(credits.music) ? credits.music : [];
    const art = Array.isArray(credits.art) ? credits.art : [];

    // The title screen picture behind everything (Gabriella, 2026-11-23), scaled to cover and cropped evenly,
    // under a dark see-through layer plus a darker fade at the top so the header reads. No picture: plain background.
    const hasArt = this.textures.exists(ART_KEY) && this.textures.get(ART_KEY).key !== '__MISSING';
    if (hasArt) {
      const img = this.add.image(W / 2, H / 2, ART_KEY);
      img.setScale(Math.max(W / img.width, H / img.height));
      const shade = this.add.graphics();
      shade.fillStyle(0x000000, SHADE_ALPHA).fillRect(0, 0, W, H);
      shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0.55, 0, 0);
      shade.fillRect(0, 0, W, HEADER_FADE_H);
    }

    button(this, 80, 36, '← Levels', () => this.scene.start('Menu'), { w: 120, h: 34, size: 15, fill: C.bar });
    const title = this.add.text(W / 2, 36, 'CREDITS', pixel(30, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    const sub = this.add.text(W / 2, 66, 'the music and art in this game', pixel(15, C.highlight)).setOrigin(0.5);
    if (hasArt) for (const t of [title, sub]) t.setShadow(2, 3, '#000000', 4, false, true);

    if (hasArt) {
      // Translucent panel, so the picture shows through around and behind the list.
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.18).fillRoundedRect(BOX.x + 3, BOX.y + 5, BOX.w, BOX.h, 16);
      g.fillStyle(C.panel, PANEL_ALPHA).fillRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 16);
    } else {
      panel(this, BOX.x, BOX.y, BOX.w, BOX.h);
    }
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

    // With the picture behind a see-through panel, give the credit text a soft outline in the panel's colour
    // (read now, so High contrast applies) instead of making the panel more solid again.
    if (hasArt) {
      const p = Phaser.Display.Color.IntegerToColor(C.panel);
      const halo = `rgba(${p.red},${p.green},${p.blue},0.75)`;
      for (const obj of area.content.list) if (obj instanceof Phaser.GameObjects.Text) obj.setStroke(halo, TEXT_HALO_PX);
    }

    // Credits roll up slowly by themselves, like film credits (not with Reduce motion). Scrolling yourself
    // pauses the roll for a few seconds; at the end it waits, then starts again from the top.
    this.area = area;
    this.atEndSince = null; // the scene object is reused between visits
    this.rolling = !reduceMotion() && !area.atBottom();
    this.holdUntil = this.time.now + START_DELAY_MS;
    const hint = this.add.text(W / 2, BOX.y + BOX.h + 22, '', pixel(13, C.label)).setOrigin(0.5);
    if (hasArt) hint.setShadow(1, 2, '#000000', 3, false, true);
    const updateHint = () => hint.setText(this.rolling ? 'scroll to read at your own pace' : area.atBottom() ? '' : '↓ scroll for more');
    area.onScroll((f, byUser) => {
      if (byUser) this.holdUntil = this.time.now + USER_PAUSE_MS;
      updateHint();
    });
    updateHint();

    const kb = this.input.keyboard;
    if (kb) {
      const page = area.viewHeight - 40;
      const back = () => { if (!this.registry.get('hudPanelOpen')) this.scene.start('Menu'); };
      kb.on('keydown-ESC', back);
      kb.on('keydown-BACKSPACE', back);
      kb.on('keydown-UP', () => area.scrollBy(-40));
      kb.on('keydown-DOWN', () => area.scrollBy(40));
      kb.on('keydown-PAGE_UP', () => area.scrollBy(-page));
      kb.on('keydown-PAGE_DOWN', () => area.scrollBy(page));
      kb.on('keydown-HOME', () => area.scrollBy(-1e6));
      kb.on('keydown-END', () => area.scrollBy(1e6));
    }
  }

  update(time, delta) {
    if (!this.rolling || time < this.holdUntil) return;
    if (this.area.atBottom()) {
      // Reached the end: hold, then roll again from the top.
      if (this.atEndSince == null) this.atEndSince = time;
      if (time - this.atEndSince >= END_HOLD_MS) {
        this.atEndSince = null;
        this.area.toTop();
        this.holdUntil = time + START_DELAY_MS;
      }
      return;
    }
    this.atEndSince = null;
    this.area.drift((ROLL_PX_PER_S * delta) / 1000);
  }
}
