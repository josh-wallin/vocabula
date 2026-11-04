/**
 * End-to-end voice test (#/compare), headless Chrome via playwright-core.
 *
 *   npm run build && npm run test:e2e
 *
 * Serves dist/ plus the real /api/tts handlers (worker/tts.ts over an in-memory D1 fake)
 * with a stubbed upstream: no API key is needed and nothing reaches OpenAI or Gemini.
 * Checks: Profile isn't needed (the hash opens the page directly), all items render,
 * a missing key shows where to add it, Generate makes one upstream call and a reload
 * plays from the cache, ratings reach the server and the summary updates.
 * Port: $E2E_COMPARE_PORT, else 4183. Needs no private pack.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { handleTts, type TtsEnv } from '../worker/tts.ts';
import { COMPARE_ITEMS } from '../src/compare/items.ts';
import { FakeD1 } from '../tests/d1fake.ts';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(ROOT, 'dist');
const PORT = Number(process.env.E2E_COMPARE_PORT ?? 4183);
const ORIGIN = `http://localhost:${PORT}`;
const EMAIL = 'joshua.a.wallin@gmail.com';

function log(s: string) { console.log(`[e2e:compare] ${s}`); }
function assert(c: unknown, msg: string): asserts c { if (!c) throw new Error(`assertion failed: ${msg}`); }

let upstream = 0;
const env: TtsEnv = {
  DB: new FakeD1(), ALLOWED_EMAILS: EMAIL, ACCESS_AUD: 'e2e', OPENAI_API_KEY: 'sk-e2e',
  // A few fake MP3 bytes stand in for the engine’s audio (never played: preload="none").
  FETCH: async () => { upstream++; return new Response(new Uint8Array([0x49, 0x44, 0x33, 0, 0, 0]), { headers: { 'content-type': 'audio/mpeg' } }); },
};

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

async function serve(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', ORIGIN);
  if (url.pathname.startsWith('/api/')) {
    let r: Response;
    if (url.pathname.startsWith('/api/tts')) {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      r = await handleTts(new Request(url, { method: req.method ?? 'GET', ...(body && req.method !== 'GET' ? { body } : {}) }), env,
        { access: { aud: 'e2e', getIdentity: async () => ({ email: EMAIL }) } });
    } else {
      r = Response.json({ error: 'not found' }, { status: 404 }); // e.g. /api/audio/:key (eSpeak, other branch)
    }
    res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let file = join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !existsSync(file) || url.pathname === '/') file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(readFileSync(file));
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('dist/ missing: run npm run build first');
  if (await fetch(ORIGIN).then(() => true, () => false)) throw new Error(`port ${PORT} is already serving something: set E2E_COMPARE_PORT`);
  const server = createServer((req, res) => { serve(req, res).catch((e) => { console.error(e); res.writeHead(500); res.end(); }); });
  await new Promise<void>((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(ORIGIN + '/#/compare');
    await page.locator('[data-screen="compare"]').waitFor();
    assert(await page.locator('.cmp-item').count() === COMPARE_ITEMS.length, 'every item shown');
    await page.getByTestId('compare-keys').waitFor();
    assert((await page.getByTestId('compare-keys').textContent())?.includes('GEMINI_API_KEY'), 'missing Gemini key named');
    const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert(noHScroll, 'no horizontal scroll at phone width');
    log('page, items and missing-key notice shown');

    const first = page.locator(`[data-item="${COMPARE_ITEMS[0]!.id}"]`);
    const oa = first.locator('[data-col="openai:pseudo"]');
    await oa.getByTestId('generate').click();
    await oa.locator('audio').waitFor();
    assert(upstream === 1, 'one upstream call');
    const gem = first.locator('[data-col="gemini:plain"]');
    await gem.getByTestId('generate').click();
    await gem.getByRole('alert').waitFor();
    assert((await gem.getByRole('alert').textContent())?.includes('GEMINI_API_KEY not set'), '503 message shown');
    log('generate works; missing key reported');

    await oa.getByRole('radio', { name: '4' }).click();
    await oa.getByLabel('length').check();
    await oa.getByText('Saved').waitFor();
    await page.reload();
    await page.locator('[data-screen="compare"]').waitFor();
    const oa2 = page.locator(`[data-item="${COMPARE_ITEMS[0]!.id}"] [data-col="openai:pseudo"]`);
    await oa2.locator('audio').waitFor();
    assert(await oa2.getByTestId('generate').count() === 0, 'cached clip: no Generate button');
    assert(await oa2.getByRole('radio', { name: '4' }).getAttribute('aria-checked') === 'true', 'rating restored from server');
    const row = page.locator('[data-testid="compare-summary"] tr[data-col="openai:pseudo"]');
    const txt = await row.textContent();
    assert(txt?.includes('4.00') && txt.includes('length ×1'), `summary updated: ${txt}`);
    assert(upstream === 1, 'reload served from cache');
    log('rating saved to server, summary updated, cache used after reload');

    // Back leaves the hidden page (no pack here, so the app shows its import screen).
    await page.getByRole('button', { name: 'Back' }).click();
    await page.locator('[data-screen="import"]').waitFor();

    assert(errors.length === 0, `no page errors: ${errors.join('; ')}`);
    log('PASS');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
