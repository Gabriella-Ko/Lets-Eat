// Palette sampled from Gabriella's portrait sheets (assets/art/*_sheet.jpg):
// warm dark-brown label bars, dusty-rose label text, dusty blue, rust and ribbon orange.
// The bible lists the palette as Open; once confirmed, record it there.
import { highContrast, textScale, fontChoice } from './settings.js';

export const W = 960;
export const H = 640;

export const C = {
  bg: 0x2e2624, // page background, a shade under the label bars
  bar: 0x3f3533, // label-bar brown: headers, secondary buttons
  label: 0xd9b8a8, // label-bar text, headings on dark
  panel: 0xf3e4d0, // cream paper
  panelDark: 0xe6d0b8, // notebook paper
  ink: 0x3f3533,
  inkSoft: 0x7d6a60,
  accent: 0xd9822b, // Mina's ribbon orange: primary buttons
  accentDark: 0xb8641a,
  blue: 0x5d7985, // Liam's backdrop blue: neutral buttons
  rust: 0x8a4a2c,
  gold: 0xf2c14e,
  goldDim: 0x5a4a45,
  highlight: 0xf6d78b, // a missed clue line, after a wrong pick
  starred: 0xfdf0dc, // a chat bubble the player starred (soft cream, kept apart from highlight)
  good: 0x6f8f5a,
  bad: 0xc0452f,
  angry: 0x391811,
};

// High-contrast option: darker ink, white panels, stronger highlight and buttons. Applied in place to C,
// so every scene that draws after applyPalette() picks it up (Options restarts the scene it changes).
const BASE = { ...C };
const HIGH_CONTRAST = {
  label: 0xf7ece0,
  panel: 0xf6efe6, // off-white, so white bubbles and review boxes still stand out on it
  panelDark: 0xe2d6c7,
  ink: 0x000000,
  inkSoft: 0x3d322d,
  accent: 0xb55400,
  accentDark: 0x8a3f00,
  blue: 0x2e5566,
  goldDim: 0x8f7d72,
  highlight: 0xffd84d,
  starred: 0xfff1d6,
  good: 0x3f6b2c,
  bad: 0xa3260f,
};
export function applyPalette() {
  Object.assign(C, BASE, highContrast() ? HIGH_CONTRAST : {});
}
applyPalette();

export const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// Font sets (bible: Art direction > Fonts, Gabriella 2026-11-23), chosen in Options > Font.
// heading: headings, labels, buttons (pixel()); body: chat and reviews (text(), readText()).
// headingScale keeps headings about the visual size Pixelify Sans had (Silkscreen runs big, Jersey 10 small).
export const FONT_SETS = {
  default: { heading: 'Silkscreen', headingScale: 0.82, body: 'Nunito' },
  easier: { heading: 'Jersey 10', headingScale: 1.3, body: 'Lexend' },
};
const fontSet = () => FONT_SETS[fontChoice()] || FONT_SETS.default;
/** Heading font stack of the chosen set, read at draw time (like C after High contrast). */
export const pixelFont = () => `"${fontSet().heading}", "Trebuchet MS", sans-serif`;
/** Body font stack of the chosen set, read at draw time. */
export const bodyFont = () => `"${fontSet().body}", "Trebuchet MS", "Segoe UI", sans-serif`;
/** Pixel size for a heading of nominal `size`, after the chosen heading font's size factor. */
export const pixelSize = (size) => Math.round(size * fontSet().headingScale);

export const text = (size, color = C.ink, extra = {}) => ({
  fontFamily: bodyFont(),
  fontSize: `${size}px`,
  color: hex(color),
  ...extra,
});
export const pixel = (size, color = C.ink, extra = {}) => text(pixelSize(size), color, { fontFamily: pixelFont(), ...extra });
/**
 * Shrinks a one-line text object's font until it is at most maxW wide, so a label written for one font set
 * never spills out of its button, card or plate in the other (the four fonts differ in width).
 */
export function fitWidth(t, maxW, min = 9) {
  let size = parseFloat(t.style.fontSize);
  while (t.width > maxW && size > min) t.setFontSize(--size);
  return t;
}
/** Text the player reads (chat, reviews, Notebook, reactions, recap, scrapbook pages): grows with the Text size option. */
export const readText = (size, color = C.ink, extra = {}) => text(Math.round(size * textScale()), color, extra);

// Name colours echo each sheet, darkened enough to read on cream.
export const CHARACTERS = {
  maya: { name: 'Maya', color: 0x7a4bb0 },
  liam: { name: 'Liam', color: 0x9a6b14 },
  mina: { name: 'Mina', color: 0xb8641a },
  roxy: { name: 'Roxy', color: 0xa3472c },
  cyrus: { name: 'Cyrus', color: 0x4a6573 },
  brooke: { name: 'Brooke', color: 0x86691a },
};

export const EMOTIONS = ['HAPPY', 'ANNOYED', 'SURPRISED', 'HUNGRY', 'ANGRY', 'NEUTRAL'];

export const CUISINES = {
  noodles: 0xf0c05a, sushi: 0xe9887a, pizza: 0xd9622f, burgers: 0xb7773f, tacos: 0xe7b23d,
  curry: 0xd28a2e, cafe: 0x9b7653, dim_sum: 0xe6c79c, greek: 0x5d8fc9, viet: 0x7fa069,
  thai: 0x6bb09a, italian: 0x6f9a62, ice_cream: 0xe9a6c0,
};

export const DISTRICTS = {
  campus: 'Campus Quarter',
  downtown: 'Downtown',
  night_market: 'Night Market',
  waterfront: 'Waterfront',
};

/** Texture key for a portrait, with the bible's NEUTRAL fallback for unknown emotions. */
export function portraitKey(character, emotion) {
  const e = EMOTIONS.includes(emotion) ? emotion : 'NEUTRAL';
  return `portrait_${character}_${e.toLowerCase()}`;
}
