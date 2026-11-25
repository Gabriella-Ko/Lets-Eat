import Phaser from 'phaser';
import { C, W, H, pixel } from '../ui/theme.js';
import { button, keyHint } from '../ui/widgets.js';
import { tween } from '../ui/motion.js';
import { play as playSfx } from '../ui/sfx.js';
import { goScene } from '../ui/sceneSwitch.js';
import { onKey } from '../ui/keys.js';

const ART_KEY = 'title_screen'; // assets/art/title_screen.jpg via tools/slice_portraits.py (manifest group 'ui')
const PLATE_H = 170; // dark fade over the sky; the friends' faces in the lower half stay clear

/**
 * Title screen (bible: Title screen, Gabriella 2026-11-22): shown once after Boot, before the city map (Menu).
 * The title_screen_v1 picture covers the 960x640 screen (scaled to cover, sides cropped evenly), with
 * "LET'S EAT!" and the catch phrase near the top on a dark translucent fade. Without the picture, the title
 * sits on the plain background. "Start", Enter, Space or a click anywhere opens the Menu.
 */
export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    // Phaser reuses this object; clear the flag so Start works again after coming back from the Menu.
    this.leaving = false;
    const hasArt = this.textures.exists(ART_KEY) && this.textures.get(ART_KEY).key !== '__MISSING';
    if (hasArt) {
      const img = this.add.image(W / 2, H / 2, ART_KEY);
      img.setScale(Math.max(W / img.width, H / img.height)); // cover; the camera crops the overflow evenly
      // Dark fade from the top edge, fully clear by PLATE_H, so the title reads over the sky.
      const fade = this.add.graphics();
      fade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.6, 0.6, 0, 0);
      fade.fillRect(0, 0, W, PLATE_H);
    }

    const title = this.add.text(W / 2, 62, "LET'S EAT!", pixel(64, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    // ‌ stops the font's "fi" ligature (same line as the Menu's old title)
    const tagline = this.add.text(W / 2, 112, 'read the chat · f‌ind the spot · feed your friends', pixel(18, C.highlight)).setOrigin(0.5);
    if (hasArt) for (const t of [title, tagline]) t.setShadow(2, 3, '#000000', 4, false, true);

    const start = button(this, W / 2, H - 56, 'Start', () => this.go(), { w: 180, h: 46, size: 20 });

    // On a dark plate so it reads at 4.5:1 over the busy art (bible: Bug hunt run 2, NP-03).
    const keys = keyHint(this, 'enter: start  ·  m: music', { y: H - 14, plate: true });

    for (const o of [title, tagline, start, keys, keys.plate]) o.setAlpha(0);
    tween(this, { targets: [title, tagline], alpha: 1, duration: 500, ease: 'Sine.easeOut' });
    tween(this, { targets: start, alpha: 1, delay: 300, duration: 400, ease: 'Sine.easeOut' });
    tween(this, { targets: keys, alpha: 1, delay: 300, duration: 400, ease: 'Sine.easeOut' });

    this.input.on('pointerdown', () => this.go());
    onKey(this, 'ENTER', () => this.go());
    onKey(this, 'SPACE', () => this.go());
  }

  go() {
    if (this.leaving) return;
    this.leaving = true;
    playSfx(this, 'click'); // Enter, Space or a click anywhere (the Start button's own click is merged into it)
    goScene(this, 'Menu');
  }
}
