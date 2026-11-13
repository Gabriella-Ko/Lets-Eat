// How to play (bible: Game identity > Core loop: read the chat, inspect search results and reviews,
// recommend, see the reaction). Three steps over the screen, each framing the part of the chat screen it
// means. Shown automatically the first time level 1 opens (remembered in localStorage); the Options screen
// shows it again. Enter: next step, Esc: skip. Animation only through tween(), so Reduce motion applies.
import { tween } from './motion.js';
import { C, W, H, hex, pixel, text, readText } from './theme.js';
import { button } from './widgets.js';
import { NOTEBOOK } from './notebook.js';

/** The chat screen's layout (ChatScene CHAT, the Notebook, the "Find a place" button), framed by the steps. */
const CHAT_PANEL = { x: 24, y: 78, w: 644, h: 486 };
const FIND_BUTTON = { x: NOTEBOOK.x, y: H - 60, w: NOTEBOOK.w, h: 44 };

const CARD_W = 260; // fits over the Notebook column
const STEPS = [
  {
    title: 'Read the group chat',
    body: 'Your friends are deciding where to eat. Read every message and notice what each friend needs.',
    target: CHAT_PANEL,
    label: 'the group chat',
    card: { x: NOTEBOOK.x, y: 150 },
    arrow: 'left',
  },
  {
    title: 'Check every place',
    body: 'Once the chat is over, tap "Find a place". Open each place and read its reviews.',
    target: FIND_BUTTON,
    label: 'find a place',
    card: { x: 360, y: 300 },
    arrow: 'right',
  },
  {
    title: 'Recommend one place',
    body: 'Pick the one place that suits everyone, then see how your friends react. Your Notebook keeps what they said.',
    target: { x: NOTEBOOK.x, y: NOTEBOOK.y, w: NOTEBOOK.w, h: NOTEBOOK.h },
    label: 'your notebook',
    card: { x: 340, y: 170 },
    arrow: 'right',
  },
];

const KEY = 'lets-eat-how-to-play-v1';
let memory = false; // fallback when storage is blocked

/** Has the player already seen How to play? */
export function howToPlaySeen() {
  try {
    if (localStorage.getItem(KEY)) return true;
  } catch {
    /* storage blocked */
  }
  return memory;
}

function markSeen() {
  memory = true;
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* kept in memory for this session */
  }
}

/**
 * Three-step overlay over the whole screen. Next with the button or Enter, skip at any step with the
 * button or Esc; onDone runs once, as it closes. Marks How to play as seen. Returns a handle with close().
 * Every interactive part has isIntro set, so ChatScene's tap-to-skip ignores clicks on it.
 */
