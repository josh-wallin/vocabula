/**
 * End-to-end smoke test (headless Chrome via playwright-core).
 *
 *   npm run build && npm run test:e2e
 *
 * Serves dist/ with `vite preview`, imports the private content pack, completes
 * the first Verba lesson by answering through the DOM, checks that the node stays
 * completed after a reload, and that a reload works offline (service worker).
 * Skips (exit 0) when content/private/vocabula-pack.json is absent.
 * Chrome: $CHROME_PATH, else /usr/bin/google-chrome.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { playLesson } from './play.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PACK = resolve(ROOT, 'content/private/vocabula-pack.json');
const PORT = 4179;
const URL = `http://localhost:${PORT}/`;

function log(s: string) { console.log(`[e2e] ${s}`); }
function assert(c: unknown, msg: string): asserts c { if (!c) throw new Error(`assertion failed: ${msg}`); }

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('preview server did not start');
}

async function main() {
  if (!existsSync(PACK)) { log('SKIP: private pack not found (run scripts/build-pack.ts)'); return; }
  if (!existsSync(resolve(ROOT, 'dist/index.html'))) throw new Error('dist/ missing: run npm run build first');
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
  const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
  try {
    await waitForServer();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    // Fonts are optional; the network is blocked in CI, so fail them fast.
    await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(URL);
    await page.locator('[data-screen="import"]').waitFor();
    log('import screen shown');
    await page.getByTestId('pack-file').setInputFiles(PACK);
    await page.locator('[data-screen="path"]').waitFor();
    log('pack imported, path shown');
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
    assert(errors.length === 0, `no page errors: ${errors.join('; ')}`);
    log('PASS');
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
