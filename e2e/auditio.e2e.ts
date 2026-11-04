/**
 * End-to-end: an Audītiō lesson (DCC recording) through the DOM.
 *
 *   npm run build && npx tsx e2e/auditio.e2e.ts
 *
 * Imports the private pack, then a backup that marks every node before the first Audītiō node done,
 * plays that lesson (context, pre-teach cards + quizzes, first listen, second listen with tap-to-gloss,
 * comprehension questions, one missed on purpose), and checks the node is done and that About & credits
 * names the DCC readers. Run twice: once with the clip served (a short silent MP3 stand-in) and once with
 * no clip (vite preview has no /api), where the lesson falls back to reading the text.
 * Skips (exit 0) when content/private/vocabula-pack.json is absent.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, type BrowserContext } from 'playwright-core';
import { assert } from './play.ts';
import { parsePack } from '../src/data/pack.ts';
import { parseLemmaList } from '../src/data/loader.ts';
import { buildLexicon } from '../src/engine/lexicon.ts';
import { buildPath } from '../src/engine/path.ts';
import { parseListeningLesson } from '../src/engine/listening.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PACK = resolve(ROOT, 'content/private/vocabula-pack.json');
const PORT = Number(process.env.E2E_PORT ?? 4179);
const URL = `http://localhost:${PORT}/`;
const log = (s: string) => console.log(`[e2e auditio] ${s}`);
/** E2E_SHOTS=<dir>: save screenshots of the Audītiō screens there. */
const SHOTS = process.env.E2E_SHOTS;

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('preview server did not start');
}

