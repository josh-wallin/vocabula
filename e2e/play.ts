/** Shared e2e helper: play a lesson through the DOM. */
import type { Page } from 'playwright-core';

export function assert(c: unknown, msg: string): asserts c { if (!c) throw new Error(`assertion failed: ${msg}`); }

/** Answer exercises until the lesson-complete screen appears. */
export async function playLesson(page: Page): Promise<{ steps: number; missedOne: boolean; sentences: number; listened: number }> {
  const learned = new Map<string, string>();
  let steps = 0;
  let missedOne = false;
  let sentences = 0;
  let listened = 0;
  for (; steps < 80; steps++) {
    await page.locator('main.lesson-body, [data-screen="complete"]').first().waitFor();
    if (await page.locator('[data-screen="complete"]').count()) return { steps, missedOne, sentences, listened };
    const body = page.locator('main.lesson-body');
    // A listening exercise whose clip can't load (no /api under vite preview) turns into its fallback.
    if (await page.getByTestId('listen-cue').count()) {
      await page.getByTestId('listen-cue').waitFor({ state: 'detached', timeout: 1500 }).catch(() => undefined);
      if (await page.getByTestId('listen-cue').count()) listened++;
    }
    const type = await body.getAttribute('data-exercise');
    if (type === 'intro' || type === 'grammar') {
      await page.getByTestId('primary').click();
      continue;
    }
    if (type === 'choice') {
      if (!missedOne) {
        // Miss the first choice question on purpose: it must come back later, ungraded.
        await page.locator('button.opt[data-answer="0"]').first().click();
        await page.getByTestId('primary').click();
        assert((await page.getByTestId('feedback').getAttribute('data-ok')) === 'false', 'miss registered');
        missedOne = true;
        await page.getByTestId('continue').click();
        continue;
      }
      const opts = page.locator('button.opt[data-answer="1"]');
      for (const o of await opts.all()) await o.click();
      await page.getByTestId('primary').click();
    } else if (type === 'typed') {
      const cue = (await page.getByTestId('cue').count()) ? ((await page.getByTestId('cue').textContent()) ?? '') : '';
      await page.getByTestId('answer').fill(learned.get(cue) ?? 'nescio');
      await page.getByTestId('primary').click();
      const fb = (await page.getByTestId('feedback').textContent()) ?? '';
      const m = fb.match(/Correct answer: ([^.]+)\./);
      if (m) learned.set(cue, m[1]!.trim());
    } else if (type === 'sentence') {
      // Sentence exercises: answer correctly (tile ids t0, t1, … are the reference order).
      const kind = await page.locator('.sent').getAttribute('data-kind');
      if (kind === 'en' || kind === 'la' || kind === 'listen' || kind === 'dictate') {
        const ids = (await page.locator('.tile-bank button[data-tile^="t"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile') ?? '')))
          .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
        for (const id of ids) await page.locator(`.tile-bank button[data-tile="${id}"]`).click();
      } else {
        for (const o of await page.locator('.sent button[data-answer="1"]').all()) await o.click();
      }
      await page.getByTestId('primary').click();
      assert((await page.getByTestId('feedback').getAttribute('data-ok')) === 'true', `sentence ${kind} answered correctly`);
      sentences++;
    } else throw new Error(`unknown exercise type ${type}`);
    await page.getByTestId('continue').click();
  }
  throw new Error('lesson did not finish');
}

