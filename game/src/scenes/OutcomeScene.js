import Phaser from 'phaser';
import { C, W, H, CHARACTERS, pixel, text } from '../ui/theme.js';
import { panel, button, star, saveStars, portrait } from '../ui/widgets.js';
import { scorePick, describeTag } from '../logic/scoring.js';

const IMG = { x: 36, y: 168, w: 340, h: 228 }; // 3:2, matching the result art (images are cut to 680x456)
const REACT = { x: 396, y: 168, w: 528 };

/**
 * The friends react to the pick. Stars come from the game's own scoring (logic/scoring.js);
 * the reaction lines come from outcomes_level_XX.json. The boot test checks the two agree.
 * Left of the reactions is a slot for an outcome illustration (see imageKeys).
 * data: { levelId, venueId }
 */
export default class OutcomeScene extends Phaser.Scene {
  constructor() {
    super('Outcome');
  }

  init(data) {
    const levels = this.registry.get('levels');
    this.level = levels.find((l) => l.id === data.levelId);
    this.nextLevel = levels.find((l) => l.number === this.level.number + 1);
    this.venue = this.level.venues.find((v) => v.id === data.venueId);
  }

  create() {
    const lvl = this.level;
    const score = scorePick(lvl.spec, this.venue, this.registry.get('rules'));
    const outcome = lvl.outcomes[this.venue.id] || { lines: [] };
    saveStars(lvl.id, score.stars);

    const title = { perfect: 'PERFECT MATCH!', partial: 'CLEARED', fail: 'OH NO…' }[score.result];
    this.add.text(W / 2, 38, title, pixel(38, score.result === 'fail' ? C.bad : C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    this.add.text(W / 2, 78, `You sent everyone to ${this.venue.name}`, pixel(17, C.highlight)).setOrigin(0.5);
    for (let i = 0; i < 3; i++) {
      const s = this.add.graphics({ x: W / 2 - 56 + i * 56, y: 124 });
      star(s, 0, 0, 22, i < score.stars);
      s.setScale(0);
      this.tweens.add({ targets: s, scale: 1, delay: 200 + i * 180, duration: 260, ease: 'Back.easeOut' });
    }

    this.drawImageSlot(score.result);

    // Reaction lines
    let y = REACT.y + 16;
    outcome.lines.forEach((line, i) => {
      const ch = CHARACTERS[line.speaker] || { name: line.speaker, color: C.inkSoft };
      const c = this.add.container(0, y);
      c.add(portrait(this, REACT.x + 42, 30, 52, line.speaker, line.emotion));
      c.add(this.add.text(REACT.x + 80, 0, ch.name.toUpperCase(), pixel(15, ch.color, { fontStyle: 'bold' })));
      const body = this.add.text(REACT.x + 94, 28, line.text, text(15, C.ink, { wordWrap: { width: REACT.w - 130, useAdvancedWrap: true } }));
      const bubble = this.add.graphics().fillStyle(0xffffff, 1).fillRoundedRect(REACT.x + 80, 19, body.width + 28, body.height + 18, 10);
      c.add([bubble, body]);
      c.setAlpha(0);
      this.tweens.add({ targets: c, alpha: 1, delay: 700 + i * 500, duration: 250 });
      y += Math.max(body.height + 46, 70);
    });
    const panelH = Math.max(IMG.h, y - REACT.y + 6);
    panel(this, REACT.x, REACT.y, REACT.w, panelH, C.panel, 10).setDepth(-1);

    // Hint: name each missed preference (partial) or the broken hard constraint (fail).
    let hint = '';
    if (score.result === 'partial') hint = `Missed: ${score.missed.map(describeTag).join(', ')}  (−1 star${score.missed.length > 1 ? ' each' : ''})`;
    if (score.result === 'fail') hint = `Not safe for everyone: ${score.missed.map(describeTag).join(', ')}. Reread the chat and try again.`;
    if (hint) this.add.text(W / 2, REACT.y + panelH + 18, hint, pixel(17, C.highlight, { wordWrap: { width: W - 120 }, align: 'center' })).setOrigin(0.5, 0);

    // Buttons
    const btns = [];
    if (score.result !== 'perfect') {
      btns.push(['Reread the chat', () => this.scene.start('Chat', { levelId: lvl.id, highlight: score.missed }), C.blue]);
      btns.push(['Try again', () => this.scene.start('Results', { levelId: lvl.id }), C.accent]);
    }
    if (score.result !== 'fail') {
      btns.push(this.nextLevel
        ? ['Next level →', () => this.scene.start('Chat', { levelId: this.nextLevel.id }), C.good]
        : ['Back to levels', () => this.scene.start('Menu'), C.good]);
    }
    if (score.result === 'fail') btns.push(['Levels', () => this.scene.start('Menu'), C.bar]);
    const bw = 210;
    const x0 = W / 2 - ((btns.length - 1) * (bw + 20)) / 2;
    btns.forEach(([label, fn, fill], i) => button(this, x0 + i * (bw + 20), H - 44, label, fn, { w: bw, fill }));
  }

  /**
   * Outcome illustration slot. Uses the first texture that exists:
   *   outcome_<level>_<venue>  (one picture per pick)   e.g. outcome_level_03_campus_bun_stop
   *   outcome_<level>_<result> (perfect|partial|fail)    e.g. outcome_level_03_fail
   *   outcome_<result>                                   e.g. outcome_perfect
   * None loaded yet, so it shows a framed placeholder naming the per-result key.
   */
  drawImageSlot(result) {
    const keys = [`outcome_${this.level.id}_${this.venue.id}`, `outcome_${this.level.id}_${result}`, `outcome_${result}`];
    const key = keys.find((k) => this.textures.exists(k));
    const { x, y, w, h } = IMG;
    const g = this.add.graphics();
    g.fillStyle(C.bar, 1).fillRoundedRect(x - 5, y - 5, w + 10, h + 10, 10);
    if (key) {
      this.add.image(x + w / 2, y + h / 2, key).setDisplaySize(w, h);
      return;
    }
    const tint = { perfect: C.blue, partial: C.rust, fail: C.angry }[result];
    g.fillStyle(tint, 1).fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(2, C.label, 0.6);
    for (let i = 0; i < w + h; i += 18) g.lineBetween(x + Math.max(0, i - h), y + Math.min(h, i), x + Math.min(w, i), y + Math.max(0, i - w));
    g.fillStyle(C.bar, 0.85).fillRoundedRect(x + 30, y + h / 2 - 34, w - 60, 68, 6);
    this.add.text(x + w / 2, y + h / 2 - 12, 'IMAGE GOES HERE', pixel(18, C.label, { fontStyle: 'bold' })).setOrigin(0.5);
    // Name the source file Gabriella would add: art/source/level_XX_result_<venue name>.jpg
    const venueName = this.venue.id.replace(`${this.level.district}_`, '');
    this.add.text(x + w / 2, y + h / 2 + 14, `art/source/${this.level.id}_result_${venueName}.jpg`, text(12, C.label)).setOrigin(0.5);
  }
}
