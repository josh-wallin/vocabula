import { describe, expect, it } from 'vitest';
import { compareAnswer, normalizeAnswer, rng, shuffle } from '../src/engine/util.ts';
import { canonical, replay, stateFingerprint, streak, PUNCTA_PER_GOOD_REVIEW, PUNCTA_PER_LESSON, type VEvent } from '../src/engine/events.ts';
import { review, retrievability, State, cardId, parseCardId, isDue } from '../src/engine/srs.ts';
import { makeBackup, mergeEvents, newEvents, parseBackup } from '../src/engine/backup.ts';
import { decodeSyncCode, encodeSyncCode } from '../src/engine/syncCode.ts';
import { GLOSSARY, termIfUnlocked, unlockedTerms } from '../src/content/glossary.ts';
import { GRAMMAR_CARDS, termsIn, segments } from '../src/content/grammarCards.ts';
import { makePack, parsePack } from '../src/data/pack.ts';
import { FIX_WHEELOCK } from './fixtures.ts';

describe('answer comparison', () => {
  it('is NFC, trimmed and case-insensitive', () => {
    const decomposed = 'pecūnia'; // u + combining macron
    expect(compareAnswer(decomposed, 'pecūnia')).toEqual({ ok: true, macronMiss: false, expected: 'pecūnia' });
    expect(compareAnswer('  Pecūnia  ', 'pecūnia').ok).toBe(true);
    expect(compareAnswer('PECŪNIA', 'pecūnia').macronMiss).toBe(false);
  });
  it('accepts a missing macron with a reminder', () => {
    expect(compareAnswer('pecunia', 'pecūnia')).toEqual({ ok: true, macronMiss: true, expected: 'pecūnia' });
    expect(compareAnswer('rosarum', 'rosārum').macronMiss).toBe(true);
  });
  it('flags a wrong extra macron but still accepts', () => {
    expect(compareAnswer('rosā', 'rosa')).toMatchObject({ ok: true, macronMiss: true });
  });
  it('rejects wrong answers and empty input', () => {
    expect(compareAnswer('rosae', 'rosārum').ok).toBe(false);
    expect(compareAnswer('', 'rosa').ok).toBe(false);
  });
  it('accepts any of several spellings', () => {
    expect(compareAnswer('adiuvo', ['iuvō', 'adiuvō'])).toMatchObject({ ok: true, macronMiss: true, expected: 'adiuvō' });
  });
  it('ignores trailing punctuation for commands', () => {
    expect(normalizeAnswer('Valē!')).toBe('valē');
  });
});

describe('FSRS integration', () => {
  const t = new Date('2026-11-03T09:00:00Z');
  it('Good on a new card schedules it later; Again keeps it soon', () => {
    const good = review(undefined, t, 'good');
    const again = review(undefined, t, 'again');
    expect(good.reps).toBe(1);
    expect(good.due.getTime()).toBeGreaterThan(again.due.getTime());
    expect(good.state).not.toBe(State.New);
  });
  it('retrievability decays and graduation reaches Review', () => {
    let c = review(undefined, t, 'good');
    c = review(c, new Date(t.getTime() + 15 * 60_000), 'good');
    expect(c.state).toBe(State.Review);
    expect(isDue(c, new Date(t.getTime() + 60_000))).toBe(false);
    const r1 = retrievability(c, new Date(t.getTime() + 86400_000));
    const r2 = retrievability(c, new Date(t.getTime() + 20 * 86400_000));
    expect(r1).toBeGreaterThan(r2);
  });
  it('card ids round-trip', () => {
    expect(parseCardId(cardId('rosa-n1', 'forms', 'n1'))).toEqual({ lemma: 'rosa-n1', kind: 'forms', feature: 'n1' });
    expect(parseCardId('rosa-n1:meaning')).toEqual({ lemma: 'rosa-n1', kind: 'meaning' });
    expect(parseCardId('rosa-n1:bogus')).toBeNull();
  });
});

