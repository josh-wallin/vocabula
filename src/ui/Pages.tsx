/** Import screen, Profile/Settings, Words, About/credits. */
import { useEffect, useState } from 'preact/hooks';
import { LectioList } from './Lectio.tsx';
import { lectioPassages } from '../content/lectio.ts';
import { listeningLessons } from '../content/listening.ts';
import { fetchPackFromServer, importPack, localPackHash, serverPackStatus, uploadPackToServer } from '../data/contentStore.ts';
import { failureText, signInAgain } from '../sync/http.ts';
import { syncLabel, type SyncStatus } from '../sync/sync.ts';
import type { PackStatus } from '../sync/protocol.ts';
import type { AppData } from '../app/controller.ts';
import { exportBackupText, importBackupText, recordSetting, settingOn, streakNow, syncCodeToday, SETTING_AUTOPLAY, SETTING_LISTENING } from '../app/controller.ts';
import { citation } from '../engine/lexicon.ts';
import { parseCardId, State } from '../engine/srs.ts';
import type { ContentPack } from '../data/pack.ts';
import { FLAG_LABEL } from './Flag.tsx';

async function readFile(input: HTMLInputElement): Promise<string | null> {
  const f = input.files?.[0];
  input.value = '';
  return f ? f.text() : null;
}

