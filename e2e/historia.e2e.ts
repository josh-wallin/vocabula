/**
 * End-to-end: the Historia tab through the DOM.
 *
 *   npm run build && npx tsx e2e/historia.e2e.ts
 *
 * Imports the private pack and a backup that finishes sections I–II (a learner at Wheelock ch. 2),
 * opens the Historia tab (every entry, in `order`, with known-word meters), opens Titus's "diem perdidi":
 * taps every word for its gloss, toggles the translation, answers the questions (one missed on
 * purpose) and checks they are recorded as review events (outbox), and that the sources link out.
 * Run twice: once with the passage's eSpeak clip served (a short silent WAV stand-in), once with
 * every clip missing, where the speaker hides itself after the failed load.
 * Skips (exit 0) when content/private/vocabula-pack.json is absent.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { assertPortFree, PREVIEW_PORT, startPreview, stopServers, waitForHttp } from './serve.ts';
import { assert } from './play.ts';
import { parsePack } from '../src/data/pack.ts';
import { parseLemmaList } from '../src/data/loader.ts';
import { buildLexicon } from '../src/engine/lexicon.ts';
import { buildPath } from '../src/engine/path.ts';
import { parseListeningLesson } from '../src/engine/listening.ts';
import { historiaSpeech, parseHistoriaEntry } from '../src/engine/historia.ts';
import { audioKey } from '../src/audio/key.ts';
import { DB_NAME } from '../src/data/db.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PACK = resolve(ROOT, 'content/private/vocabula-pack.json');
const PORT = PREVIEW_PORT;
const URL = `http://localhost:${PORT}/`;
const log = (s: string) => console.log(`[e2e historia] ${s}`);
/** E2E_SHOTS=<dir>: save screenshots there. */
const SHOTS = process.env.E2E_SHOTS;

const waitForServer = () => waitForHttp(URL);