const T = Date.parse('2026-11-03T15:00:00Z');
function sampleEvents(): VEvent[] {
  const evs: VEvent[] = [];
  const cards = ['a-v1:meaning', 'b-v1:meaning', 'a-v1:class', 'c-n1:forms:n1'];
  let i = 0;
  for (let day = 0; day < 4; day++) {
    for (const c of cards) {
      evs.push({ id: `e${String(i).padStart(3, '0')}`, device: i % 2 ? 'phone' : 'laptop', ts: T + day * 86400_000 + i * 1000, kind: 'review', card: c, grade: i % 3 ? 'good' : 'again' });
      i++;
    }
    evs.push({ id: `n${day}`, device: 'phone', ts: T + day * 86400_000 + 99_000, kind: 'node_done', body: { node: `s1.n${day}`, run: `r${day}`, stats: { exercises: 10, graded: 8, firstTryCorrect: 6, newWords: ['a-v1'], reviews: 8 } } });
  }
  // Two events with the same timestamp: tie broken by id.
  evs.push({ id: 'tie-b', device: 'x', ts: T, kind: 'review', card: 'b-v1:meaning', grade: 'good' });
  evs.push({ id: 'tie-a', device: 'y', ts: T, kind: 'review', card: 'b-v1:meaning', grade: 'again' });
  evs.push({ id: 's1', device: 'x', ts: T + 5, kind: 'setting', body: { key: 'theme', value: 'light' } });
  return evs;
}

describe('event replay', () => {
  it('is deterministic regardless of insertion order (and duplicates)', () => {
    const evs = sampleEvents();
    const base = stateFingerprint(replay(evs));
    for (let seed = 1; seed <= 25; seed++) {
      const shuffled = shuffle(evs, rng(seed));
      expect(stateFingerprint(replay(shuffled))).toBe(base);
    }
    expect(stateFingerprint(replay([...evs, ...shuffle(evs, rng(99)).slice(0, 7)]))).toBe(base);
  });
  it('derives progress, puncta and settings', () => {
    const s = replay(sampleEvents());
    expect([...s.done].sort()).toEqual(['s1.n0', 's1.n1', 's1.n2', 's1.n3']);
    const goods = sampleEvents().filter((e) => e.kind === 'review' && e.grade === 'good').length;
    expect(s.puncta).toBe(4 * PUNCTA_PER_LESSON + goods * PUNCTA_PER_GOOD_REVIEW);
    expect(s.settings.theme).toBe('light');
    expect(s.lessons.map((l) => l.node)).toEqual(['s1.n0', 's1.n1', 's1.n2', 's1.n3']);
  });
  it('canonical() sorts by (ts, id)', () => {
    const c = canonical(sampleEvents());
    expect(c.findIndex((e) => e.id === 'tie-a')).toBeLessThan(c.findIndex((e) => e.id === 'tie-b'));
  });
});

describe('streak', () => {
  const days = (...d: string[]) => new Set(d);
  it('counts consecutive days, today optional', () => {
    expect(streak(days('2026-11-01', '2026-11-02', '2026-11-03'), '2026-11-03').count).toBe(3);
    expect(streak(days('2026-11-01', '2026-11-02'), '2026-11-03').count).toBe(2);
    expect(streak(days(), '2026-11-03').count).toBe(0);
  });
  it('bridges up to 2 missed days per week with freezes', () => {
    // Mon 2 Nov, (Tue 3 missed), Wed 4, Thu 5
    const s = streak(days('2026-11-02', '2026-11-04', '2026-11-05'), '2026-11-05');
    expect(s.count).toBe(3);
    expect(s.frozen).toEqual(['2026-11-03']);
    // three misses in one week break it
    const b = streak(days('2026-11-02', '2026-11-06'), '2026-11-06');
    expect(b.count).toBe(1);
  });
  it('a streak too old to bridge is zero', () => {
    expect(streak(days('2026-10-01'), '2026-11-03').count).toBe(0);
  });
});

