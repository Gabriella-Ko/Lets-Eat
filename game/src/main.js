import Phaser from 'phaser';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import { W, H, C } from './ui/theme.js';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import ChatScene from './scenes/ChatScene.js';
import ResultsListScene from './scenes/ResultsListScene.js';
import OutcomeScene from './scenes/OutcomeScene.js';

// Canvas text needs the pixel font loaded before the first scene draws.
await Promise.all([document.fonts.load('20px "Pixelify Sans"'), document.fonts.load('bold 20px "Pixelify Sans"')]).catch(() => {});

window.__game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: C.bg,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, MenuScene, ChatScene, ResultsListScene, OutcomeScene],
});
