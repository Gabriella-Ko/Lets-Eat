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

// Canvas text needs both fonts loaded before the first scene draws.
const FAMILIES = ['Jersey 10', 'Lexend'];
await Promise.all(FAMILIES.flatMap((f) => [document.fonts.load(`20px "${f}"`), document.fonts.load(`bold 20px "${f}"`)])).catch(() => {});

window.__game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: C.bg,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, MenuScene, ChatScene, ResultsListScene, OutcomeScene, ScrapbookScene, OptionsScene, CreditsScene, FriendsScene, HudScene],
});
