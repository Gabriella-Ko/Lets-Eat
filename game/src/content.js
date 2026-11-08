// Static content, bundled at build time and available at startup (bible: no runtime AI calls).
// Reads the crew's files directly, so a merged level shows up in the game with no copy step.
import rules from '../../scripts/rules.json';
import { buildLevels } from './logic/levels.js';

const files = import.meta.glob('../../content/levels/*/*.json', { eager: true, import: 'default' });
const registries = Object.values(import.meta.glob('../../content/registry/*.json', { eager: true, import: 'default' }));

export const { levels, problems } = buildLevels(files, registries);
export { rules };

if (problems.length) console.warn("Let's Eat! content problems:\n" + problems.join('\n'));
