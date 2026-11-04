/**
 * Voice test (#/compare, linked from Profile): the same Latin through eSpeak NG, OpenAI
 * (respelled and plain) and Gemini, side by side, with a 1–5 rating, "wrong sound" boxes
 * and a note per player. Nothing is generated until the owner taps Generate; clips are
 * cached on the server, so each costs once. Ratings go to the server (/api/tts/rating).
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { COMPARE_ITEMS, type CompareItem } from '../compare/items.ts';
import { toPseudo } from '../compare/pseudo.ts';
import { espeakUrl } from '../compare/espeakUrl.ts';
import {
  COLUMNS, PROBLEMS, SECRET_HELP, TTS_API, summarize,
  type Problem, type TtsClipInfo, type TtsRating, type TtsRatingRow, type TtsStatus,
} from '../compare/protocol.ts';
import { apiFetch, failureText, signInAgain } from '../sync/http.ts';
import { IconBack } from './icons.tsx';
import './compare.css';

export const COMPARE_HASH = '#/compare';

type Column = (typeof COLUMNS)[number];
const clipId = (engine: string, variant: string, text: string) => `${engine}|${variant}|${text}`;
const ratingId = (item: string, engine: string, variant: string) => `${item}|${engine}|${variant}`;

const PROBLEM_LABEL: Record<Problem, string> = { c: 'c', v: 'v', ae: 'ae', length: 'length', stress: 'stress', other: 'other' };

export function ComparePage({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<TtsStatus | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [auth, setAuth] = useState(false);
  const [clips, setClips] = useState<Map<string, string>>(new Map());
  const [ratings, setRatings] = useState<Map<string, TtsRating>>(new Map());

  useEffect(() => {
    void (async () => {
      const [s, c, r] = await Promise.all([
        apiFetch<TtsStatus>(TTS_API.status),
        apiFetch<{ clips: TtsClipInfo[] }>(TTS_API.cache),
        apiFetch<{ ratings: TtsRatingRow[] }>(TTS_API.ratings),
      ]);
      for (const x of [s, c, r]) {
        if (x.kind !== 'ok' && x.kind !== 'not-modified') { setLoadErr(failureText(x)); setAuth(x.kind === 'auth'); return; }
      }
      if (s.kind === 'ok') setStatus(s.data);
      if (c.kind === 'ok') setClips(new Map(c.data.clips.map((k) => [clipId(k.engine, k.variant, k.text), k.key])));
      if (r.kind === 'ok') setRatings(new Map(r.data.ratings.map((k) => [ratingId(k.item, k.engine, k.variant), k])));
    })();
  }, []);

  const summary = useMemo(() => summarize([...ratings.values()]), [ratings]);

  return (
    <div class="screen" data-screen="compare">
      <header class="lesson-head">
        <button type="button" class="iconbtn" aria-label="Back" onClick={onBack}><IconBack /></button>
        <span class="lesson-tag">Voice test</span>
      </header>
      <div class="scroll">
        <main class="page cmp">
          <h1>Voice test</h1>
          <p class="note">
            Which engine sounds most like restored classical Latin? Each line plays through eSpeak NG, OpenAI
            (text respelled: k, w, y, doubled long vowels, stressed syllable in CAPITALS), OpenAI (plain Latin with
            instructions) and Gemini. Tap <b>Generate</b> to make a clip (once; it’s then cached), listen, and rate it.
          </p>
          {loadErr && (
            <div class="err" role="alert" data-testid="compare-error">
              {loadErr}
              {auth && <button type="button" class="btn secondary small" onClick={signInAgain}>Sign in again</button>}
            </div>
          )}
          {status && (!status.openai || !status.gemini) && (
            <p class="note" data-testid="compare-keys">
              Missing: {[!status.openai && 'OPENAI_API_KEY', !status.gemini && 'GEMINI_API_KEY'].filter(Boolean).join(', ')}. {SECRET_HELP}
            </p>
          )}

          <section class="panel" data-testid="compare-summary">
            <h2>Summary</h2>
            <table class="cmp-sum">
              <thead><tr><th>Engine</th><th>Avg</th><th>Rated</th><th>Most reported</th></tr></thead>
              <tbody>
                {summary.map((c) => (
                  <tr key={c.id} data-col={c.id}>
                    <td>{c.label}</td>
                    <td class="num">{c.average === null ? '—' : c.average.toFixed(2)}</td>
                    <td class="num">{c.rated}/{COMPARE_ITEMS.length}</td>
                    <td>{c.problems.length ? c.problems.slice(0, 3).map(([p, n]) => `${PROBLEM_LABEL[p]} ×${n}`).join(', ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {COMPARE_ITEMS.map((it, i) => (
            <ItemCard key={it.id} n={i + 1} item={it} clips={clips} ratings={ratings}
              onClip={(id, key) => setClips((m) => new Map(m).set(id, key))}
              onRated={(r) => setRatings((m) => new Map(m).set(ratingId(r.item, r.engine, r.variant), r))} />
          ))}
        </main>
      </div>
    </div>
  );
}

function ItemCard({ n, item, clips, ratings, onClip, onRated }: {
  n: number; item: CompareItem; clips: Map<string, string>; ratings: Map<string, TtsRating>;
  onClip: (id: string, key: string) => void; onRated: (r: TtsRating) => void;
}) {
  return (
    <section class="panel cmp-item" data-item={item.id}>
      <div class="cmp-head">
        <span class="cmp-n">{n}</span>
        <p class="cmp-la" lang="la">{item.la}</p>
      </div>
      <p class="small">{item.listen}</p>
      <p class="small cmp-pseudo">Respelled: <span>{toPseudo(item.la)}</span></p>
      <div class="cmp-grid">
        {COLUMNS.map((c) => (
          <Player key={c.id} item={item} col={c} clipKey={clips.get(clipId(c.engine, c.variant, item.la))}
            rating={ratings.get(ratingId(item.id, c.engine, c.variant))} onClip={onClip} onRated={onRated} />
        ))}
      </div>
    </section>
  );
}

function Player({ item, col, clipKey, rating, onClip, onRated }: {
  item: CompareItem; col: Column; clipKey: string | undefined; rating: TtsRating | undefined;
  onClip: (id: string, key: string) => void; onRated: (r: TtsRating) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<'saved' | 'error' | null>(null);
  const [note, setNote] = useState(rating?.note ?? '');
  useEffect(() => { setNote(rating?.note ?? ''); }, [rating?.note]);

  // eSpeak: the clip URL is derived from the text; the audio branch serves it if rendered.
  useEffect(() => {
    if (col.engine !== 'espeak') return;
    let live = true;
    void espeakUrl(item.la).then((u) => { if (live) setSrc(u); });
    return () => { live = false; };
  }, [col.engine, item.la]);
  const url = col.engine === 'espeak' ? src : src ?? (clipKey ? TTS_API.audio + clipKey : null);
  useEffect(() => () => { if (src?.startsWith('blob:')) URL.revokeObjectURL(src); }, [src]);

  const generate = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(TTS_API.base, {
        method: 'POST', credentials: 'same-origin', redirect: 'manual', cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engine: col.engine, variant: col.variant, text: item.la }),
      });
      if (res.type === 'opaqueredirect' || res.status === 0 || res.status === 401) { setErr('Your sign-in has expired.'); return; }
      const ct = res.headers.get('content-type') ?? '';
      if (!res.ok || !ct.startsWith('audio/')) {
        let msg = `Server error ${res.status}`;
        let help = '';
        try { const j = (await res.json()) as { error?: string; help?: string }; msg = j.error ?? msg; help = j.help ?? ''; } catch { /* keep */ }
        setErr(help ? `${msg}. ${help}` : msg);
        return;
      }
      const key = res.headers.get('x-tts-key');
      setSrc(URL.createObjectURL(await res.blob()));
      if (key) onClip(clipId(col.engine, col.variant, item.la), key);
    } catch {
      setErr('You’re offline (or the server can’t be reached).');
    } finally { setBusy(false); }
  };

  const save = async (patch: Partial<TtsRating>) => {
    const r: TtsRating = {
      item: item.id, engine: col.engine, variant: col.variant,
      score: rating?.score ?? null, problems: rating?.problems ?? [], note, ...patch,
    };
    onRated(r);
    const res = await apiFetch<{ ok: boolean }>(TTS_API.rating, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r),
    });
    setSaved(res.kind === 'ok' ? 'saved' : 'error');
  };

  const score = rating?.score ?? null;
  const problems = new Set(rating?.problems ?? []);
  const name = `${item.id}-${col.id}`;
  return (
    <div class="cmp-player" data-col={col.id}>
      <div class="cmp-player-head">
        <span class="cmp-label">{col.label}</span>
        {col.engine !== 'espeak' && !url && (
          <button type="button" class="btn small" disabled={busy} onClick={() => void generate()} data-testid="generate">
            {busy ? 'Generating…' : 'Generate'}
          </button>
        )}
      </div>
      {url
        ? <audio controls preload="none" src={url} onError={() => { if (col.engine === 'espeak') setErr('No eSpeak clip for this text yet.'); }} />
        : col.engine !== 'espeak' && <p class="small">Not generated yet.</p>}
      {err && <p class="small cmp-err" role="alert">{err}</p>}
      <div class="cmp-score" role="radiogroup" aria-label={`Rating for ${col.label}`}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} type="button" role="radio" aria-checked={score === s} class={score === s ? 'on' : ''}
            onClick={() => void save({ score: score === s ? null : s })}>{s}</button>
        ))}
      </div>
      <fieldset class="cmp-probs">
        <legend>Wrong sound</legend>
        {PROBLEMS.map((p) => (
          <label key={p}>
            <input type="checkbox" name={`${name}-p`} checked={problems.has(p)}
              onChange={(e) => {
                const on = (e.target as HTMLInputElement).checked;
                const next = PROBLEMS.filter((q) => (q === p ? on : problems.has(q)));
                void save({ problems: next });
              }} />
            {PROBLEM_LABEL[p]}
          </label>
        ))}
      </fieldset>
      <textarea class="cmp-note" rows={2} placeholder="Note" aria-label={`Note for ${col.label}`} value={note}
        onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
        onBlur={() => { if (note !== (rating?.note ?? '')) void save({ note }); }} />
      {saved && <span class={`small ${saved === 'error' ? 'cmp-err' : 'cmp-ok'}`} role="status">{saved === 'saved' ? 'Saved' : 'Not saved (offline or signed out)'}</span>}
    </div>
  );
}
