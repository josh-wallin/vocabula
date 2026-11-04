/** Import screen, Profile/Settings, Words, About/credits. */
import { useState } from 'preact/hooks';
import { importPack } from '../data/contentStore.ts';
import type { AppData } from '../app/controller.ts';
import { exportBackupText, importBackupText, streakNow, syncCodeToday } from '../app/controller.ts';
import { citation } from '../engine/lexicon.ts';
import { parseCardId, State } from '../engine/srs.ts';
import type { ContentPack } from '../data/pack.ts';

async function readFile(input: HTMLInputElement): Promise<string | null> {
  const f = input.files?.[0];
  input.value = '';
  return f ? f.text() : null;
}

/** Shared pack import UI: file picker + paste fallback. */
export function PackImport({ onImported, replacing }: { onImported: (p: ContentPack) => void; replacing?: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const run = async (text: string) => {
    setErr(null); setOk(null);
    try {
      const p = await importPack(text);
      setOk(`Imported ${p.counts.lemmas} words for chapters ${p.chapters.join(', ')}.`);
      onImported(p);
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <label class="btn filebtn" data-testid="pack-file-label">
        {replacing ? 'Replace content pack…' : 'Choose vocabula-pack.json'}
        <input type="file" accept=".json,application/json" data-testid="pack-file"
          onChange={async (e) => { const t = await readFile(e.target as HTMLInputElement); if (t !== null) await run(t); }} />
      </label>
      <button type="button" class="btn secondary" aria-expanded={showPaste} onClick={() => setShowPaste(!showPaste)}>
        Paste the pack text instead
      </button>
      {showPaste && (
        <>
          <label for="pack-paste" class="field-label">Pack contents (JSON)</label>
          <textarea id="pack-paste" class="paste" value={paste} onInput={(e) => setPaste((e.target as HTMLTextAreaElement).value)}
            spellcheck={false} autocomplete="off" />
          <button type="button" class="btn" disabled={!paste.trim()} onClick={() => run(paste)}>Import pasted pack</button>
        </>
      )}
      {err && <p class="err" role="alert">{err}</p>}
      {ok && <p class="okmsg" role="status">{ok}</p>}
    </div>
  );
}

export function ImportScreen({ onImported }: { onImported: () => void }) {
  return (
    <div class="screen" data-screen="import">
      <header class="topbar"><span class="brand">Vocābula</span></header>
      <main class="page">
        <h1 lang="la">Salvē!</h1>
        <p>Vocābula drills Latin vocabulary and forms along <i>Wheelock’s Latin</i>. The textbook’s word lists are copyrighted, so they aren’t part of this public site.</p>
        <p>Import your private content pack once on this device. It is stored only here, and the app then works fully offline.</p>
        <PackImport onImported={() => onImported()} />
        <p class="note">The pack is the <code>vocabula-pack.json</code> file built by <code>scripts/build-pack.ts</code>.</p>
      </main>
    </div>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProfileScreen({ app, setApp, onAbout, outbox }: {
  app: AppData; setApp: (a: AppData) => void; onAbout: () => void; outbox: number;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const st = streakNow(app);
  const cards = [...app.state.cards.values()];
  const learned = new Set([...app.state.cards.keys()].map((k) => parseCardId(k)?.lemma)).size;
  const doImport = async (e: Event) => {
    const t = await readFile(e.target as HTMLInputElement);
    if (t === null) return;
    try {
      const r = await importBackupText(app, t);
      setApp(r.app);
      setMsg({ ok: true, text: r.added ? `Merged ${r.added} new events.` : 'Nothing new: every event in that backup is already here.' });
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
  };
  return (
    <main class="page" data-screen="profile">
      <h1>Profile</h1>
      <dl class="kv">
        <dt>Day streak</dt><dd>{st.count}{st.frozen.length ? ` (${st.frozen.length} freeze${st.frozen.length > 1 ? 's' : ''} used)` : ''}</dd>
        <dt>Puncta</dt><dd>{app.state.puncta}</dd>
        <dt>Lessons finished</dt><dd>{app.state.lessons.length}</dd>
        <dt>Words practised</dt><dd>{learned}</dd>
        <dt>Cards in review</dt><dd>{cards.filter((c) => c.state === State.Review).length}</dd>
        <dt>Events not yet synced</dt><dd>{outbox}</dd>
      </dl>
      <div class="panel">
        <h2>Iter Latinum code for today</h2>
        <span class="code">{syncCodeToday(app)}</span>
      </div>

      <h2>Backup</h2>
      <p class="note">Your progress is a log of events stored on this device. Export it to keep a copy or move it to another device; importing merges, so nothing is duplicated.</p>
      <button type="button" class="btn secondary" onClick={() => download(`vocabula-backup-${new Date().toISOString().slice(0, 10)}.json`, exportBackupText(app))}>
        Export backup
      </button>
      <label class="btn secondary filebtn">Import backup…
        <input type="file" accept=".json,application/json" onChange={doImport} />
      </label>
      {msg && <p class={msg.ok ? 'okmsg' : 'err'} role="status">{msg.text}</p>}

      <h2>Content pack</h2>
      <p class="note">Installed: {app.content.pack.id}, {app.content.pack.counts.lemmas} words, built {app.content.pack.builtAt.slice(0, 10)}.</p>
      <PackImport replacing onImported={() => location.reload()} />

      <button type="button" class="btn secondary" onClick={onAbout}>About & credits</button>
    </main>
  );
}

export function WordsScreen({ app }: { app: AppData }) {
  const seen = app.path.nodes.filter((n) => app.state.done.has(n.id)).flatMap((n) => n.newWords);
  const ids = [...new Set(seen)];
  return (
    <main class="page" data-screen="words">
      <h1 lang="la">Verba</h1>
      {ids.length === 0 ? <p>Words appear here as you meet them on the path.</p> : (
        <ul class="wordlist">
          {ids.map((id) => {
            const w = app.lex.byId.get(id);
            if (!w) return null;
            return (
              <li key={id}>
                <span class="w" lang="la">{citation(w.lemma)}{w.lemma.gender ? `, ${w.lemma.gender}.` : ''}</span>
                <span class="g">{w.lemma.gloss}</span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export function AboutScreen() {
  return (
    <main class="page" data-screen="about">
      <h1>About</h1>
      <p><span lang="la">Vocābula</span> is a personal study app that follows <i>Wheelock’s Latin</i>. Wheelock word lists come from your private content pack and are never part of this site.</p>
      <h2>Credits</h2>
      <p>
        Additional vocabulary (<span lang="la">Plūra verba</span>) is from the <strong>Dickinson College Commentaries Latin Core Vocabulary</strong>,
        compiled by a team at Dickinson College led by Christopher Francese, with frequency data from LASLA:{' '}
        <a href="https://dcc.dickinson.edu/latin-core-list1">dcc.dickinson.edu</a>. Licensed under{' '}
        <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>; this app’s adapted copy of that list is shared under the same license.
      </p>
      <p>Grammar chapters, grammar cards and glossary are original writing for this app.</p>
      <p>Scheduling uses the FSRS algorithm via <a href="https://github.com/open-spaced-repetition/ts-fsrs">ts-fsrs</a> (MIT).</p>
      <p>Fonts: Cinzel, EB Garamond and Figtree (SIL Open Font License), loaded from Google Fonts when online.</p>
    </main>
  );
}