async function main() {
  if (!existsSync(PACK)) { log('SKIP: private pack not found'); return; }
  if (!existsSync(resolve(ROOT, 'dist/index.html'))) throw new Error('dist/ missing: run npm run build first');
  await assertPortFree(PORT, 'E2E_PORT');

  const pack = parsePack(JSON.parse(readFileSync(PACK, 'utf8')));
  const lex = buildLexicon(pack.lemmas, parseLemmaList(JSON.parse(readFileSync(resolve(ROOT, 'content/dcc.json'), 'utf8'))), pack.fr ?? []);
  const ldir = resolve(ROOT, 'content/listening');
  const lessons = readdirSync(ldir).filter((f) => /^listen-.*\.json$/.test(f)).map((f) => parseListeningLesson(JSON.parse(readFileSync(resolve(ldir, f), 'utf8'))));
  const path = buildPath(lex, { listening: lessons });
  const hdir = resolve(ROOT, 'content/historia');
  const entries = readdirSync(hdir).filter((f) => f.endsWith('.json')).map((f) => parseHistoriaEntry(JSON.parse(readFileSync(resolve(hdir, f), 'utf8'))));
  const titus = entries.find((e) => e.id === 'tit-8')!;
  const passageKey = audioKey(historiaSpeech(titus));

  // A learner at Wheelock ch. 2: every node of sections I and II done.
  const ts = Date.now() - 86_400_000;
  const doneNodes = path.nodes.filter((n) => n.section <= 2);
  const backup = {
    format: 'vocabula-events', version: 1, exportedAt: new Date().toISOString(), device: 'e2e',
    events: doneNodes.map((n, i) => ({ id: `e2e-${i}`, device: 'e2e', ts: ts + i, kind: 'node_done', body: { node: n.id, run: `r${i}`, stats: { exercises: 10, graded: 8, firstTryCorrect: 8, newWords: n.newWords, reviews: 8 } } })),
  };
  const backupFile = join(mkdtempSync(join(tmpdir(), 'vocabula-e2e-')), 'backup.json');
  writeFileSync(backupFile, JSON.stringify(backup));

  startPreview(ROOT, PORT);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await waitForServer();
    for (const withClip of [true, false]) {
      const context: BrowserContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      let passageRequests = 0;
      await context.route(/\/api\/audio\/[0-9a-f]+$/, (r) => {
        const key = r.request().url().split('/').pop();
        if (key === passageKey) passageRequests++;
        return withClip && key === passageKey
          ? r.fulfill({ status: 200, contentType: 'audio/mpeg', body: silentWav() })
          : r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no audio"}' });
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(URL);
      await page.getByTestId('pack-file').setInputFiles(PACK);
      await page.locator('[data-screen="path"]').waitFor();
      await page.getByRole('button', { name: 'Profile' }).click();
      await page.locator('label:has-text("Import backup") input[type="file"]').setInputFiles(backupFile);
      await page.locator('p.okmsg[role="status"]').waitFor();
      // The import's events reach the outbox asynchronously: wait for the count to settle on them.
      const outboxBefore = await stableOutbox(page, backup.events.length);
      assert(outboxBefore === backup.events.length, `imported events queued: ${outboxBefore} of ${backup.events.length}`);

      // The list: every entry, each with a meter; a ch. 2 learner knows some words of some entries.
      await page.getByRole('button', { name: 'Historia' }).click();
      await page.locator('main[data-screen="historia"]').waitFor();
      const cards = page.getByTestId('historia-entry');
      assert(await cards.count() === entries.length, `${entries.length} entries, got ${await cards.count()}`);
      const pcts = await page.getByTestId('known-meter').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-pct'))));
      assert(pcts.length === entries.length && pcts.every((p) => p >= 0 && p <= 100), `meters ${pcts}`);
      assert(pcts.some((p) => p > 0), `some words known at ch. 2: ${pcts}`);
      assert(pcts.every((p) => p < 100), `not everything known at ch. 2: ${pcts}`);
      const ids = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-id') ?? ''));
      const byOrder = [...entries].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      assert(JSON.stringify(ids) === JSON.stringify(byOrder.map((e) => e.id)), `cards in order: ${ids}`);
      const first = (await cards.first().textContent()) ?? '';
      assert(first.includes(byOrder[0]!.citation) && first.includes(byOrder[0]!.saying), `first card: ${first}`);
      const iul = (await page.locator('[data-testid="historia-entry"][data-id="iul-32"]').textContent()) ?? '';
      assert(iul.includes('Suet. Iul. 32') && iul.includes('Iacta ālea est'), `Iul. 32 card: ${iul}`);
      if (SHOTS && withClip) await page.screenshot({ path: join(SHOTS, 'historia-list.png'), fullPage: true });
      log(`${withClip ? 'with clip' : 'no clip'}: list ok, known ${pcts.join('/')}%`);

      // Titus 8.1.
      await page.locator(`[data-testid="historia-entry"][data-id="tit-8"]`).click();
      await page.locator('[data-screen="historia-entry"][data-id="tit-8"]').waitFor();
      const toks = page.getByTestId('tok');
      const n = await toks.count();
      assert(n === titus.tokens.length, `${n} tappable words`);
      for (let i = 0; i < n; i++) {
        await toks.nth(i).click();
        const g = (await page.getByTestId('gloss').textContent()) ?? '';
        assert(g.includes(titus.tokens[i]!.gloss) && g.includes(titus.tokens[i]!.parse), `gloss for ${titus.tokens[i]!.w}: ${g}`);
      }
      const nihil = page.locator('[data-testid="tok"]', { hasText: /^nihil$/ });
      assert((await nihil.getAttribute('data-known')) === '1', 'nihil (ch. 1) is known');
      const amici = page.locator('[data-testid="tok"]', { hasText: /^Amīcī$/ });
      assert((await amici.getAttribute('data-known')) === '0', 'amīcī (ch. 3) is not known yet');
      const passage = (await page.getByTestId('passage').textContent()) ?? '';
      assert(passage.includes('“Amīcī, diem perdidī.”'), `passage with curly quotes: ${passage}`);

      assert(await page.getByTestId('translation').count() === 0, 'translation hidden at first');
      await page.getByTestId('toggle-translation').click();
      assert(((await page.getByTestId('translation').textContent()) ?? '').includes(titus.translation), 'translation shown');
      await page.getByTestId('toggle-translation').click();
      assert(await page.getByTestId('translation').count() === 0, 'translation hidden again');

      const essay = (await page.getByTestId('essay').textContent()) ?? '';
      assert(essay.includes('Eutropius') && essay.includes('[2]'), 'essay with source refs');

      // Speaker: with the clip it plays; without, it hides after the failed load.
      const speaker = page.locator(`[data-testid="speaker"][data-audio="${passageKey}"]`);
      assert(await speaker.count() === 1, 'passage speaker shown while the clip may be playable');
      await speaker.click();
      if (withClip) {
        await page.waitForTimeout(500);
        assert(await speaker.count() === 1, 'speaker stays when the clip plays');
      } else {
        await speaker.waitFor({ state: 'detached', timeout: 5000 });
      }
      assert(passageRequests > 0, 'the passage clip was requested');

      // Questions: miss the first, answer the others.
      const qs = page.getByTestId('question');
      assert(await qs.count() === titus.questions.length, 'all questions shown');
      for (let i = 0; i < titus.questions.length; i++) {
        const q = qs.nth(i);
        await q.locator(`[data-testid="hist-opt"][data-correct="${i === 0 ? 0 : 1}"]`).first().click();
        const v = (await q.getByTestId('verdict').textContent()) ?? '';
        assert(i === 0 ? v.startsWith('Not quite') : v === 'Right.', `verdict ${i}: ${v}`);
        assert(await q.locator('[data-testid="hist-opt"]:not([disabled])').count() === 0, 'options locked after the first answer');
      }
      const links = await page.getByTestId('sources').locator('ol a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
      assert(JSON.stringify(links) === JSON.stringify(titus.sources.map((s) => s.url)), `source links ${links}`);
      if (SHOTS && withClip) await page.screenshot({ path: join(SHOTS, 'historia-entry.png'), fullPage: true });

      await page.getByRole('button', { name: 'Back' }).click();
      await page.locator('main[data-screen="historia"]').waitFor();
      await page.getByRole('button', { name: 'Profile' }).click();
      await page.getByTestId('outbox-count').waitFor();
      const outboxAfter = await stableOutbox(page, outboxBefore + titus.questions.length);
      assert(outboxAfter === outboxBefore + titus.questions.length, `review events queued: ${outboxBefore} → ${outboxAfter}`);
      // The reviews are in the log with historia card ids.
      const cardsInDb = await page.evaluate((DBN) => new Promise<string[]>((res, rej) => {
        const req = indexedDB.open(DBN);
        req.onerror = () => rej(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('events', 'readonly');
          const all = tx.objectStore('events').getAll();
          all.onsuccess = () => res((all.result as { card?: string }[]).map((e) => e.card ?? '').filter((c) => c.startsWith('historia:')));
          all.onerror = () => rej(all.error);
        };
      }), DB_NAME);
      assert(JSON.stringify([...cardsInDb].sort()) === JSON.stringify(titus.questions.map((_, i) => `historia:tit-8:q${i + 1}`)), `historia reviews ${cardsInDb}`);
      log(`${withClip ? 'with clip' : 'no clip'}: entry ok (${n} glosses, ${titus.questions.length} reviews, speaker ${withClip ? 'played' : 'hidden'})`);
      assert(errors.length === 0, `no page errors: ${errors.join('; ')}`);
      await context.close();
    }
    log('PASS');
  } finally {
    await browser.close();
    await stopServers();
  }
}

/**
 * The outbox count once it has stopped changing: the same number on several reads in a row
 * (and, if given, equal to `expected`), polling up to `timeout` ms; returns the last read either
 * way, so the caller's assertion reports the real value.
 */
async function stableOutbox(page: Page, expected?: number, timeout = 10_000): Promise<number> {
  const read = async () => Number(await page.getByTestId('outbox-count').textContent());
  const deadline = Date.now() + timeout;
  let last = await read();
  let same = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(150);
    const v = await read();
    same = v === last ? same + 1 : 0;
    last = v;
    if (same >= 4 && (expected === undefined || v === expected)) break;
  }
  return last;
}

/** 0.3 s of 8 kHz 8-bit mono silence. */
function silentWav(): Buffer {
  const n = 2400;
  const b = Buffer.alloc(44 + n, 0x80);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  return b;
}

main().catch((e) => { console.error(e); process.exit(1); });
