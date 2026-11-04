/**
 * End-to-end: a Lectiō reading passage through the DOM.
 *
 *   npm run build && npx tsx e2e/lectio.e2e.ts
 *
 * Imports the private pack, then a backup that marks every node before the first Lectiō node done,
 * plays that lesson (context, every sentence screen with a word tapped for its gloss and parse and the
 * translation shown, the questions with one missed on purpose), checks the node is done, that the
 * sentence clips were asked for under their audio keys, and rereads the passage from Words → Lectiōnēs.
 * Skips (exit 0) when content/private/vocabula-pack.json is absent.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { assertPortFree, PREVIEW_PORT, startPreview, stopServers, waitForHttp } from './serve.ts';
import { assert } from './play.ts';
import { parsePack } from '../src/data/pack.ts';
import { parseLemmaList } from '../src/data/loader.ts';
import { buildLexicon } from '../src/engine/lexicon.ts';
import { buildPath } from '../src/engine/path.ts';
import { parseListeningLesson } from '../src/engine/listening.ts';
import { lectioText, parseLectioFile } from '../src/engine/lectio.ts';
import { audioKey } from '../src/audio/key.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PACK = resolve(ROOT, 'content/private/vocabula-pack.json');
const PORT = PREVIEW_PORT;
const URL = `http://localhost:${PORT}/`;
const log = (s: string) => console.log(`[e2e lectio] ${s}`);
/** E2E_SHOTS=<dir>: save screenshots of the Lectiō screens there. */
const SHOTS = process.env.E2E_SHOTS;

const waitForServer = () => waitForHttp(URL);

