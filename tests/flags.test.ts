/**
 * Flag events and sentence review events: validation (shared parseEvent, also used by the
 * Worker), replay, backup, server acceptance and sync between two devices.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parseEvent } from '../src/engine/eventShape.ts';
import { replay, stateFingerprint, type FlagBody, type VEvent } from '../src/engine/events.ts';
import { makeBackup, parseBackup } from '../src/engine/backup.ts';
import { syncOnce, type SyncStore } from '../src/sync/sync.ts';
import type { FetchFn } from '../src/sync/http.ts';
import { handleApi, type ApiEnv } from '../worker/api.ts';
import { FakeD1 } from './d1fake.ts';
import { flagRef, flagShown } from '../src/ui/Flag.tsx';
import type { Exercise } from '../src/engine/lesson.ts';
import { audioFlagBody, engineName, reportAudio, setAudioReporter } from '../src/ui/AudioReport.tsx';
import { geminiAudioKey } from '../src/audio/key.ts';

const T = Date.parse('2026-11-04T09:00:00Z');
const flag = (id: string, body: Partial<FlagBody> | unknown, ts = T): VEvent =>
  ({ id, device: 'phone', ts, kind: 'flag', body: body as FlagBody });
const good: FlagBody = { ref: 'sent:s02-01:la', reason: 'bad-latin', note: 'word order?', shown: 'Translate into Latin: …', node: 's2.rep.1' };

describe('flag events: validation', () => {
  it('accepts a flag with ref + reason (note, shown, node optional)', () => {
    expect(parseEvent(flag('f1', good), 0)).toEqual(flag('f1', good));
    expect(parseEvent(flag('f2', { ref: 'amo-v1:meaning', reason: 'wrong-answer' }), 0).body).toEqual({ ref: 'amo-v1:meaning', reason: 'wrong-answer' });
    for (const reason of ['wrong-answer', 'bad-latin', 'bad-english', 'other']) expect(() => parseEvent(flag('f', { ref: 'x', reason }), 0)).not.toThrow();
  });
  it('rejects a missing or bad body, ref, reason, note or shown', () => {
    const bad: unknown[] = [
      undefined, null, [], 'text',
      { reason: 'other' }, { ref: '', reason: 'other' }, { ref: 'x'.repeat(257), reason: 'other' }, { ref: 7, reason: 'other' },
      { ref: 'x' }, { ref: 'x', reason: 'rude' },
      { ref: 'x', reason: 'other', note: 5 }, { ref: 'x', reason: 'other', note: 'n'.repeat(1001) },
      { ref: 'x', reason: 'other', shown: 's'.repeat(501) }, { ref: 'x', reason: 'other', node: 9 },
    ];
    for (const b of bad) expect(() => parseEvent(flag('f', b), 3), JSON.stringify(b)).toThrow(/Invalid event at index 3: (flag|body)/);
  });
  it('sentence review events need no new kind: card sent:<id>:<type>', () => {
    const e: VEvent = { id: 'r1', device: 'phone', ts: T, kind: 'review', card: 'sent:s05-04:cloze', grade: 'again' };
    expect(parseEvent(e, 0)).toEqual(e);
  });
});

describe('flag events: replay and backup', () => {
  it('replay lists flags in (ts, id) order and leaves everything else alone', () => {
    const base: VEvent[] = [{ id: 'r', device: 'd', ts: T, kind: 'review', card: 'amo-v1:meaning', grade: 'good' }];
    const withFlags = [...base, flag('f-b', { ref: 'b', reason: 'other' }, T + 2), flag('f-a', good, T + 1)];
    const s = replay(withFlags);
    expect(s.flags.map((f) => f.id)).toEqual(['f-a', 'f-b']);
    expect(s.flags[0]).toMatchObject({ ...good, ts: T + 1 });
    const plain = replay(base);
    expect(s.puncta).toBe(plain.puncta);
    expect(s.reviewCount).toBe(plain.reviewCount);
    expect([...s.cards.keys()]).toEqual([...plain.cards.keys()]);
    expect(stateFingerprint(s)).not.toBe(stateFingerprint(plain));
    expect(stateFingerprint(replay([...withFlags].reverse()))).toBe(stateFingerprint(s));
  });
  it('round-trips through a backup', () => {
    const evs = [flag('f1', good)];
    expect(parseBackup(JSON.parse(JSON.stringify(makeBackup(evs, 'phone'))))).toEqual(evs);
  });
});

describe('flag refs', () => {
  it('point at the card, the new word or the grammar card', () => {
    expect(flagRef({ id: 'x1', type: 'intro', kind: 'intro', lemma: 'amo-v1' })).toBe('lemma:amo-v1');
    expect(flagRef({ id: 'x1', type: 'grammar', kind: 'grammar', section: 3 })).toBe('grammar:3');
    const choice = { id: 'x2', type: 'choice', kind: 'meaning', lemma: 'amo-v1', card: 'amo-v1:meaning', prompt: 'What does this mean?', cue: 'amō, amāre', cueLa: true, options: [{ id: 'a', text: 'to love' }], answer: ['a'], multi: false, note: '' } satisfies Exercise;
    expect(flagRef(choice)).toBe('amo-v1:meaning');
    expect(flagShown(choice)).toBe('What does this mean? amō, amāre [to love]');
  });
});

/* ---------------- through the server ---------------- */