/** Shared pack import UI: file picker + paste fallback. */
export function PackImport({ onImported, replacing, secondary }: { onImported: (p: ContentPack) => void; replacing?: boolean; secondary?: boolean }) {
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
      <label class={`btn filebtn${secondary || replacing ? ' secondary' : ''}`} data-testid="pack-file-label">
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

/** First run: download the pack from the sync server (behind Cloudflare Access). */
function ServerDownload({ onImported }: { onImported: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [needSignIn, setNeedSignIn] = useState(false);
  const go = async () => {
    setBusy(true); setMsg(null); setNeedSignIn(false);
    const r = await fetchPackFromServer();
    setBusy(false);
    switch (r.kind) {
      case 'updated': case 'unchanged': case 'kept-local': onImported(); return;
      case 'auth': setNeedSignIn(true); setMsg('Your sign-in has expired.'); return;
      case 'missing': setMsg('There’s no pack on the server yet. Import the file below on one device, then use Profile → “Upload this device’s pack to the cloud”.'); return;
      case 'invalid': setMsg(`The server’s pack was rejected: ${r.message}`); return;
      default: setMsg(failureText(r));
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <button type="button" class="btn" disabled={busy} onClick={() => void go()} data-testid="server-download">
        {busy ? 'Downloading…' : 'Sign in & download'}
      </button>
      {needSignIn && (
        <button type="button" class="btn secondary" onClick={signInAgain} data-testid="sign-in-again">Sign in again</button>
      )}
      {msg && <p class="err" role="alert" data-testid="server-download-msg">{msg}</p>}
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
        <p>Download your private content pack from your account, or import the file. It is stored on this device, and the app then works fully offline.</p>
        <ServerDownload onImported={onImported} />
        <p class="note">No server copy yet, or no connection? Import the file instead:</p>
        <PackImport secondary onImported={() => onImported()} />
        <p class="note">The pack is the <code>vocabula-pack.json</code> file built by <code>scripts/build-pack.ts</code>.</p>
      </main>
    </div>
  );
}

/** Profile → Cloud: sync status, server pack status, upload. */
function CloudPanel({ app, sync, onSyncNow }: { app: AppData; sync: SyncStatus; onSyncNow: () => void }) {
  const [server, setServer] = useState<PackStatus | 'auth' | 'unreachable' | null>(null);
  const [localHash, setLocalHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = async () => {
    setLocalHash(await localPackHash());
    const r = await serverPackStatus();
    setServer(r.kind === 'ok' ? r.data : r.kind === 'auth' ? 'auth' : 'unreachable');
  };
  useEffect(() => { void refresh(); }, [app.content.pack.builtAt]);
  const upload = async () => {
    setBusy(true); setMsg(null);
    const r = await uploadPackToServer();
    setBusy(false);
    if (r.kind === 'ok') setMsg({ ok: true, text: `Uploaded ${r.data.lemmas} words (${r.data.id}).` });
    else if (r.kind === 'no-pack') setMsg({ ok: false, text: 'No pack on this device.' });
    else if (r.kind === 'auth') setServer('auth');
    else setMsg({ ok: false, text: failureText(r) });
    void refresh();
  };
  const auth = server === 'auth' || sync.state === 'auth';
  return (
    <div class="panel" data-testid="cloud-panel">
      <h2>Cloud</h2>
      <dl class="kv">
        <dt>Sync</dt><dd data-testid="sync-status">{syncLabel(sync)}{sync.lastSync ? ` · last ${new Date(sync.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</dd>
        <dt>Server pack</dt>
        <dd data-testid="server-pack">
          {server === null ? 'Checking…'
            : server === 'auth' ? 'Sign-in expired'
            : server === 'unreachable' ? 'Can’t reach the server'
            : !server.present ? 'None yet'
            : `${server.id ?? 'pack'}, ${server.lemmas ?? '?'} words, updated ${server.updatedAt?.slice(0, 10) ?? '?'}${server.hash === localHash ? ' (same as this device)' : ' (differs from this device)'}`}
        </dd>
      </dl>
      {auth && <button type="button" class="btn secondary" onClick={signInAgain} data-testid="sign-in-again">Sign in again</button>}
      <button type="button" class="btn secondary" onClick={onSyncNow} disabled={sync.state === 'syncing'} data-testid="sync-now">Sync now</button>
      <button type="button" class="btn secondary" onClick={() => void upload()} disabled={busy} data-testid="upload-pack">
        {busy ? 'Uploading…' : 'Upload this device’s pack to the cloud'}
      </button>
      {msg && <p class={msg.ok ? 'okmsg' : 'err'} role="status" data-testid="upload-msg">{msg.text}</p>}
    </div>
  );
}

function SettingToggle({ app, setApp, k, label, sub, testid }: { app: AppData; setApp: (a: AppData) => void; k: string; label: string; sub: string; testid: string }) {
  const on = settingOn(app, k);
  const id = `setting-${k}`;
  return (
    <label class="toggle" for={id}>
      <span>{label}<span class="sub">{sub}</span></span>
      <input id={id} type="checkbox" role="switch" checked={on} data-testid={testid}
        onChange={() => { void recordSetting(app, k, !on).then(setApp); }} />
    </label>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProfileScreen({ app, setApp, onAbout, sync, onSyncNow }: {
  app: AppData; setApp: (a: AppData) => void; onAbout: () => void; sync: SyncStatus; onSyncNow: () => void;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const st = streakNow(app);
  const cards = [...app.state.cards.values()];
  const learned = new Set([...app.state.cards.keys()].map((k) => parseCardId(k)?.lemma).filter(Boolean)).size;
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
        <dt>Events not yet synced</dt><dd data-testid="outbox-count">{sync.queued}</dd>
      </dl>
      <div class="panel">
        <h2>Iter Latinum code for today</h2>
        <span class="code">{syncCodeToday(app)}</span>
      </div>

      <h2>Listening</h2>
      <SettingToggle app={app} setApp={setApp} k={SETTING_LISTENING} testid="setting-listening"
        label="Listening exercises" sub="Hear a word or sentence, then choose its meaning, type it or build it. Only when the audio can play." />
      <SettingToggle app={app} setApp={setApp} k={SETTING_AUTOPLAY} testid="setting-autoplay"
        label="Autoplay audio" sub="Play new words and listening clips without a tap." />
      <p class="note">Pronunciation: eSpeak NG’s Latin voice (restored classical). Clips are kept on this device once heard.</p>

      <CloudPanel app={app} sync={sync} onSyncNow={onSyncNow} />

      <h2>Backup</h2>
      <p class="note">Your progress is a log of events stored on this device. Export it to keep a copy or move it to another device; importing merges, so nothing is duplicated.</p>
      <button type="button" class="btn secondary" onClick={() => download(`vocabula-backup-${new Date().toISOString().slice(0, 10)}.json`, exportBackupText(app))}>
        Export backup
      </button>
      <label class="btn secondary filebtn">Import backup…
        <input type="file" accept=".json,application/json" onChange={doImport} />
      </label>
      {msg && <p class={msg.ok ? 'okmsg' : 'err'} role="status">{msg.text}</p>}

      <FlagsPanel app={app} />

      <h2>Content pack</h2>
      <p class="note">Installed: {app.content.pack.id}, {app.content.pack.counts.lemmas} words, built {app.content.pack.builtAt.slice(0, 10)}.</p>
      <PackImport replacing onImported={() => location.reload()} />

      <a class="btn secondary" href="#/compare" data-testid="voice-test">Voice test</a>
      <button type="button" class="btn secondary" onClick={onAbout}>About & credits</button>
    </main>
  );
}

/** Flagged exercises (synced events), newest first. */
function FlagsPanel({ app }: { app: AppData }) {
  const flags = [...app.state.flags].reverse();
  return (
    <>
      <h2>Flags</h2>
      {flags.length === 0
        ? <p class="note">Nothing flagged. Use the flag button in a lesson to report a wrong answer, bad Latin or bad English.</p>
        : (
          <ul class="flaglist" data-testid="flag-list">
            {flags.map((f) => (
              <li key={f.id}>
                <span class="fr">{FLAG_LABEL[f.reason] ?? f.reason} · {new Date(f.ts).toISOString().slice(0, 10)}</span>
                <span class="fref">{f.ref}</span>
                {f.shown && <span class="fshown">{f.shown}</span>}
                {f.note && <span class="fnote">“{f.note}”</span>}
              </li>
            ))}
          </ul>
        )}
    </>
  );
}

export function WordsScreen({ app, onLectio }: { app: AppData; onLectio?: (id: string) => void }) {
  const doneNodes = app.path.nodes.filter((n) => app.state.done.has(n.id));
  const ids = [...new Set(doneNodes.flatMap((n) => n.newWords))];
  // Words met as Familia Rōmāna previews (meaning only), tagged "FR".
  const previewed = new Set(doneNodes.filter((n) => n.kind === 'fr').flatMap((n) => n.newWords));
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
                <span class="w" lang="la">{citation(w.lemma)}{w.lemma.gender ? `, ${w.lemma.gender}.` : ''}
                  {previewed.has(id) && <span class="frtag" title="Familia Rōmāna preview" lang="en">FR</span>}</span>
                <span class="g">{w.lemma.gloss}</span>
              </li>
            );
          })}
        </ul>
      )}
      {onLectio && <LectioList app={app} passages={lectioPassages()} onOpen={onLectio} />}
    </main>
  );
}

/** One line per recording the Audītiō lessons use (same recording once). */
const AUDIO_CREDITS = [...new Map(listeningLessons().map((l) => [l.audio.key, { key: l.audio.key, title: l.audio.title, reader: l.audio.reader, url: l.audio.record_url }])).values()];

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
      <p>
        <span lang="la">Familia Rōmāna</span> preview words (Hans H. Ørberg, <i>Lingua Latina per se illustrata</i>) come from your own copy,
        through the same private content pack: only each word’s headword and gloss, never the book’s text, and never part of this site.
      </p>
      <p data-testid="credits-audio">
        <span lang="la">Audītiō</span> recordings and their Latin texts are from <strong>Dickinson College Commentaries</strong>{' '}
        (<a href="https://dcc.dickinson.edu">dcc.dickinson.edu</a>; Audio Credit: DCC), licensed{' '}
        <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA</a> (Attribution-ShareAlike), re-encoded for the app:
      </p>
      <ul class="credits-list">
        {AUDIO_CREDITS.map((c) => (
          <li key={c.key}><a href={c.url}>“{c.title}”</a>, read by <strong>{c.reader}</strong>.</li>
        ))}
      </ul>
      <p>
        Texts: <i lang="la">Navigatio Sancti Brendani</i>, DCC edition by William Turpin; Jerome, <i lang="la">Vita Malchi</i>;
        <i lang="la"> Elegiac Romulus</i>. The lessons’ glosses and questions are original and shared under the same license.
      </p>
      <p>Grammar chapters, grammar cards, glossary, practice sentences and <span lang="la">Lectiō</span> reading passages are original writing for this app.</p>
      <p>Scheduling uses the FSRS algorithm via <a href="https://github.com/open-spaced-repetition/ts-fsrs">ts-fsrs</a> (MIT).</p>
      <p>Fonts: Cinzel, EB Garamond and Figtree (SIL Open Font License), loaded from Google Fonts when online.</p>
    </main>
  );
}
