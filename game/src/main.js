import Phaser from 'phaser';
import '@fontsource/jersey-10/400.css'; // Jersey 10 comes in one weight only
import '@fontsource/lexend/400.css';
import '@fontsource/lexend/700.css';
import { W, H, C } from './ui/theme.js';
import BootScene from './scenes/BootScene.js';
import TitleScene from './scenes/TitleScene.js';
import MenuScene from './scenes/MenuScene.js';
import ChatScene from './scenes/ChatScene.js';
import ResultsListScene from './scenes/ResultsListScene.js';
import OutcomeScene from './scenes/OutcomeScene.js';
import ScrapbookScene from './scenes/ScrapbookScene.js';
import OptionsScene from './scenes/OptionsScene.js';
import CreditsScene from './scenes/CreditsScene.js';
import FriendsScene from './scenes/FriendsScene.js';
import HudScene from './scenes/HudScene.js';
import EndingScene from './scenes/EndingScene.js';

// Canvas text needs both fonts loaded before the first scene draws.
const FAMILIES = ['Jersey 10', 'Lexend'];
await Promise.all(FAMILIES.flatMap((f) => [document.fonts.load(`20px "${f}"`), document.fonts.load(`bold 20px "${f}"`)])).catch(() => {});

// Page zoom (bug hunt AX-02). The FIT canvas already fills the window, so zoom
// can't make it bigger without overflowing it. Real browser zoom (Ctrl +) just
// refits. CSS zoom on <html>/<body> used to double the canvas's pixel size
// and push it off-screen, where it couldn't be clicked. So #game cancels any
// zoom it inherits: the game refits the window, and the pointer maps 1:1 again.
const ZOOM_SUPPORT = 'refit';
const gameEl = document.getElementById('game');
function inheritedZoom() {
  let z = 1;
  for (let n = gameEl.parentElement; n; n = n.parentElement) {
    const v = parseFloat(getComputedStyle(n).zoom);
    if (v > 0) z *= v;
  }
  return z;
}
function cancelPageZoom() {
  if (ZOOM_SUPPORT !== 'refit') return;
  const z = inheritedZoom();
  const want = Math.abs(z - 1) < 1e-3 ? '' : String(1 / z);
  if (gameEl.style.zoom === want) return;
  gameEl.style.zoom = want;
  try { window.__game?.scale?.refresh(); } catch { /* not booted yet */ }
}
cancelPageZoom();
window.addEventListener('resize', cancelPageZoom);
new MutationObserver(cancelPageZoom).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'], subtree: false });
new MutationObserver(cancelPageZoom).observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });

window.__game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: C.bg,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, MenuScene, ChatScene, ResultsListScene, OutcomeScene, ScrapbookScene, OptionsScene, CreditsScene, FriendsScene, EndingScene, HudScene],
});
