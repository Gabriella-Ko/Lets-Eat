import Phaser from 'phaser';
import { C, H, pixel, text } from '../ui/theme.js';
import { start as startMusic, getVolume, setVolume, isEnabled, setEnabled, onVolume } from '../ui/music.js';
import { setSetting } from '../ui/settings.js';

const ICON = { x: 26, y: H - 22, r: 14 };
const PANEL = { x: 10, y: H - 108, w: 236, h: 72 };
const TRACK = { x: PANEL.x + 16, y: PANEL.y + 48, w: 150 };

/** Muted: a bold slash right across the round speaker button, top-left edge to bottom-right edge, over the speaker. */
function drawMutedSlash(g) {
  const d = ICON.r * Math.SQRT1_2; // the button's edge at 45 degrees
  g.lineStyle(3, 0xffffff, 1).lineBetween(ICON.x - d, ICON.y - d, ICON.x + d, ICON.y + d);
}

/**
 * Always-on layer above every screen (launched by BootScene, kept on top). Holds the music volume control:
 * a speaker button bottom left that opens a small panel with a volume slider and Music on/off. It's also the
 * host the music player loads tracks through, since this scene never stops. M toggles the panel.
 */
export default class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud');
  }

  create() {
    startMusic(this); // waits for the player's first click or key press
    this.open = false;

    this.icon = this.add.graphics();
    const iconZone = this.add.zone(ICON.x, ICON.y, ICON.r * 2 + 6, ICON.r * 2 + 6).setInteractive({ useHandCursor: true });
    iconZone.hudControl = 'music-button';
    iconZone.on('pointerdown', () => this.setOpen(!this.open));

    // Panel: MUSIC label, slider, percentage, On/Off.
    this.panel = this.add.container(0, 0).setVisible(false);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.25).fillRoundedRect(PANEL.x + 2, PANEL.y + 4, PANEL.w, PANEL.h, 10);
    bg.fillStyle(C.panel, 1).fillRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 10);
    bg.lineStyle(2, C.bar, 1).strokeRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 10);
    const label = this.add.text(PANEL.x + 16, PANEL.y + 12, 'MUSIC VOLUME', pixel(13, C.ink, { fontStyle: 'bold' }));
    this.pct = this.add.text(TRACK.x + TRACK.w + 14, TRACK.y, '', text(13, C.ink)).setOrigin(0, 0.5);
    this.slider = this.add.graphics();
    const trackZone = this.add.zone(TRACK.x + TRACK.w / 2, TRACK.y, TRACK.w + 20, 28).setInteractive({ useHandCursor: true });
    trackZone.hudControl = 'volume-slider';
    const fromPointer = (p) => setVolume((p.x - TRACK.x) / TRACK.w);
    trackZone.on('pointerdown', (p) => { this.dragging = true; fromPointer(p); });
    this.input.on('pointermove', (p) => this.dragging && p.isDown && fromPointer(p));
    this.input.on('pointerup', () => (this.dragging = false));

    this.toggle = this.add.text(PANEL.x + PANEL.w - 16, PANEL.y + 12, '', pixel(12, C.panel, { fontStyle: 'bold' })).setOrigin(1, 0);
    this.toggleBg = this.add.graphics();
    const toggleZone = this.add.zone(PANEL.x + PANEL.w - 36, PANEL.y + 20, 52, 24).setInteractive({ useHandCursor: true });
    toggleZone.hudControl = 'music-toggle';
    toggleZone.on('pointerdown', () => {
      const on = !isEnabled();
      setEnabled(on);
      setSetting('music', on ? 'on' : 'off'); // keep the Options screen's Music row in step
    });
    this.panel.add([bg, label, this.pct, this.slider, trackZone, this.toggleBg, this.toggle, toggleZone]);

    // Click anywhere else closes the panel.
    this.input.on('pointerdown', (p, over) => {
      if (this.open && !over.some((o) => o.hudControl)) this.setOpen(false);
    });
    this.input.keyboard?.on('keydown-M', () => this.setOpen(!this.open));

    onVolume(() => this.draw());
    this.draw();
  }

  setOpen(open) {
    this.open = open;
    this.panel.setVisible(open);
    this.draw();
  }

  draw() {
    if (!this.icon?.active) return;
    const on = isEnabled();
    const v = getVolume();
    const silent = !on || v === 0;
    // Speaker button: a round badge with a speaker, sound waves by volume, or a red slash across it when off or at 0%.
    const g = this.icon.clear();
    g.fillStyle(this.open ? C.accent : C.bar, 0.95).fillCircle(ICON.x, ICON.y, ICON.r);
    g.lineStyle(2, C.label, 1).strokeCircle(ICON.x, ICON.y, ICON.r);
    g.fillStyle(C.label, 1).fillRect(ICON.x - 8, ICON.y - 3, 4, 6);
    g.fillTriangle(ICON.x - 5, ICON.y - 3, ICON.x + 1, ICON.y - 8, ICON.x + 1, ICON.y + 8);
    g.fillTriangle(ICON.x - 5, ICON.y - 3, ICON.x + 1, ICON.y + 8, ICON.x - 5, ICON.y + 3);
    g.lineStyle(2, C.label, 1);
    if (silent) drawMutedSlash(g);
    else {
      g.beginPath().arc(ICON.x + 2, ICON.y, 4, -0.9, 0.9).strokePath();
      if (v > 0.4) g.beginPath().arc(ICON.x + 2, ICON.y, 8, -0.9, 0.9).strokePath();
    }
    if (!this.panel?.visible) return;
    // Slider.
    const s = this.slider.clear();
    s.fillStyle(C.panelDark, 1).fillRoundedRect(TRACK.x, TRACK.y - 4, TRACK.w, 8, 4);
    s.fillStyle(on ? C.accent : C.goldDim, 1).fillRoundedRect(TRACK.x, TRACK.y - 4, Math.max(8, TRACK.w * v), 8, 4);
    s.fillStyle(0xffffff, 1).fillCircle(TRACK.x + TRACK.w * v, TRACK.y, 9);
    s.lineStyle(2, C.ink, 1).strokeCircle(TRACK.x + TRACK.w * v, TRACK.y, 9);
    this.pct.setText(`${Math.round(v * 100)}%`);
    // On/Off pill.
    this.toggle.setText(on ? 'ON' : 'OFF');
    const tw = 52;
    this.toggleBg.clear().fillStyle(on ? C.accent : C.inkSoft, 1).fillRoundedRect(PANEL.x + PANEL.w - 16 - tw + 4, PANEL.y + 9, tw, 22, 11);
    this.toggle.setPosition(PANEL.x + PANEL.w - 16 - tw / 2 + 4, PANEL.y + 20).setOrigin(0.5);
  }

  update() {
    // Stay above whichever screen is showing.
    const scenes = this.scene.manager.scenes;
    if (scenes[scenes.length - 1] !== this) this.scene.bringToTop();
  }
}
