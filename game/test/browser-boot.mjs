// Headless Phaser boot (second half of `npm run boot-test`).
// Starts the Vite dev server, opens the game in the locally installed Chrome (playwright-core, no browser
// download) and, for each level in LETS_EAT_LEVELS order, boots the Chat, Results and every Outcome scene.
// Fails on any page error, console error, or a scene that does not become active.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requested = (process.env.LETS_EAT_LEVELS || '').split(',').map((s) => s.trim()).filter(Boolean);

const server = await createServer({ root: GAME, configFile: path.join(GAME, 'vite.config.js'), logLevel: 'silent', server: { port: 5199 } });
await server.listen();
const base = server.resolvedUrls.local[0];

let browser;
const problems = [];
try {
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  const boot = async (query, scene) => {
    errors.length = 0;
    await page.goto(`${base}?${query}`);
    const ok = await page
      .waitForFunction((key) => window.__game?.scene.isActive(key), scene, { timeout: 8000 })
      .then(() => true, () => false);
    await page.waitForTimeout(150);
    if (!ok) problems.push(`${query}: scene ${scene} did not start`);
    for (const e of errors) problems.push(`${query}: ${e}`);
  };

  await boot('', 'Menu');
  const levelIds = requested.length ? requested : await page.evaluate(() => window.__game.registry.get('levels').map((l) => l.id));
  for (const id of levelIds) {
    const venues = await page.evaluate((lid) => window.__game.registry.get('levels').find((l) => l.id === lid)?.venues.map((v) => v.id), id);
    if (!venues) {
      problems.push(`${id}: not loaded by the game`);
      continue;
    }
    await boot(`scene=Chat&level=${id}`, 'Chat');
    await boot(`scene=Chat&level=${id}&revealAll`, 'Chat');
    await boot(`scene=Results&level=${id}`, 'Results');
    for (const v of venues) await boot(`scene=Outcome&level=${id}&venue=${v}`, 'Outcome');
    console.log(`browser ok ${id}: chat, results, ${venues.length} outcomes`);
  }
} catch (e) {
  problems.push(`browser boot could not run: ${e.message.split('\n')[0]} (needs Chrome or Edge installed)`);
} finally {
  await browser?.close();
  await server.close();
}

if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log('browser boot passed');