describe('backup', () => {
  it('export → import is idempotent and merges by id', () => {
    const evs = sampleEvents().map((e) => ({ ...e, outbox: 1 as const }));
    const b = JSON.parse(JSON.stringify(makeBackup(evs, 'phone')));
    const parsed = parseBackup(b);
    expect(parsed.every((e) => !('outbox' in e))).toBe(true);
    expect(newEvents(evs, parsed)).toEqual([]);
    const half = evs.slice(0, 5);
    const fresh = newEvents(half, parsed);
    expect(fresh.length).toBe(evs.length - 5);
    const merged = mergeEvents(half, fresh);
    expect(stateFingerprint(replay(merged))).toBe(stateFingerprint(replay(evs)));
    // importing twice adds nothing
    expect(newEvents(merged, parsed)).toEqual([]);
  });
  it('rejects malformed backups', () => {
    expect(() => parseBackup({ format: 'nope' })).toThrow();
    expect(() => parseBackup({ format: 'vocabula-events', version: 1, events: [{ id: 1 }] })).toThrow(/index 0/);
  });
});

describe('sync code', () => {
  it('round-trips', () => {
    const s = { date: '2026-11-03', lessons: 3, newWords: 12, reviews: 41 };
    const code = encodeSyncCode(s);
    expect(code).toMatch(/^VOC1-[A-Za-z0-9_-]+-[0-9a-f]{6}$/);
    expect(decodeSyncCode(code)).toEqual(s);
    expect(code.length).toBeLessThan(80);
  });
  it('detects tampering', () => {
    const code = encodeSyncCode({ date: '2026-11-03', lessons: 1, newWords: 0, reviews: 5 });
    const bad = code.slice(0, 8) + (code[8] === 'A' ? 'B' : 'A') + code.slice(9);
    expect(() => decodeSyncCode(bad)).toThrow();
    expect(() => decodeSyncCode('XYZ')).toThrow(/VOC1/);
  });
});

describe('glossary', () => {
  it('has 15–25 terms for sections 1–4 (a few more for 5–8) with unique ids and all fields', () => {
    const early = GLOSSARY.filter((t) => t.section <= 4);
    expect(early.length).toBeGreaterThanOrEqual(15);
    expect(early.length).toBeLessThanOrEqual(25);
    expect(GLOSSARY.length).toBeLessThanOrEqual(32);
    expect(new Set(GLOSSARY.map((t) => t.id)).size).toBe(GLOSSARY.length);
    for (const t of GLOSSARY) for (const k of ['name', 'latin', 'def', 'ex', 'exEn'] as const) expect(t[k].length, `${t.id}.${k}`).toBeGreaterThan(0);
  });
  it('gates terms by section', () => {
    expect(termIfUnlocked('genitive', 1)).toBeNull();
    expect(termIfUnlocked('genitive', 2)?.name).toBe('Genitive');
    expect(termIfUnlocked('neuter', 3)).toBeNull();
    expect(termIfUnlocked('neuter', 4)).not.toBeNull();
    expect(unlockedTerms(1).every((t) => t.section === 1)).toBe(true);
    expect(termIfUnlocked('no-such-term', 4)).toBeNull();
  });
  it('grammar cards only reference terms unlocked by their own section', () => {
    for (const c of GRAMMAR_CARDS) {
      for (const id of termsIn(c)) {
        expect(termIfUnlocked(id, c.section), `card ${c.section} → ${id}`).not.toBeNull();
      }
    }
  });
  it('parses term and Latin markup', () => {
    expect(segments('The [[stem|stem]] of *amō*.')).toEqual([
      { text: 'The ' }, { text: 'stem', term: 'stem' }, { text: ' of ' }, { text: 'amō', la: true }, { text: '.' },
    ]);
  });
});

describe('content pack', () => {
  it('validates schema and counts', () => {
    const p = JSON.parse(JSON.stringify(makePack(FIX_WHEELOCK, [1, 2, 3, 4])));
    expect(parsePack(p).counts.lemmas).toBe(FIX_WHEELOCK.length);
    expect(() => parsePack({ ...p, schema: 99 })).toThrow(/schema/);
    expect(() => parsePack({ ...p, format: 'x' })).toThrow(/not a Vocābula content pack/);
    expect(() => parsePack({ ...p, counts: { ...p.counts, lemmas: 3 } })).toThrow(/contains/);
    expect(() => parsePack({ ...p, lemmas: p.lemmas.slice(1), counts: { ...p.counts, lemmas: p.lemmas.length - 1 } })).toThrow(/mismatch/);
  });
});