async function main() {
  if (!existsSync(PACK)) { log('SKIP: private pack not found'); return; }
  if (!existsSync(resolve(ROOT, 'dist/index.html'))) throw new Error('dist/ missing: run npm run build first');
  await assertPortFree(PORT, 'E2E_PORT');

  // The path as the app builds it.
  const pack = parsePack(JSON.parse(readFileSync(PACK, 'utf8')));
  const lex = buildLexicon(pack.lemmas, parseLemmaList(JSON.parse(readFileSync(resolve(ROOT, 'content/dcc.json'), 'utf8'))), pack.fr ?? []);
  const ldir = resolve(ROOT, 'content/listening');
  const lessons = readdirSync(ldir).filter((f) => /^listen-.*\.json$/.test(f)).sort()
    .map((f) => parseListeningLesson(JSON.parse(readFileSync(resolve(ldir, f), 'utf8')))).sort((a, b) => a.section - b.section);
  const rdir = resolve(ROOT, 'content/lectio');
  const passages = readdirSync(rdir).filter((f) => /^s\d\d\.json$/.test(f)).sort().flatMap((f) => parseLectioFile(JSON.parse(readFileSync(resolve(rdir, f), 'utf8'))));
  const path = buildPath(lex, { listening: lessons, lectio: passages });
  const at = path.nodes.findIndex((n) => n.kind === 'lectio');
  if (at < 0) { log('SKIP: no Lectiō node on this path'); return; }
  const node = path.nodes[at]!;
  const p = passages.find((x) => x.id === node.lectio)!;
  const ts = Date.now() - 86_400_000;
  const backup = {
    format: 'vocabula-events', version: 1, exportedAt: new Date().toISOString(), device: 'e2e',
    events: path.nodes.slice(0, at).map((n, i) => ({ id: `e2e-${i}`, device: 'e2e', ts: ts + i, kind: 'node_done', body: { node: n.id, run: `r${i}` } })),
  };
  const backupFile = join(mkdtempSync(join(tmpdir(), 'vocabula-e2e-')), 'backup.json');
  writeFileSync(backupFile, JSON.stringify(backup));

  startPreview(ROOT, PORT);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await waitForServer();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const asked = new Set<string>();
    await context.route(/\/api\/audio\/[0-9a-f]+$/, (r) => {
      asked.add(r.request().url().split('/').pop()!);
      return r.fulfill({ status: 200, contentType: 'audio/mpeg', body: silentWav() });
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
    // Not listed yet.
    await page.getByRole('button', { name: 'Words', exact: true }).click();
    assert(await page.getByTestId(`lectio-open-${p.id}`).count() === 0, 'not in Lectiōnēs before it is done');
    await page.getByRole('button', { name: 'Path', exact: true }).click();
    const disc = page.locator(`button.disc[data-node="${node.id}"]`);
    await disc.waitFor();
    assert((await disc.getAttribute('data-status')) === 'current', `${node.id} is current`);
    assert(((await disc.getAttribute('aria-label')) ?? '').includes('reading'), 'Lectiō node label');
    await disc.click();

    // Context.
    await page.locator('[data-lectio="context"]').waitFor();
    assert(((await page.locator('.lectio-title').textContent()) ?? '') === p.title, 'title shown');
    assert(((await page.locator('.audit-context').textContent()) ?? '') === p.context, 'context line shown');
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'lectio-context.png') });
    await page.getByTestId('primary').click();

    // One screen per sentence: tap a word, show the translation.
    for (let i = 0; i < p.sentences.length; i++) {
      await page.locator(`[data-lectio="read"][data-index="${i}"]`).waitFor();
      const sents = page.getByTestId('lsent');
      assert(await sents.count() === i + 1, `sentences 1–${i + 1} shown`);
      const cur = sents.nth(i);
      const toks = cur.getByTestId('tok');
      assert(await toks.count() === p.sentences[i]!.tokens.length, `sentence ${i + 1}: every word tappable`);
      const j = p.sentences[i]!.tokens.findIndex((t) => !t.proper && t.cell !== 'citation');
      await toks.nth(Math.max(0, j)).click();
      const g = (await page.getByTestId('gloss').textContent()) ?? '';
      assert(g.length > 0 && !g.includes('No gloss'), `gloss for sentence ${i + 1}: ${g}`);
      if (j >= 0) assert(await page.getByTestId('parse').count() === 1, `parse for sentence ${i + 1}`);
      await cur.getByTestId('show-en').click();
      assert(((await cur.getByTestId('en').textContent()) ?? '') === p.sentences[i]!.en, `translation of sentence ${i + 1}`);
      if (SHOTS && i === 2) await page.screenshot({ path: join(SHOTS, 'lectio-read.png'), fullPage: true });
      const label = (await page.getByTestId('primary').textContent()) ?? '';
      assert(label === (i < p.sentences.length - 1 ? 'Next sentence' : 'On to the questions'), `button: ${label}`);
      await page.getByTestId('primary').click();
    }

    // Questions: miss the first, answer the rest.
    let missed = false;
    for (let guard = 0; guard < 12; guard++) {
      await page.locator('main.lesson-body, [data-screen="complete"]').first().waitFor();
      if (await page.locator('[data-screen="complete"]').count()) break;
      assert((await page.locator('main.lesson-body').getAttribute('data-kind')) === 'lectio-q', 'question screen');
      await page.locator(`button.opt[data-answer="${missed ? 1 : 0}"]`).first().click();
      await page.getByTestId('primary').click();
      assert((await page.getByTestId('feedback').getAttribute('data-ok')) === String(missed), 'graded');
      missed = true;
      await page.getByTestId('continue').click();
    }
    await page.locator('[data-screen="complete"]').waitFor();
    await page.getByTestId('complete-continue').click();
    await page.locator(`[data-node="${node.id}"][data-status="done"]`).waitFor();
    log(`${node.id} done: ${p.sentences.length} sentences, ${p.questions.length} questions`);
    const keys = p.sentences.map((s) => audioKey(lectioText(s)));
    assert(keys.every((k) => asked.has(k)), `every sentence clip requested (${keys.filter((k) => asked.has(k)).length}/${keys.length})`);

    // Reread from Words → Lectiōnēs.
    await page.getByRole('button', { name: 'Words', exact: true }).click();
    await page.getByTestId(`lectio-open-${p.id}`).click();
    await page.locator('[data-screen="lectio"]').waitFor();
    assert(await page.getByTestId('lsent').count() === p.sentences.length, 'reader shows the whole passage');
    await page.getByTestId('tok').first().click();
    assert(((await page.getByTestId('gloss').textContent()) ?? '').length > 0, 'gloss in the reader');
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'lectio-reader.png'), fullPage: true });
    await page.getByRole('button', { name: 'Back' }).click();
    await page.locator('main[data-screen="words"]').waitFor();
    assert(errors.length === 0, `no page errors: ${errors.join('; ')}`);
    await context.close();
    log('PASS');
  } finally {
    await browser.close();
    await stopServers();
  }
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
