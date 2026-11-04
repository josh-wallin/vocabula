/** Shared e2e helper: play a lesson through the DOM. */
import type { Page } from 'playwright-core';

export function assert(c: unknown, msg: string): asserts c { if (!c) throw new Error(`assertion failed: ${msg}`); }

/** Answer exercises until the lesson-complete screen appears. */
export async function playLesson(page: Page): Promise<{ steps: number; missedOne: boolean }> {
  const learned = new Map<string, string>();
  let steps = 0;
  let missedOne = false;
  for (; steps < 80; steps++) {
    await page.locator('main.lesson-body, [data-screen="complete"]').first().waitFor();
    if (await page.locator('[data-screen="complete"]').count()) return { steps, missedOne };
    const body = page.locator('main.lesson-body');
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
      const cue = (await page.getByTestId('cue').textContent()) ?? '';
      await page.getByTestId('answer').fill(learned.get(cue) ?? 'nescio');
      await page.getByTestId('primary').click();
      const fb = (await page.getByTestId('feedback').textContent()) ?? '';
      const m = fb.match(/Correct answer: ([^.]+)\./);
      if (m) learned.set(cue, m[1]!.trim());
    } else throw new Error(`unknown exercise type ${type}`);
    await page.getByTestId('continue').click();
  }
  throw new Error('lesson did not finish');
}

