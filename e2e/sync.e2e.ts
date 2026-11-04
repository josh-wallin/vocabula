/**
 * End-to-end sync test (headless Chrome via playwright-core).
 *
 *   npm run build && npm run test:e2e
 *
 * Serves dist/ plus the real Worker API handlers (worker/api.ts over an
 * in-memory D1 fake), like the deployed Worker with run_worker_first ["/api/*"].
 * Access is simulated: while `expired` is set, every /api request gets the
 * redirect Access sends to its login page.
 *
 * Device A imports the pack file, uploads it from Profile and plays a lesson.
 * Device B uses "Sign in & download", syncs and shows A's progress. Then B's
 * session expires: the chip turns into "Sign in", and signing in again goes
 * through the (mocked) Access login and back into the app, which syncs again.
 * Port: $E2E_SYNC_PORT, else $E2E_PORT + 1, else 4181 (e2e/serve.ts).
 * Skips (exit 0) when content/private/vocabula-pack.json is absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { assertPortFree, SYNC_PORT, listen, stopServers } from './serve.ts';
import { handleApi, type ApiEnv } from '../worker/api.ts';
import { FakeD1 } from '../tests/d1fake.ts';
import { assert, playLesson } from './play.ts';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(ROOT, 'dist');
const PACK = resolve(ROOT, 'content/private/vocabula-pack.json');
const PORT = SYNC_PORT;
const ORIGIN = `http://localhost:${PORT}`;
const LOGIN = 'https://long-credit-c585.cloudflareaccess.com/cdn-cgi/access/login/vocabula';
const EMAIL = 'joshua.a.wallin@gmail.com';

function log(s: string) { console.log(`[e2e:sync] ${s}`); }

const env: ApiEnv = { DB: new FakeD1(), ALLOWED_EMAILS: EMAIL, ACCESS_AUD: 'e2e' };
let expired = false;
let apiCalls = 0;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

async function serve(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', ORIGIN);
  if (url.pathname.startsWith('/api/')) {
    apiCalls++;
    if (expired) { res.writeHead(302, { location: `${LOGIN}?redirect_url=${encodeURIComponent(url.href)}` }); res.end(); return; }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const r = await handleApi(new Request(url, { method: req.method ?? 'GET', headers, ...(body && req.method !== 'GET' ? { body } : {}) }), env,
      { access: { aud: 'e2e', getIdentity: async () => ({ email: EMAIL }) } });
    res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  // Static assets with SPA fallback (what the assets layer does).
  let file = join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !existsSync(file) || url.pathname === '/') file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(readFileSync(file));
}

async function chipState(page: Page): Promise<string | null> {
  return page.getByTestId('sync-chip').getAttribute('data-state');
}
async function waitChip(page: Page, state: string, timeout = 15000) {
  await page.locator(`[data-testid="sync-chip"][data-state="${state}"]`).waitFor({ timeout });
}
async function newDevice(browser: import('playwright-core').Browser): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { context, page, errors };
}

async function main() {
  if (!existsSync(PACK)) { log('SKIP: private pack not found (run scripts/build-pack.ts)'); return; }
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('dist/ missing: run npm run build first');
  const server = createServer((req, res) => { serve(req, res).catch((e) => { console.error(e); res.writeHead(500); res.end(); }); });
  await assertPortFree(PORT, 'E2E_SYNC_PORT');
  await listen(server, PORT);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    /* ---- device A: file import, upload, one lesson ---- */
    const A = await newDevice(browser);
    await A.page.goto(ORIGIN + '/');
    await A.page.locator('[data-screen="import"]').waitFor();
    await A.page.getByTestId('server-download').click();
    const msg = await A.page.getByTestId('server-download-msg').textContent();
    assert(msg?.includes('no pack on the server'), `missing-pack message, got ${msg}`);
    log('A: server has no pack yet');
    await A.page.getByTestId('pack-file').setInputFiles(PACK);
    await A.page.locator('[data-screen="path"]').waitFor();
    await A.page.getByRole('button', { name: 'Profile' }).click();
    await A.page.getByTestId('upload-pack').click();
    await A.page.getByTestId('upload-msg').filter({ hasText: 'Uploaded' }).waitFor();
    await A.page.getByTestId('server-pack').filter({ hasText: 'same as this device' }).waitFor();
    log('A: pack uploaded from Profile');
    await A.page.getByRole('button', { name: 'Path' }).click();
    await A.page.locator('button.disc[data-status="current"]').click();
    await playLesson(A.page);
    await A.page.getByTestId('complete-continue').click();
    await waitChip(A.page, 'synced');
    log('A: lesson finished and synced');

    /* ---- device B: download pack from server, receive A's progress ---- */
    const B = await newDevice(browser);
    await B.page.goto(ORIGIN + '/');
    await B.page.locator('[data-screen="import"]').waitFor();
    await B.page.getByTestId('server-download').click();
    await B.page.locator('[data-screen="path"]').waitFor();
    await B.page.locator('[data-node="s1.verba.1"][data-status="done"]').waitFor({ timeout: 15000 });
    await waitChip(B.page, 'synced');
    log('B: pack downloaded; A’s progress replayed');

    // Puncta agree on both devices.
    const pA = await A.page.locator('.chip.puncta').textContent();
    const pB = await B.page.locator('.chip.puncta').textContent();
    assert(pA === pB, `puncta equal (${pA} vs ${pB})`);

    /* ---- B: session expires, sign in again through Access ---- */
    // Make sure B's service worker controls the page, so the login navigation goes through it.
    await B.page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((r) => navigator.serviceWorker.addEventListener('controllerchange', () => r(), { once: true }));
      }
    });
    expired = true;
    await B.page.getByRole('button', { name: 'Profile' }).click();
    await B.page.getByTestId('sync-now').click();
    await waitChip(B.page, 'auth');
    assert((await B.page.getByTestId('sync-chip').textContent())?.includes('Sign in'), 'chip says Sign in');
    log('B: expired session detected (opaque redirect)');
    // Mock the Access login: "signing in" clears the expiry and redirects back.
    let loginHits = 0;
    await B.context.route(`${LOGIN}**`, async (route) => {
      loginHits++;
      expired = false;
      const back = new URL(route.request().url()).searchParams.get('redirect_url') ?? ORIGIN + '/';
      await route.fulfill({ status: 302, headers: { location: back } });
    });
    const before = apiCalls;
    await B.page.getByTestId('sign-in-again').first().click();
    await B.page.waitForURL(ORIGIN + '/');
    await B.page.locator('[data-screen="path"]').waitFor();
    await waitChip(B.page, 'synced');
    assert(loginHits === 1, 'went through the Access login once');
    assert(apiCalls > before, 'API reached after sign-in');
    assert(await B.page.locator('[data-node="s1.verba.1"][data-status="done"]').count() === 1, 'progress intact after sign-in');
    log('B: signed in again via /api/me?return=/ and synced');

    /* ---- B practises offline; A gets it after B reconnects ---- */
    await B.context.setOffline(true);
    await waitChip(B.page, 'offline');
    await B.page.locator('button.disc[data-status="current"]').click();
    await playLesson(B.page);
    await B.page.getByTestId('complete-continue').click();
    assert(await chipState(B.page) === 'offline', 'still offline');
    await B.context.setOffline(false);
    await waitChip(B.page, 'synced');
    await A.page.reload();
    await A.page.locator('[data-node="s1.pattern"][data-status="done"]').waitFor({ timeout: 15000 });
    log('B: offline lesson queued, sent on reconnect; A sees it after reload');

    assert(A.errors.length === 0 && B.errors.length === 0, `no page errors: ${[...A.errors, ...B.errors].join('; ')}`);
    log('PASS');
  } finally {
    await browser.close();
    await stopServers();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