async function main() {
  if (!existsSync(PACK)) { log('SKIP: private pack not found'); return; }
  if (!existsSync(resolve(ROOT, 'dist/index.html'))) throw new Error('dist/ missing: run npm run build first');
  if (await fetch(URL).then(() => true, () => false)) throw new Error(`port ${PORT} is already serving something: stop it or set E2E_PORT`);

  // The path as the app builds it, to find the first Audītiō node and everything before it.
  const pack = parsePack(JSON.parse(readFileSync(PACK, 'utf8')));
  const lex = buildLexicon(pack.lemmas, parseLemmaList(JSON.parse(readFileSync(resolve(ROOT, 'content/dcc.json'), 'utf8'))), pack.fr ?? []);
  const dir = resolve(ROOT, 'content/listening');
  const lessons = readdirSync(dir).filter((f) => /^listen-.*\.json$/.test(f)).sort()
    .map((f) => parseListeningLesson(JSON.parse(readFileSync(resolve(dir, f), 'utf8')))).sort((a, b) => a.section - b.section);
  const path = buildPath(lex, { listening: lessons });
  const at = path.nodes.findIndex((n) => n.kind === 'auditio');
  if (at < 0) { log('SKIP: the pack has no section with an Audītiō lesson'); return; }
  const node = path.nodes[at]!;
  const lesson = lessons.find((l) => l.id === node.listening)!;
  const ts = Date.now() - 86_400_000;
  const backup = {
    format: 'vocabula-events', version: 1, exportedAt: new Date().toISOString(), device: 'e2e',
    events: path.nodes.slice(0, at).map((n, i) => ({ id: `e2e-${i}`, device: 'e2e', ts: ts + i, kind: 'node_done', body: { node: n.id, run: `r${i}` } })),
  };
  const backupFile = join(mkdtempSync(join(tmpdir(), 'vocabula-e2e-')), 'backup.json');
  writeFileSync(backupFile, JSON.stringify(backup));

  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await waitForServer();
    for (const withClip of [true, false]) {
      const context: BrowserContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      let dccRequests = 0;
      // Real recording stand-in: a tiny valid MP3 frame sequence is hard to hand-make, so serve a WAV with an audio/mpeg type (Chrome sniffs it).
      await context.route(/\/api\/audio\/dcc-[0-9a-f]+$/, (r) => {
        dccRequests++;
        return withClip ? r.fulfill({ status: 200, contentType: 'audio/mpeg', body: silentWav() }) : r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no audio"}' });
      });
      await context.route(/\/api\/audio\/[0-9a-f]+$/, (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no audio"}' }));
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(URL);
      await page.getByTestId('pack-file').setInputFiles(PACK);
      await page.locator('[data-screen="path"]').waitFor();
      await page.getByRole('button', { name: 'Profile' }).click();
      await page.locator('label:has-text("Import backup") input[type="file"]').setInputFiles(backupFile);
      await page.locator('p.okmsg[role="status"]').waitFor();
      await page.getByRole('button', { name: 'Path' }).click();
      const disc = page.locator(`button.disc[data-node="${node.id}"]`);
      await disc.waitFor();
      assert((await disc.getAttribute('data-status')) === 'current', `${node.id} is current`);
      assert(((await disc.getAttribute('aria-label')) ?? '').includes('listening'), 'Audītiō node label');
      await disc.click();

      // Context.
      await page.locator('[data-audit="context"]').waitFor();
      if (SHOTS && withClip) await page.screenshot({ path: join(SHOTS, 'context.png') });
      assert(((await page.locator('.audit-context').textContent()) ?? '') === lesson.context, 'context line shown');
      await page.getByTestId('primary').click();
      // Pre-teach: cards and quizzes, until the first listening screen.
      let cards = 0;
      let quizzes = 0;
      for (let guard = 0; guard < 40; guard++) {
        if (await page.locator('[data-audit="listen1"]').count()) break;
        if (await page.locator('[data-audit="word"]').count()) {
          cards++;
          await page.getByTestId('primary').click();
          continue;
        }
        const kind = await page.locator('main.lesson-body').getAttribute('data-kind');
        assert(kind === 'audit-word', `pre-teach quiz, got ${kind}`);
        await page.locator('button.opt[data-answer="1"]').click();
        await page.getByTestId('primary').click();
        assert((await page.getByTestId('feedback').getAttribute('data-ok')) === 'true', 'quiz answered');
        quizzes++;
        await page.getByTestId('continue').click();
      }
      const drilled = lesson.vocab.filter((v) => v.drill).length;
      assert(cards === drilled && quizzes === drilled, `${cards} cards, ${quizzes} quizzes for ${drilled} words`);
      log(`${withClip ? 'with clip' : 'no clip'}: ${cards} pre-teach cards and quizzes`);

      // First listen: Continue is disabled until the reading ends (or the text is shown).
      await page.getByTestId('attribution').waitFor();
      assert(((await page.getByTestId('attribution').textContent()) ?? '').includes(lesson.audio.reader), 'attribution names the reader');
      if (withClip) {
        await page.getByTestId('recording').waitFor();
        await page.evaluate(() => { const a = document.querySelector('audio.audit-audio') as HTMLAudioElement | null; void a?.play(); });
        await page.getByTestId('transcript').waitFor({ timeout: 10000 }); // revealed by the "ended" event
      } else {
        await page.getByTestId('audio-missing').waitFor();
        await page.getByTestId('transcript').waitFor();
      }
      assert(await page.locator('.transcript .tline.excerpt').count() >= 1, 'excerpt highlighted');
      assert(!(await page.getByTestId('primary').isDisabled()), 'Continue enabled after the first listen');
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `listen1-${withClip}.png`), fullPage: true });
      await page.getByTestId('primary').click();

      // Second listen: tap-to-gloss on every excerpt word.
      await page.locator('[data-audit="listen2"]').waitFor();
      const toks = page.getByTestId('tok');
      const n = await toks.count();
      assert(n === lesson.transcript.filter((x) => x.excerpt).flatMap((x) => x.tokens ?? []).length, `${n} tappable words`);
      for (let i = 0; i < n; i++) {
        await toks.nth(i).click();
        const g = (await page.getByTestId('gloss').textContent()) ?? '';
        assert(g.length > 0 && !g.includes('No gloss'), `gloss for word ${i}: ${g}`);
      }
      assert(await page.getByTestId('attribution').count() === 1, 'attribution on the second listen');
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `listen2-${withClip}.png`), fullPage: true });
      await page.getByTestId('primary').click();

      // Questions: miss the first, answer the rest.
      let missed = false;
      for (let guard = 0; guard < 12; guard++) {
        await page.locator('main.lesson-body, [data-screen="complete"]').first().waitFor();
        if (await page.locator('[data-screen="complete"]').count()) break;
        assert((await page.locator('main.lesson-body').getAttribute('data-kind')) === 'audit-q', 'question screen');
        await page.locator(`button.opt[data-answer="${missed ? 1 : 0}"]`).first().click();
        await page.getByTestId('primary').click();
        assert((await page.getByTestId('feedback').getAttribute('data-ok')) === String(missed), 'graded');
        missed = true;
        await page.getByTestId('continue').click();
      }
      await page.locator('[data-screen="complete"]').waitFor();
      await page.getByTestId('complete-continue').click();
      await page.locator(`[data-node="${node.id}"][data-status="done"]`).waitFor();
      log(`${withClip ? 'with clip' : 'no clip'}: ${node.id} done (${dccRequests} recording requests)`);
      assert(dccRequests > 0, 'the recording was requested');

      await page.getByRole('button', { name: 'Profile' }).click();
      await page.getByRole('button', { name: 'About & credits' }).click();
      const credits = (await page.getByTestId('credits-audio').textContent()) ?? '';
      const list = (await page.locator('.credits-list').textContent()) ?? '';
      assert(credits.includes('Dickinson College Commentaries') && credits.includes('CC BY-SA'), 'DCC CC BY-SA credit');
      assert(list.includes('Christopher Francese') && list.includes('Wanzie Li'), 'reader names credited');
      assert(errors.length === 0, `no page errors: ${errors.join('; ')}`);
      await context.close();
    }
    log('PASS');
  } finally {
    await browser.close();
    try { process.kill(-server.pid!, 'SIGTERM'); } catch { server.kill(); }
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