export function showHowToPlay(scene, onDone = () => {}) {
  markSeen();
  const root = scene.add.container(0, 0).setDepth(1000);
  const shade = scene.add.rectangle(W / 2, H / 2, W, H, C.bg, 0.78);
  const blocker = scene.add.zone(W / 2, H / 2, W, H).setInteractive();
  blocker.isIntro = true;
  const frame = scene.add.graphics();
  const tag = scene.add.text(0, 0, '', pixel(14, C.panel, { fontStyle: 'bold', backgroundColor: hex(C.accent), padding: { x: 8, y: 3 } }));
  const arrow = scene.add.graphics();
  const card = scene.add.container(0, 0);
  root.add([shade, blocker, frame, tag, arrow, card]);

  let step = 0;
  let closed = false;
  let pulse = null;

  const drawStep = () => {
    const s = STEPS[step];
    const t = s.target;
    frame.clear();
    frame.lineStyle(4, C.highlight, 1).strokeRoundedRect(t.x - 6, t.y - 6, t.w + 12, t.h + 12, 14);
    frame.alpha = 1;
    pulse?.stop();
    pulse = tween(scene, { targets: frame, alpha: 0.45, duration: 650, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    tag.setText(s.label.toUpperCase()).setPosition(t.x + 4, Math.max(4, t.y - 32));

    card.removeAll(true);
    const body = scene.add.text(18, 66, s.body, readText(16, C.ink, { wordWrap: { width: CARD_W - 36, useAdvancedWrap: true }, lineSpacing: 3 }));
    const ch = body.height + 66 + 96;
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(4, 6, CARD_W, ch, 12);
    g.fillStyle(C.panel, 1).fillRoundedRect(0, 0, CARD_W, ch, 12);
    g.lineStyle(3, C.accent, 1).strokeRoundedRect(0, 0, CARD_W, ch, 12);
    const head = scene.add.text(18, 12, `HOW TO PLAY · ${step + 1} OF ${STEPS.length}`, pixel(13, C.accentDark, { fontStyle: 'bold' }));
    const title = scene.add.text(18, 32, `${step + 1}. ${s.title}`, pixel(20, C.ink, { fontStyle: 'bold' }));
    const last = step === STEPS.length - 1;
    const skip = button(scene, 70, ch - 52, 'Skip', close, { w: 104, h: 34, size: 14, fill: C.bar });
    const next = button(scene, CARD_W - 84, ch - 52, last ? "Let's eat!" : 'Next →', advance, { w: 140, h: 34, size: 14 });
    skip.isIntro = next.isIntro = true;
    const hint = scene.add.text(CARD_W / 2, ch - 18, 'Enter: next   ·   Esc: skip', text(12, C.inkSoft)).setOrigin(0.5);
    card.add([g, head, title, body, skip, next, hint]);

    // Card position, then an arrow from its side to the framed part of the screen.
    const cx = s.card.x;
    const cy = Math.min(s.card.y, H - ch - 12);
    card.setPosition(cx, cy + 16);
    card.alpha = 0;
    tween(scene, { targets: card, alpha: 1, y: cy, duration: 260, ease: 'Sine.easeOut' });

    const ay = cy + ch / 2;
    const from = s.arrow === 'left' ? { x: cx - 4, y: ay } : { x: cx + CARD_W + 4, y: ay };
    const to = s.arrow === 'left'
      ? { x: Math.min(t.x + t.w + 8, cx - 30), y: ay }
      : { x: t.x - 10, y: Math.max(t.y + 10, Math.min(t.y + t.h - 10, ay)) };
    drawArrow(arrow, from, to);
  };

  function advance() {
    if (closed) return;
    if (step < STEPS.length - 1) {
      step++;
      drawStep();
    } else close();
  }

  const kb = scene.input.keyboard;
  function close() {
    if (closed) return;
    closed = true;
    kb?.off('keydown-ENTER', advance);
    kb?.off('keydown-ESC', close);
    pulse?.stop();
    // Stays interactive while it fades, so a click during the fade doesn't reach the screen below.
    tween(scene, { targets: root, alpha: 0, duration: 200, ease: 'Sine.easeIn', onComplete: () => root.destroy() });
    onDone();
  }

  kb?.on('keydown-ENTER', advance);
  kb?.on('keydown-ESC', close);
  scene.events.once('shutdown', () => {
    kb?.off('keydown-ENTER', advance);
    kb?.off('keydown-ESC', close);
  });

  root.alpha = 0;
  tween(scene, { targets: root, alpha: 1, duration: 220, ease: 'Sine.easeOut' });
  drawStep();
  return { close };
}

function drawArrow(g, from, to) {
  g.clear();
  g.lineStyle(4, C.highlight, 1).lineBetween(from.x, from.y, to.x, to.y);
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const s = 14;
  g.fillStyle(C.highlight, 1).fillTriangle(
    to.x, to.y,
    to.x - s * Math.cos(a - 0.5), to.y - s * Math.sin(a - 0.5),
    to.x - s * Math.cos(a + 0.5), to.y - s * Math.sin(a + 0.5),
  );
}