const AUD = 'aud';
const EMAIL = 'joshua.a.wallin@gmail.com';
let env: ApiEnv;
const serverFetch: FetchFn = async (input, init) =>
  handleApi(new Request(`https://vocabula.test${input}`, init), env, { access: { aud: AUD, getIdentity: async () => ({ email: EMAIL }) } });
beforeEach(() => { env = { DB: new FakeD1(), ALLOWED_EMAILS: EMAIL, ACCESS_AUD: AUD }; });

class MemDevice implements SyncStore {
  events = new Map<string, VEvent>();
  cursor = 0;
  constructor(readonly name: string) {}
  record(e: Omit<VEvent, 'device' | 'outbox'>) { this.events.set(e.id, { ...e, device: this.name, outbox: 1 }); }
  async outbox() { return [...this.events.values()].filter((e) => e.outbox === 1); }
  async markSent(ids: readonly string[]) { for (const id of ids) { const e = this.events.get(id); if (e) e.outbox = 0; } }
  async addRemote(evs: readonly VEvent[]) {
    let n = 0;
    for (const e of evs) if (!this.events.has(e.id)) { this.events.set(e.id, { ...e, outbox: 0 }); n++; }
    return n;
  }
  async getCursor() { return this.cursor; }
  async setCursor(c: number) { this.cursor = c; }
}

describe('flag events: server and sync', () => {
  it('POST /api/events accepts flags and sentence reviews, rejects a bad flag', async () => {
    const post = (events: unknown[]) => serverFetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }) });
    const ok = await post([flag('f1', good), { id: 'r1', device: 'phone', ts: T, kind: 'review', card: 'sent:s02-01:la', grade: 'good' }]);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ accepted: 2 });
    const bad = await post([flag('f2', { ref: 'x', reason: 'spam' })]);
    expect(bad.status).toBe(422);
    const got = await (await serverFetch('/api/events?after=0', {})).json() as { events: VEvent[] };
    expect(got.events.map((e) => e.kind)).toEqual(['flag', 'review']);
    expect(got.events[0]!.body).toEqual(good);
  });
  it('a flag made on one device shows on the other after sync', async () => {
    const phone = new MemDevice('phone');
    const laptop = new MemDevice('laptop');
    phone.record({ id: 'f1', ts: T, kind: 'flag', body: good });
    phone.record({ id: 'r1', ts: T + 1, kind: 'review', card: 'sent:s02-01:la', grade: 'again' });
    expect((await syncOnce(phone, serverFetch)).kind).toBe('ok');
    expect(await syncOnce(laptop, serverFetch)).toMatchObject({ kind: 'ok', pulled: 2 });
    const a = replay([...phone.events.values()]);
    const b = replay([...laptop.events.values()]);
    expect(b.flags).toEqual(a.flags);
    expect(b.flags[0]).toMatchObject({ ref: 'sent:s02-01:la', reason: 'bad-latin', note: 'word order?' });
    expect(b.cards.has('sent:s02-01:la')).toBe(true);
    expect(stateFingerprint(a)).toBe(stateFingerprint(b));
  });
});

describe('bad-audio flags', () => {
  it('a speaker report: ref audio:<key that played>, the clip text, an optional note; valid on the wire', () => {
    const k = geminiAudioKey('Vērī amīcī semper iuvant.');
    const b = audioFlagBody({ text: 'vērī amīcī semper iuvant.' }, k, '  c like ch  ');
    expect(b).toEqual({ ref: `audio:${k}`, reason: 'bad-audio', shown: 'vērī amīcī semper iuvant.', note: 'c like ch' });
    expect(parseEvent(flag('fa', b), 0).body).toEqual(b);
    expect(audioFlagBody({ text: 'x'.repeat(900) }, k).shown).toHaveLength(500);
    expect(engineName(k)).toBe('Gemini');
    expect(engineName('0123456789abcdef01234567')).toBe('eSpeak');
    expect(replay([flag('fa', b)]).flags[0]).toMatchObject({ reason: 'bad-audio', ref: `audio:${k}` });
  });
  it('reports go to the registered reporter only', () => {
    const got: FlagBody[] = [];
    expect(reportAudio(audioFlagBody({ text: 'a' }, 'k'))).toBe(false);
    setAudioReporter((b) => got.push(b));
    expect(reportAudio(audioFlagBody({ text: 'a' }, 'k'))).toBe(true);
    setAudioReporter(null);
    expect(got).toHaveLength(1);
  });
});
