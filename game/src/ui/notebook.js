import { C, CHARACTERS, hex, pixel, text, readText } from './theme.js';
import { panel } from './widgets.js';
import { scrollArea } from './scroll.js';

export const NOTEBOOK = { x: 688, y: 78, w: 248, h: 486 };

/**
 * From this chapter on the Notebook no longer fills itself: the player pins the lines they want to keep.
 * Auto-quoting copies exactly the tagged lines, which gives away implied clues; chapter 2 is where implied
 * clues start, and chapter 1 (stated clues) teaches what a clue looks like (Gabriella, 2026-11-11).
 */
export const PIN_FROM_CHAPTER = 2;
export const pinMode = (level) => level.chapter >= PIN_FROM_CHAPTER;

/** Pinned lines live in the game registry per level (script indexes), so they survive Chat <-> Results. */
export const getPins = (scene, levelId) => scene.registry.get(`pins:${levelId}`) || [];
export const setPins = (scene, levelId, pins) => scene.registry.set(`pins:${levelId}`, [...pins].sort((a, b) => a - b));

const COPY = {
  auto: { sub: 'lines worth remembering', empty: '' },
  pinChat: { sub: 'your notebook only keeps what you star. tap the star beside a message to save it.', empty: 'nothing saved yet.\n\ntap the star next to any message to keep it in your notebook.' },
  pinResults: { sub: 'the lines you saved from the chat', empty: 'nothing saved.\n\ngo back to the chat and tap the star next to a message to keep it here.' },
};

/**
 * The Notebook sidebar, shared by the chat and the restaurant list so it sits in the same place on both.
 * It keeps the quote and who said it, not the clue tag: naming the tag ("Diet: vegetarian")
 * would solve implied clues for the player.
 * @param {string[]} highlight clue tags to highlight (lines the player missed)
 * @param {'auto'|'pinChat'|'pinResults'} mode auto = fills with tagged lines; pin modes = only what the player pinned
 */
export function notebook(scene, highlight = [], mode = 'auto') {
  const { x, y, w, h } = NOTEBOOK;
  const copy = COPY[mode];
  panel(scene, x, y, w, h, C.panelDark);
  scene.add.text(x + 16, y + 12, 'NOTEBOOK', pixel(22, C.ink, { fontStyle: 'bold' }));
  let top = y + 64;
  if (mode === 'auto') {
    scene.add.text(x + 16, y + 40, copy.sub, text(12, C.inkSoft));
  } else {
    // Pin modes: a framed callout, so the player knows the Notebook only keeps what they choose.
    const tip = scene.add.text(x + 26, y + 48, copy.sub, text(13, C.ink, { fontStyle: 'bold', wordWrap: { width: w - 52 } }));
    const box = scene.add.graphics();
    box.fillStyle(0xffffff, 1).fillRoundedRect(x + 14, y + 40, w - 28, tip.height + 16, 8);
    box.lineStyle(2, C.accent, 1).strokeRoundedRect(x + 14, y + 40, w - 28, tip.height + 16, 8);
    tip.setDepth(1);
    top = y + 40 + tip.height + 16 + 10;
  }
  const area = scrollArea(scene, x + 12, top, w - 24, y + h - 12 - top);
  const empty = scene.add.text(x + w / 2, y + h / 2, copy.empty, text(14, C.inkSoft, { align: 'center', wordWrap: { width: w - 48 } })).setOrigin(0.5);
  let entries = []; // { key, line, obj }

  const layout = (scrollToKey) => {
    let ny = 0;
    let target = null;
    for (const e of entries) {
      e.obj.y = ny;
      if (e.key === scrollToKey) target = ny;
      ny += e.obj.height + 10;
    }
    area.setContentHeight(ny);
    if (target !== null) area.scrollTo(target);
    empty.setVisible(!!copy.empty && entries.length === 0);
  };

  return {
    get size() {
      return entries.length;
    },
    /** Add a line. key (e.g. its script index) keeps entries in chat order and lets remove() find it. */
    add(line, key = entries.length) {
      if (entries.some((e) => e.key === key)) return;
      const ch = CHARACTERS[line.speaker] || { name: line.speaker };
      const hl = highlight.includes(line.clue);
      const obj = scene.add.text(0, 0, `${ch.name}: “${line.text}”`, readText(13, C.ink, {
        wordWrap: { width: w - 32, useAdvancedWrap: true },
        backgroundColor: hl ? hex(C.highlight) : undefined,
        padding: { x: 4, y: 3 },
      }));
      area.content.add(obj);
      entries.push({ key, line, obj });
      entries.sort((a, b) => a.key - b.key);
      layout(key);
    },
    remove(key) {
      const e = entries.find((x) => x.key === key);
      if (!e) return;
      e.obj.destroy();
      entries = entries.filter((x) => x !== e);
      layout();
    },
    /** Fill with every tagged line of a script (auto mode, on the restaurant list). */
    addAll(script) {
      script.forEach((line, i) => line.clue && this.add(line, i));
    },
    /** Fill with the lines at these script indexes (pin modes). */
    addPinned(script, pins) {
      for (const i of pins) if (script[i]) this.add(script[i], i);
    },
  };
}
