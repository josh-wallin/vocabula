/** Lesson complete: puncta, first-try accuracy, streak, words coming back, Iter Latinum code. */
import { useState } from 'preact/hooks';
import type { AppData } from '../app/controller.ts';
import { comingBack, streakNow, syncCodeToday } from '../app/controller.ts';
import type { LessonStats } from '../engine/events.ts';
import { PUNCTA_PER_GOOD_REVIEW, PUNCTA_PER_LESSON } from '../engine/events.ts';

export function Complete({ app, title, run, stats, onContinue }: {
  app: AppData; title: string; run: string; stats: LessonStats; onContinue: () => void;
}) {
  const [copied, setCopied] = useState<'no' | 'yes' | 'fail'>('no');
  const puncta = PUNCTA_PER_LESSON + PUNCTA_PER_GOOD_REVIEW * stats.firstTryCorrect;
  const st = streakNow(app);
  const back = comingBack(app, run).slice(0, 8);
  const code = syncCodeToday(app);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied('yes'); }
    catch { setCopied('fail'); }
  };
  return (
    <div class="screen" data-screen="complete">
      <main class="complete">
        <svg class="laurel" width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden="true">
          <circle class="disc-bg" cx="52" cy="52" r="46" />
          <path d="M52 82c-14-4-24-16-24-32M52 82c14-4 24-16 24-32" class="leaf" stroke-width="3" stroke-linecap="round" />
          <path d="M30 58c-5-1-8-5-8-9 5 0 8 3 9 7M33 46c-5-2-7-6-6-10 5 1 7 5 7 9M39 36c-4-3-5-8-3-11 4 2 5 6 4 10M74 58c5-1 8-5 8-9-5 0-8 3-9 7M71 46c5-2 7-6 6-10-5 1-7 5-7 9M65 36c4-3 5-8 3-11-4 2-5 6-4 10" class="leaf" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M42 52l7 7 14-15" class="tick" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <h1 lang="la">Lectiō perfecta</h1>
          <span class="sub"><span lang="la">{title}</span> complete</span>
        </div>
        <div class="stats">
          <div class="stat"><span class="k">PUNCTA</span><span class="v" style={{ color: 'var(--plum)' }} data-testid="puncta">+{puncta}</span></div>
          <div class="stat"><span class="k">FIRST TRY</span><span class="v" style={{ color: 'var(--ok)' }}>{stats.firstTryCorrect} / {stats.graded}</span></div>
          <div class="stat"><span class="k">STREAK</span><span class="v" style={{ color: 'var(--bronze-text)' }}>{st.count}</span></div>
        </div>
        {back.length > 0 && (
          <div class="panel">
            <h2>Coming back in your next review</h2>
            <div class="pills" lang="la">
              {back.map((b) => (
                <span key={b.lemma} class={b.missed ? 'missed' : ''}>{app.lex.byId.get(b.lemma)?.lemma.parts[0] ?? b.lemma}</span>
              ))}
            </div>
            <p class="small">Missed words come back sooner.</p>
          </div>
        )}
        <div class="panel">
          <h2>Log this in Iter Latinum</h2>
          <div class="code-row">
            <span class="code" data-testid="sync-code">{code}</span>
            <button type="button" class="btn secondary small" onClick={copy}>{copied === 'yes' ? 'Copied' : 'Copy'}</button>
          </div>
          <p class="small">{copied === 'fail' ? 'Couldn’t copy automatically: select the code and copy it.' : 'Paste it into the Import box in Iter Latinum. It covers all of today’s practice.'}</p>
        </div>
      </main>
      <footer class="lesson-foot" style={{ borderTop: 0 }}>
        <button type="button" class="btn" onClick={onContinue} data-testid="complete-continue">Continue</button>
      </footer>
    </div>
  );
}
