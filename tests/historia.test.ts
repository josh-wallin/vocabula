/**
 * Historia entries (content/historia/*.json: Suetonius, public-domain Latin; original glosses,
 * translations, essays and questions). Schema and tracing, grading, events, the Worker and the
 * audio manifest always run; the lexicon check (app ids are real words of the app, spelled the
 * same; no app word left unmarked) needs the private pack and is skipped without it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { historiaEntries } from '../src/content/historia.ts';
import {
  essayWords, gradeHistoria, historiaAudioTexts, historiaLatin, historiaNode, historiaQuestionCard, historiaSpeech, knownShare,
  headIndex, learnerKnownIds, optionOrder, tokenIds, parseHistoriaCard, parseHistoriaEntry, tokenKnown, tokensSourceText, type HistoriaEntry,
} from '../src/engine/historia.ts';
import { parseEvent } from '../src/engine/eventShape.ts';
import { replay, type VEvent } from '../src/engine/events.ts';
import { parseCardId } from '../src/engine/srs.ts';
import { parseListenCard } from '../src/engine/lesson.ts';
import { parseSentenceCard } from '../src/engine/sentences.ts';
import { parseAuditCard } from '../src/engine/listening.ts';
import { audioItems, EXTRA_AUDIO_TEXTS, formAudio } from '../src/audio/items.ts';
import { audioKey } from '../src/audio/key.ts';
import { historiaTexts, listeningWordTexts } from '../scripts/audio-manifest.ts';
import { stripMacrons } from '../src/morph/phonology.ts';
import { analyze } from '../src/morph/analyze.ts';
import { buildLexicon } from '../src/engine/lexicon.ts';
import { buildPath } from '../src/engine/path.ts';
import { parsePack } from '../src/data/pack.ts';
import { dccLemmas } from '../src/data/contentStore.ts';
import { fixLexicon } from './fixtures.ts';
import { handleApi, type ApiCtx, type ApiEnv } from '../worker/api.ts';
import { FakeD1 } from './d1fake.ts';

const DIR = resolve(__dirname, '../content/historia');
const entries = historiaEntries();
const byId = new Map(entries.map((e) => [e.id, e]));
const clone = (e: HistoriaEntry): HistoriaEntry => JSON.parse(JSON.stringify(e)) as HistoriaEntry;

describe('historia: definitions', () => {
  it('sixteen entries, one file each, named by id, in order', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
    expect(files.length).toBe(16);
    for (const f of files) expect(parseHistoriaEntry(JSON.parse(readFileSync(resolve(DIR, f), 'utf8'))).id).toBe(f.replace('.json', ''));
    expect(entries.map((e) => e.id)).toEqual(['iul-32', 'iul-37', 'aug-23', 'aug-28', 'claud-21', 'nero-49', 'vesp-23', 'tit-8', 'hadr-14', 'hadr-25', 'veg-3', 'agr-30', 'liv-2251', 'liv-548', 'bg-425', 'hadr-11']);
    expect(entries.map((e) => e.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    // Exactly one verse entry: Hadrian's lines to his soul.
    expect(entries.filter((e) => e.verse).map((e) => e.id)).toEqual(['hadr-25']);
  });

  it('citations: author, work, standard citation, a named edition with its URL among the sources', () => {
    for (const e of entries) {
      if (e.author === 'Suetonius') {
        expect(e.citation).toMatch(/^Suet\. (Iul\.|Aug\.|Claud\.|Nero|Vesp\.|Tit\.) \d+(\.\d+)?$/);
        expect(e.edition.name).toMatch(/Loeb Classical Library.*MCMXIII/);
        expect(e.edition.url).toMatch(/^https:\/\/penelope\.uchicago\.edu\/Thayer\/L\/Roman\/Texts\/Suetonius\/12Caesars\/[A-Za-z]+\*\.html$/);
      } else if (e.author === 'Historia Augusta') {
        expect(e.citation).toMatch(/^HA Hadr\. \d+\.\d+(–\d+)?$/);
        expect(e.edition.name).toMatch(/Loeb Classical Library.*MCMXXI/);
        expect(e.edition.url).toMatch(/^https:\/\/penelope\.uchicago\.edu\/Thayer\/L\/Roman\/Texts\/Historia_Augusta\/Hadrian\/[12]\*\.html$/);
      } else {
        // Other authors: a standard citation and a named edition (or an honest note that the page names none).
        const cite: Record<string, RegExp> = {
          Vegetius: /^Veg\. Mil\. \d+ praef\.$/, Tacitus: /^Tac\. Agr\. \d+\.\d+(–\d+)?$/,
          Livy: /^Liv\. \d+\.\d+\.\d+(–\d+)?$/, Caesar: /^Caes\. BGall\. \d+\.\d+\.\d+(–\d+)?$/,
        };
        expect(cite[e.author], `${e.id}: author ${e.author}`).toBeDefined();
        expect(e.citation).toMatch(cite[e.author]!);
        expect(e.edition.name).toMatch(/ed\. |does not name/);
      }
      expect(e.sources.some((s) => s.url === e.edition.url && s.kind === 'ancient')).toBe(true);
      expect(e.verified).toBe('2026-11-04');
    }
  });

  it('every token is glossed and parsed, and the tokens spell the edition text verbatim', () => {
    for (const e of entries) {
      for (const t of e.tokens) {
        expect(t.gloss.trim(), `${e.id} ${t.w}`).not.toBe('');
        expect(t.parse.trim(), `${e.id} ${t.w}`).not.toBe('');
        expect(t.lemma.trim(), `${e.id} ${t.w}`).not.toBe('');
      }
      expect(tokensSourceText(e.tokens)).toBe(e.source_text);
      // The displayed passage differs from the edition only by macrons and curly quotes.
      expect(stripMacrons(historiaLatin(e)).replace(/[“”]/g, '"')).toBe(e.source_text);
      expect(e.source_text.includes('\n')).toBe(!!e.verse);
      expect(e.tokens.length).toBeGreaterThanOrEqual(10);
    }
  });

  it('macrons are marked editorial and the saying is in the passage', () => {
    for (const e of entries) {
      expect(e.macrons.editorial).toBe(true);
      expect(e.macrons.note).toMatch(/editorial/i);
      const text = historiaLatin(e).toLowerCase().replace(/[·\n]/g, ' ').replace(/[^\p{L} ]/gu, '');
      const saying = e.saying.toLowerCase().replace(/[^\p{L} ]/gu, '');
      // The saying's words occur in the passage in order (Suetonius may interrupt with inquit).
      const words = text.split(' ');
      let at = 0;
      for (const w of saying.split(' ')) { at = words.indexOf(w, at) + 1; expect(at, `${e.id}: ${w}`).toBeGreaterThan(0); }
    }
  });

  it('every essay claim cites a source; every source is cited; 200–350 words; 2–3 questions', () => {
    for (const e of entries) {
      const claims = e.essay.flat();
      expect(claims.length).toBeGreaterThan(5);
      for (const c of claims) {
        expect(c.src.length, `${e.id}: ${c.t}`).toBeGreaterThan(0);
        for (const i of c.src) expect(e.sources[i - 1], `${e.id}: [${i}] ${c.t}`).toBeDefined();
      }
      const cited = new Set(claims.flatMap((c) => c.src));
      expect([...cited].sort((a, b) => a - b)).toEqual(e.sources.map((_, i) => i + 1));
      expect(essayWords(e)).toBeGreaterThanOrEqual(200);
      expect(essayWords(e)).toBeLessThanOrEqual(350);
      expect(claims.some((c) => c.doubt), `${e.id} flags its uncertainties`).toBe(true);
      expect(e.questions.length).toBeGreaterThanOrEqual(2);
      expect(e.questions.length).toBeLessThanOrEqual(3);
      for (const s of e.sources) expect(s.url).toMatch(/^https:\/\//);
    }
  });

  it('rejects broken definitions', () => {
    const e = byId.get('aug-28')!;
    const bad = (f: (x: HistoriaEntry) => void, why: RegExp) => {
      const x = clone(e);
      f(x);
      expect(() => parseHistoriaEntry(x)).toThrow(why);
    };
    bad((x) => { x.tokens[0]!.gloss = ''; }, /no gloss/);
    bad((x) => { x.tokens[0]!.parse = ' '; }, /no parse/);
    bad((x) => { x.tokens[1]!.w = 'nēque'.replace('ē', 'ā'); }, /tokens spell/);
    bad((x) => { x.source_text = x.source_text.replace('latericiam', 'lateritiam'); }, /tokens spell/);
    bad((x) => { x.essay[0]![0]!.src = []; }, /without a source/);
    bad((x) => { x.essay[0]![0]!.src = [99]; }, /cites source 99/);
    bad((x) => { x.sources.push({ label: 'Unused', url: 'https://example.org/', kind: 'modern' }); }, /never cited/);
    bad((x) => { x.essay = [[{ t: 'Too short.', src: [1] }]]; }, /never cited|words/);
    bad((x) => { x.questions = x.questions.slice(0, 1); }, /2–3 questions/);
    bad((x) => { x.questions[0]!.answer = 7; }, /answer/);
    bad((x) => { x.edition.url = 'http://insecure.example/'; }, /edition/);
    bad((x) => { (x.macrons as { editorial: boolean }).editorial = false; }, /macrons/);
  });
});

describe('historia: known words, grading, events', () => {
  it('a token is known when all its app ids are (and -que when attached)', () => {
    const e = byId.get('tit-8')!;
    const amici = e.tokens.find((t) => t.w === 'Amīcī')!;
    const merito = e.tokens.find((t) => t.w === 'meritōque')!;
    expect(tokenKnown(amici, new Set())).toBe(false);
    expect(tokenKnown(amici, new Set(['amicus-n2m']))).toBe(true);
    expect(tokenKnown(merito, new Set(['que-enclitic']))).toBe(false); // meritō is not an app word
    const claud = byId.get('claud-21')!;
    const ferro = claud.tokens.find((t) => t.w === 'ferrōque')!;
    expect(tokenKnown(ferro, new Set(['ferrum-n2n']))).toBe(false);
    expect(tokenKnown(ferro, new Set(['ferrum-n2n', 'que-enclitic']))).toBe(true);
    const k = knownShare(e, new Set(['amicus-n2m', 'nihil-indecl', 'laudo-v1']));
    expect(k).toEqual({ known: 3, total: e.tokens.length, pct: Math.round(300 / e.tokens.length) });
    expect(knownShare(e, new Set()).pct).toBe(0);
  });

  it('tokens without app ids resolve through the learner\'s lexicon by exact headword, homographs never', () => {
    const e = byId.get('claud-21')!;
    const per = e.tokens.find((t) => t.w === 'per')!;
    const cum = e.tokens.find((t) => t.w === 'cum')!;
    const heads = new Map([['per', ['per-x']], ['cum', ['cum-indecl']]]);
    expect(tokenIds(per, heads)).toEqual(['per-x']);
    expect(tokenKnown(per, new Set(['per-x']), heads)).toBe(true);
    expect(tokenKnown(per, new Set(['per-x']))).toBe(false);
    expect(cum.nolink).toBe(true);
    expect(tokenKnown(cum, new Set(['cum-indecl']), heads)).toBe(false);
    const lex = fixLexicon();
    expect(headIndex(lex).get(lex.words[0]!.lemma.parts[0]!)).toContain(lex.words[0]!.lemma.id);
  });

  it('learnerKnownIds: words of finished nodes plus seen words', () => {
    const lex = fixLexicon();
    const path = buildPath(lex);
    const first = path.nodes[0]!;
    const ids = learnerKnownIds(path, { done: new Set([first.id]), seen: new Set(['extra-x']) });
    for (const w of first.newWords) expect(ids.has(w)).toBe(true);
    expect(ids.has('extra-x')).toBe(true);
    expect(learnerKnownIds(path, { done: new Set(), seen: new Set() }).size).toBe(0);
  });

  it('grades by the answer key; option order is a permutation', () => {
    for (const e of entries) {
      e.questions.forEach((q, i) => {
        const n = i + 1;
        expect(gradeHistoria(e, n, q.answer)).toBe('good');
        for (let o = 0; o < q.options.length; o++) if (o !== q.answer) expect(gradeHistoria(e, n, o)).toBe('again');
        expect([...optionOrder(e, n)].sort()).toEqual(q.options.map((_, k) => k));
      });
      expect(() => gradeHistoria(e, 9, 0)).toThrow();
    }
    // Not every key is shown first.
    expect(entries.flatMap((e) => e.questions.map((_, i) => optionOrder(e, i + 1)[0] === e.questions[i]!.answer)).some((x) => !x)).toBe(true);
  });

  it('review events with historia card ids pass the validator and never touch word, listening, sentence or Audītiō cards', () => {
    const cards = entries.flatMap((e) => e.questions.map((_, i) => historiaQuestionCard(e.id, i + 1)));
    expect(cards).toContain('historia:aug-28:q1');
    const events: VEvent[] = cards.map((card, i) => parseEvent({
      id: `h${i}`, device: 'd', ts: 1_700_000_000_000 + i, kind: 'review', card, grade: i % 2 ? 'good' : 'again',
      body: { node: historiaNode(parseHistoriaCard(card)!.entry), run: 'r' },
    }, i));
    expect(events.map((e) => e.card)).toEqual(cards);
    for (const c of cards) {
      expect(c.length).toBeLessThanOrEqual(256);
      expect(parseCardId(c)).toBeNull();
      expect(parseListenCard(c)).toBeNull();
      expect(parseSentenceCard(c)).toBeNull();
      expect(parseAuditCard(c)).toBeNull();
    }
    expect(parseHistoriaCard('historia:vesp-23:q3')).toEqual({ entry: 'vesp-23', question: 3 });
    expect(parseHistoriaCard('audit:listen-nb-01-2:q1')).toBeNull();
    const st = replay(events);
    expect(st.seen.size).toBe(0);
    expect(st.meaningGood.size).toBe(0);
    expect(st.cards.has('historia:aug-28:q1')).toBe(true);
    expect(st.last.get(cards[1]!)?.grade).toBe('good');
  });

  describe('the Worker accepts them', () => {
    const AUD = 'aud';
    const EMAIL = 'me@example.com';
    let env: ApiEnv;
    const ok: ApiCtx = { access: { aud: AUD, getIdentity: async () => ({ email: EMAIL }) } };
    beforeEach(() => { env = { DB: new FakeD1(), ALLOWED_EMAILS: EMAIL, ACCESS_AUD: AUD }; });
    it('POST /api/events stores historia reviews and GET returns them', async () => {
      const events = [1, 2].map((n) => ({ id: `hist-${n}`, device: 'd', ts: 1_700_000_000_000 + n, kind: 'review', card: historiaQuestionCard('iul-37', n), grade: 'good', body: { node: historiaNode('iul-37'), run: 'r' } }));
      const post = await handleApi(new Request('https://v.example/api/events', { method: 'POST', body: JSON.stringify({ events }), headers: { 'content-type': 'application/json' } }), env, ok);
      expect(post.status).toBe(200);
      expect(((await post.json()) as { accepted: number }).accepted).toBe(2);
      const got = await handleApi(new Request('https://v.example/api/events?after=0'), env, ok);
      const body = (await got.json()) as { events: VEvent[] };
      expect(body.events.map((e) => e.card)).toEqual(['historia:iul-37:q1', 'historia:iul-37:q2']);
    });
  });
});

describe('historia: audio', () => {
  it('speech text: the macronized passage, lower case, no quotation marks, inscription dots as commas', () => {
    expect(historiaSpeech(byId.get('tit-8')!)).toBe('atque etiam recordātus quondam super cēnam, quod nihil cuiquam tōtō diē praestitisset, memorābilem illam meritōque laudātam vōcem ēdidit: amīcī, diem perdidī.');
    expect(historiaSpeech(byId.get('iul-37')!)).toContain('vēnī, vīdī, vīcī nōn ācta');
    for (const e of entries) expect(historiaSpeech(e)).not.toMatch(/["“”·]/);
  });

  it('the manifest includes every passage and every word of the Historia Latin', () => {
    const texts = historiaTexts();
    expect(texts).toEqual(entries.flatMap(historiaAudioTexts));
    const items = audioItems(fixLexicon(), [], [...EXTRA_AUDIO_TEXTS, ...listeningWordTexts(), ...texts]);
    const keys = new Set(items.map((i) => i.key));
    for (const e of entries) {
      expect(keys.has(audioKey(historiaSpeech(e))), `${e.id} passage`).toBe(true);
      expect(keys.has(formAudio(historiaSpeech(e)).key)).toBe(true);
      for (const t of e.tokens) expect(keys.has(audioKey(t.w)), `${e.id} ${t.w}`).toBe(true);
    }
    expect(audioKey('Iacta')).toBe(audioKey('iacta'));
  });

  it('verse: five lines kept as lines in the text, spoken as one passage', () => {
    const h = byId.get('hadr-25')!;
    expect(historiaLatin(h).split('\n')).toEqual([
      'et moriēns quidem hōs versūs fēcisse dīcitur:', 'Animula vagula blandula', 'hospes comesque corporis,',
      'quae nunc abībis in loca', 'pallidula rigida nūdula?', 'nec ut solēs dabis iocōs!',
    ]);
    expect(historiaSpeech(h)).not.toContain('\n');
    const x = clone(byId.get('tit-8')!);
    x.tokens[0]!.br = true;
    expect(() => parseHistoriaEntry(x)).toThrow(/br/);
  });

  it('the audio manifest script reads content/historia', () => {
    const src = readFileSync(resolve(__dirname, '../scripts/audio-manifest.ts'), 'utf8');
    expect(src).toContain('...historiaTexts()');
  });
});

/* ---------------- app ids against the real lexicon (private pack) ---------------- */

