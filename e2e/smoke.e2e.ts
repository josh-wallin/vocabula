/**
 * End-to-end smoke test (headless Chrome via playwright-core).
 *
 *   npm run build && npm run test:e2e
 *
 * Serves dist/ with `vite preview`, imports the private content pack, completes
 * the first Verba lesson by answering through the DOM, checks that the node stays
 * completed after a reload, and that a reload works offline (service worker); then plays
 * through to the first Repetītiō (answering its sentence exercises) and flags an exercise.
 * Skips (exit 0) when content/private/vocabula-pack.json is absent.
 * Chrome: $CHROME_PATH, else /usr/bin/google-chrome.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { assertPortFree, PREVIEW_PORT, startPreview, stopServers, waitForHttp } from './serve.ts';
import { playLesson } from './play.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PACK = resolve(ROOT, 'content/private/vocabula-pack.json');
const PORT = PREVIEW_PORT;
const URL = `http://localhost:${PORT}/`;

/** 0.2 s of 8 kHz 8-bit mono silence. */
function silentWav(): Buffer {
  const n = 1600;
  const b = Buffer.alloc(44 + n, 0x80);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  return b;
}

function log(s: string) { console.log(`[e2e] ${s}`); }
function assert(c: unknown, msg: string): asserts c { if (!c) throw new Error(`assertion failed: ${msg}`); }

const waitForServer = () => waitForHttp(URL);

