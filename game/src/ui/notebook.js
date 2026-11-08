import { C, CHARACTERS, hex, pixel, text } from './theme.js';
import { panel } from './widgets.js';
import { scrollArea } from './scroll.js';

export const NOTEBOOK = { x: 688, y: 78, w: 248, h: 486 };

/**
 * The Notebook sidebar, shared by the chat and the restaurant list so it sits in the same place on both.
 * It keeps the quote and who said it, not the clue tag: naming the tag ("Diet: vegetarian")
 * would solve implied clues for the player.
 * @param {string[]} highlight clue tags to highlight (lines the player missed)
 */
export function notebook(scene, highlight = []) {
  const { x, y, w, h } = NOTEBOOK;
  panel(scene, x, y, w, h, C.panelDark);
  scene.add.text(x + 16, y + 12, 'NOTEBOOK', pixel(22, C.ink, { fontStyle: 'bold' }));
  scene.add.text(x + 16, y + 40, 'lines worth remembering', text(12, C.inkSoft));
  const area = scrollArea(scene, x + 12, y + 64, w - 24, h - 76);
  let ny = 0;
  return {
    add(line) {
      const ch = CHARACTERS[line.speaker] || { name: line.speaker };
      const hl = highlight.includes(line.clue);
      const t = scene.add.text(0, ny, `${ch.name}: “${line.text}”`, text(13, C.ink, {
        wordWrap: { width: w - 32, useAdvancedWrap: true },
        backgroundColor: hl ? hex(C.highlight) : undefined,
        padding: { x: 4, y: 3 },
      }));
      area.content.add(t);
      ny += t.height + 10;
      area.setContentHeight(ny);
      area.scrollToBottom();
    },
    /** Fill with every tagged line of a script (used on the restaurant list, after the chat is read). */
    addAll(script) {
      for (const line of script) if (line.clue) this.add(line);
    },
  };
}