const PACK = resolve(__dirname, '../content/private/vocabula-pack.json');
const present = existsSync(PACK);

describe.skipIf(!present)('historia: app ids are the app\'s words (private data)', () => {
  const pack = present ? parsePack(JSON.parse(readFileSync(PACK, 'utf8'))) : null;
  const lex = pack ? buildLexicon(pack.lemmas, dccLemmas(), pack.fr ?? []) : null;
  const head = (lemma: string) => lemma.split(/,| \(| \+ /)[0]!.trim();
  /** Same spelling, different word: these tokens are deliberately not linked. */
  const HOMOGRAPHS = new Set(['cum', 'adeō', 'Gallus']); // Gallus "a Gaul" vs FR gallus "rooster"

  it('every app id is a lexicon word whose first citation form is the token\'s headword, macrons included', () => {
    for (const e of entries) for (const t of e.tokens) for (const id of t.app ?? []) {
      const w = lex!.byId.get(id);
      expect(w, `${e.id} ${t.w}: ${id}`).toBeDefined();
      expect(w!.lemma.parts[0] ?? w!.lemma.headword, `${e.id} ${t.w}`).toBe(head(t.lemma));
    }
  });

  it('every Wheelock / DCC word is linked by app id; other lexicon words (FR previews) resolve by headword', () => {
    const firsts = new Map<string, { id: string; origin: string }[]>();
    for (const w of lex!.words) {
      const k = stripMacrons(w.lemma.parts[0] ?? w.lemma.headword).toLowerCase();
      firsts.set(k, [...(firsts.get(k) ?? []), { id: w.lemma.id, origin: w.origin }]);
    }
    const heads = headIndex(lex!);
    const missing: string[] = [];
    const unresolved: string[] = [];
    const homographs = new Set<string>();
    for (const e of entries) for (const t of e.tokens) {
      const h = head(t.lemma);
      if (t.app) continue;
      const ws = (firsts.get(stripMacrons(h).toLowerCase()) ?? []).filter((w) => w.id !== 'que-enclitic');
      if (!ws.length) continue;
      if (t.nolink) { homographs.add(h); continue; }
      if (ws.some((w) => w.origin !== 'fr')) missing.push(`${e.id} ${t.w} (${h})`);
      else if (!tokenIds(t, heads).length) unresolved.push(`${e.id} ${t.w} (${h})`);
    }
    expect(missing).toEqual([]);
    expect(unresolved).toEqual([]);
    expect([...homographs].every((h) => HOMOGRAPHS.has(h))).toBe(true);
  });

  it('where the morph engine generates the form, the linked word produces it', () => {
    let checked = 0;
    for (const e of entries) for (const t of e.tokens) {
      // The engine has no perfects, participles or gerunds yet: only forms it could generate are compared.
      if (!t.app || t.app.length !== 1 || /perf\.|pluperf\.|participle|gerund/.test(t.parse)) continue;
      const w = lex!.byId.get(t.app[0]!)!;
      const form = t.enclitic ? t.w.slice(0, -3) : t.w;
      const hits = analyze(form.toLowerCase(), [w.lemma]);
      const generated = analyze(form.toLowerCase(), [w.lemma], { ignoreMacrons: true });
      // A macron-insensitive hit with no exact hit would be a spelling disagreement with the app.
      expect(generated.length > 0 && hits.length === 0, `${e.id} ${t.w}: macrons differ from the app's form`).toBe(false);
      if (hits.length) checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });
});