async function main() {
  if (!existsSync(PACK)) { log('SKIP: private pack not found (run scripts/build-pack.ts)'); return; }
  if (!existsSync(resolve(ROOT, 'dist/index.html'))) throw new Error('dist/ missing: run npm run build first');
  // Code-split chunks, their CSS and the fonts must all be precached, or lazy screens break offline.
  const sw = readFileSync(resolve(ROOT, 'dist/sw.js'), 'utf8');
  const assets = readdirSync(resolve(ROOT, 'dist/assets')).filter((f) => /\.(js|css|woff2)$/.test(f));
  const missing = assets.filter((f) => !sw.includes(`assets/${f}`));
  assert(missing.length === 0, `precache manifest lists every asset (missing: ${missing.join(', ')})`);
  log(`precache lists all ${assets.length} JS/CSS/font assets`);
  await assertPortFree(PORT, 'E2E_PORT');
  startPreview(ROOT, PORT);
  const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
  const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
  try {
    await waitForServer();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    // Fonts are self-hosted and precached: nothing may come from a font CDN.
    const fontCdn: string[] = [];
    await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => { fontCdn.push(r.request().url()); return r.abort(); });
    // vite preview has no /api: serve every clip as a short silent WAV, so listening exercises stay (no fallback).
    let clips = 0;
    await context.route(/\/api\/audio\/[0-9a-f]+$/, (r) => { clips++; return r.fulfill({ status: 200, contentType: 'audio/mpeg', body: silentWav() }); });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(URL);
    await page.locator('[data-screen="import"]').waitFor();
    log('import screen shown');
    await page.getByTestId('pack-file').setInputFiles(PACK);
    await page.locator('[data-screen="path"]').waitFor();
    log('pack imported, path shown');
    // EB Garamond's Latin locl would draw u as v under lang="la" ("mvltvs"); the app ships copies without it.
    // A string, not a function: tsx would wrap a named arrow in __name(), which the page doesn't have.
    const [uw, vw] = await page.evaluate<[number, number]>(`(async () => {
      const spans = ['uuuuuuuu', 'vvvvvvvv'].map((t) => { const s = document.createElement('span'); s.className = 'la'; s.lang = 'la'; s.style.font = '600 40px "EB Garamond"'; s.textContent = t; document.body.append(s); return s; });
      await document.fonts.load('600 40px "EB Garamond"', 'uv'); await document.fonts.ready; await new Promise((r) => setTimeout(r, 300));
      const r = spans.map((s) => s.getBoundingClientRect().width); spans.forEach((s) => s.remove()); return r;
    })()`);
    assert(Math.abs(uw - vw) > 1, `Latin u is drawn as u, not v (widths ${uw.toFixed(1)} / ${vw.toFixed(1)})`);
    log('Latin u and v drawn differently');
    if ((JSON.parse(readFileSync(PACK, 'utf8')) as { fr?: unknown[] }).fr?.length) {
      // Familia Rōmāna previews close section 1 (locked for now).
      const fr = page.locator('[data-node="s1.fr.1"]');
      assert(await fr.count() === 1 && (await fr.getAttribute('data-status')) === 'locked', 's1.fr.1 shown, locked');
      assert(((await fr.getAttribute('aria-label')) ?? '').startsWith('Familia Rōmāna · Cap. I'), 'FR node label');
      log('Familia Rōmāna preview node shown');
    }

    const first = page.locator('button.disc[data-status="current"]');
    assert((await first.getAttribute('data-node')) === 's1.verba.1', 'first node is s1.verba.1');
    await first.click();
    const { steps, missedOne } = await playLesson(page);
    log(`lesson finished in ${steps} steps`);
    assert(missedOne, 'one item was missed');
    const code = await page.getByTestId('sync-code').textContent();
    assert(code?.startsWith('VOC1-'), 'sync code shown');
    await page.getByTestId('complete-continue').click();
    await page.locator('[data-screen="path"]').waitFor();
    assert(await page.locator('[data-node="s1.verba.1"][data-status="done"]').count() === 1, 's1.verba.1 done');
    assert(await page.locator('[data-node="s1.pattern"][data-status="current"]').count() === 1, 's1.pattern is current');

    // Persistence across reload.
    await page.reload();
    await page.locator('[data-screen="path"]').waitFor();
    assert(await page.locator('[data-node="s1.verba.1"][data-status="done"]').count() === 1, 'done after reload');
    log('node completion persists after reload');

    // Offline reload via the service worker.
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((r) => navigator.serviceWorker.addEventListener('controllerchange', () => r(), { once: true }));
      }
      return reg.active?.state;
    });
    await context.setOffline(true);
    await page.reload();
    await page.locator('[data-screen="path"]').waitFor({ timeout: 10000 });
    assert(await page.locator('[data-node="s1.verba.1"][data-status="done"]').count() === 1, 'done after offline reload');
    // A lesson starts offline too, and the chapter reader opens.
    await page.locator('button.disc[data-status="current"]').click();
    await page.locator('[data-exercise="grammar"]').waitFor();
    await page.locator('button.term').first().click();
    await page.locator('[role="dialog"]').waitFor();
    log('offline reload works; grammar card and glossary sheet open offline');
    await page.getByRole('button', { name: 'Got it' }).last().click(); // close sheet
    await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
    const second = await playLesson(page);
    log(`finished Coniugātiō I offline in ${second.steps} steps`);
    await page.getByTestId('complete-continue').click();
    assert(await page.locator('[data-node="s1.pattern"][data-status="done"]').count() === 1, 's1.pattern done offline');

    // Offline with no clips cached, no listening exercises were built. Back online, they are.
    await context.setOffline(false);
    // Verba II, then the first Repetītiō: it mixes in sentence exercises. Flag one exercise on the way.
    await page.locator('button.disc[data-status="current"]').click();
    await page.locator('main.lesson-body').waitFor();
    await page.getByTestId('flag').click();
    await page.locator('[data-testid="flag-sheet"] button[data-reason="bad-english"]').click();
    await page.locator('#flag-note').fill('e2e flag');
    await page.getByTestId('flag-send').click();
    await page.locator('[data-testid="flag-sheet"]').waitFor({ state: 'detached' });
    assert((await page.getByTestId('flag').getAttribute('aria-label')) === 'Flagged', 'flag button shows flagged');
    await playLesson(page);
    await page.getByTestId('complete-continue').click();
    assert(await page.locator('[data-node="s1.rep.1"][data-status="current"]').count() === 1, 's1.rep.1 is current');
    await page.locator('button.disc[data-status="current"]').click();
    const rep = await playLesson(page);
    assert(rep.sentences >= 2, `Repetītiō had ${rep.sentences} sentence exercises (${JSON.stringify(rep)})`);
    log(`Repetītiō: ${rep.sentences} sentence exercises answered`);
    assert(rep.listened >= 1, `Repetītiō had ${rep.listened} listening exercises`);
    assert(clips > 0, 'audio clips were fetched');
    log(`Repetītiō: ${rep.listened} listening exercises answered; ${clips} clip requests`);
    await page.getByTestId('complete-continue').click();
    await page.getByRole('button', { name: 'Profile' }).click();
    const flags = page.getByTestId('flag-list');
    await flags.waitFor();
    assert(((await flags.textContent()) ?? '').includes('e2e flag'), 'flag listed in Profile');
    log('flag recorded and listed in Profile');
    assert(fontCdn.length === 0, `no font CDN requests: ${fontCdn.join(', ')}`);
    assert(errors.length === 0, `no page errors: ${errors.join('; ')}`);
    log('PASS');
  } finally {
    await browser.close();
    await stopServers();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
