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

  await boot('', 'Title');
  // The title screen leaves for the Menu on Enter.
  errors.length = 0;
  await page.keyboard.press('Enter');
  const menuOk = await page
    .waitForFunction(() => window.__game?.scene.isActive('Menu'), null, { timeout: 8000 })
    .then(() => true, () => false);
  await page.waitForTimeout(150);
  if (!menuOk) problems.push('title: Enter did not open the Menu');
  for (const e of errors) problems.push(`title -> menu: ${e}`);
  // Back to the title (Backspace), then Start must still work (Enter opens the Menu again).
  const waitScene = (key) =>
    page.waitForFunction((k) => window.__game?.scene.isActive(k), key, { timeout: 8000 }).then(() => true, () => false);
  if (menuOk) {
    errors.length = 0;
    await page.keyboard.press('Backspace');
    const backOk = await waitScene('Title');
    await page.waitForTimeout(150);
    if (!backOk) problems.push('menu: Backspace did not return to the Title');
    else {
      await page.keyboard.press('Enter');
      const againOk = await waitScene('Menu');
      await page.waitForTimeout(150);
      if (!againOk) problems.push('title: Enter did not open the Menu after returning from the map');
    }
    for (const e of errors) problems.push(`menu -> title -> menu: ${e}`);
  }
  const firstLevel = await page.evaluate(() => window.__game.registry.get('levels')[0]?.id);
  if (firstLevel) await boot(`scene=Scrapbook&level=${firstLevel}`, 'Scrapbook');
  if (firstLevel) await boot(`scene=Options&level=${firstLevel}`, 'Options');
  if (firstLevel) await boot(`scene=Credits&level=${firstLevel}`, 'Credits');
  if (firstLevel) await boot(`scene=Friends&level=${firstLevel}`, 'Friends');
  if (firstLevel) await boot(`scene=Ending&level=${firstLevel}`, 'Ending');
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
