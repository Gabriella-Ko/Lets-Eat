import Phaser from 'phaser';
import { levels, problems, rules } from '../content.js';
import { makePlaceholderArt } from '../ui/widgets.js';

// Where portrait art comes from. Today: the preview cut by game/tools/slice_portraits.py.
// When the Art Asset agent's public/assets/asset_manifest.json exists, point this at it.
const MANIFEST = 'art-preview/asset_manifest.json';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.json('manifest', MANIFEST);
    this.load.json('credits', 'credits.json'); // music + art credits for the credits screen
  }

  create() {
    const manifest = this.cache.json.get('manifest');
    const base = MANIFEST.slice(0, MANIFEST.lastIndexOf('/') + 1);
    const files = new Set();
    for (const entry of Object.values(manifest?.portraits || {})) {
      // HUNGRY may reuse another file; load each file once and alias the rest after loading.
      if (!files.has(entry.file)) this.load.image(`file:${entry.file}`, base + entry.file);
      files.add(entry.file);
    }
    // Outcome illustrations load straight under their key (outcome_<level>_<venue>); OutcomeScene picks them up.
    // Chat backgrounds (chat_bg_chapter_XX), likewise; ChatScene picks them up by chapter.
    // Scrapbook art (scrap_<callback id>), likewise; ScrapbookScene shows a placeholder until it exists.
    for (const group of ['outcomes', 'backgrounds', 'scrapbook']) {
      for (const [key, entry] of Object.entries(manifest?.[group] || {})) this.load.image(key, base + entry.file);
    }
    this.load.once('complete', () => {
      for (const [key, entry] of Object.entries(manifest?.portraits || {})) {
        const src = this.textures.get(`file:${entry.file}`);
        if (src && src.key !== '__MISSING') this.textures.addImage(key, src.getSourceImage());
      }
      this.finish();
    });
    this.load.start();
  }

  finish() {
    makePlaceholderArt(this); // fills only the keys real art did not cover (icons, for now)
    this.registry.set('levels', levels);
    this.registry.set('rules', rules);
    this.registry.set('contentProblems', problems);
    this.registry.set('credits', this.cache.json.get('credits') || { music: [], art: [] });

    // Dev shortcut: ?scene=Chat|Results|Outcome&level=level_03[&venue=<id>][&highlight=craving][&revealAll][&recap]
    const q = new URLSearchParams(window.location.search);
    const level = levels.find((l) => l.id === q.get('level'));
    // Dev server only: in a built game this would let players open locked levels.
    if (import.meta.env.DEV && q.get('scene') && level) {
      this.scene.start(q.get('scene'), {
        levelId: level.id,
        venueId: q.get('venue') || level.spec.solution_id,
        highlight: q.get('highlight') ? q.get('highlight').split(',') : undefined,
        revealAll: q.has('revealAll'),
        recap: q.has('recap'),
      });
    } else {
      this.scene.start('Menu');
    }
  }
}
