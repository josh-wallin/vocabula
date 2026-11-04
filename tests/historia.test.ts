/**
 * Historia entries (content/historia/*.json: public-domain Latin from many authors; original glosses,
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
import { dccLemmas } from '../src/content/dccList.ts';
import { fixLexicon } from './fixtures.ts';
import { handleApi, type ApiCtx, type ApiEnv } from '../worker/api.ts';
import { FakeD1 } from './d1fake.ts';

const DIR = resolve(__dirname, '../content/historia');
const entries = historiaEntries();
const byId = new Map(entries.map((e) => [e.id, e]));
const clone = (e: HistoriaEntry): HistoriaEntry => JSON.parse(JSON.stringify(e)) as HistoriaEntry;

describe('historia: definitions', () => {
  it('one file per entry, named by id; orders unique, list sorted by order', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
    expect(files.length).toBeGreaterThan(0);
    expect(entries.length).toBe(files.length);
    for (const f of files) expect(parseHistoriaEntry(JSON.parse(readFileSync(resolve(DIR, f), 'utf8'))).id).toBe(f.replace('.json', ''));
    expect([...entries.map((e) => e.id)].sort()).toEqual(files.map((f) => f.replace('.json', '')));
    const orders = entries.map((e) => e.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    // A rough chronology of what each passage is about: legend (Troy, early Rome), the Republic,
    // Caesar and Augustus, the Julio-Claudians and Flavians (Vesuvius), Trajan and Hadrian, late antiquity.
    expect(entries.map((e) => e.id)).toEqual([
      'aen-249', 'aen-6851', 'liv-107', 'liv-158', 'liv-210', 'liv-326', 'liv-548', 'liv-2251',
      'valmax-4', 'catil-1', 'cat-85', 'cat-5', 'bg-425', 'iul-32', 'iul-37', 'rg-34', 'aug-23', 'aug-28',
      'claud-21', 'sen-47', 'ann-15', 'nero-49', 'vesp-23', 'pomp-4', 'plin-616', 'plin-620', 'tit-8',
      'agr-30', 'plin-96', 'hadr-11', 'hadr-14', 'hadr-25', 'amm-25', 'conf-812', 'veg-3',
    ]);
    expect(orders).toEqual(entries.map((_, i) => i + 1));
    // Verse entries keep their lines: Hadrian's lines to his soul, the Pompeii wall texts, Catullus, Vergil.
    const VERSE = new Set(['hadr-25', 'pomp-4', 'cat-85', 'cat-5', 'aen-249', 'aen-6851']);
    for (const e of entries) expect(!!e.verse, `${e.id} verse`).toBe(VERSE.has(e.id));
  });

  /** Per author: the standard citation form(s), and the named edition and its URL where a batch fixed them. */
  const AUTHORS: Record<string, { cite: RegExp[]; edition?: RegExp; url?: RegExp }> = {
    Suetonius: {
      cite: [/^Suet\. (Iul\.|Aug\.|Claud\.|Nero|Vesp\.|Tit\.) \d+(\.\d+)?$/],
      edition: /Loeb Classical Library.*MCMXIII/,
      url: /^https:\/\/penelope\.uchicago\.edu\/Thayer\/L\/Roman\/Texts\/Suetonius\/12Caesars\/[A-Za-z]+\*\.html$/,
    },
    'Historia Augusta': {
      cite: [/^HA Hadr\. \d+\.\d+(–\d+)?$/],
      edition: /Loeb Classical Library.*MCMXXI/,
      url: /^https:\/\/penelope\.uchicago\.edu\/Thayer\/L\/Roman\/Texts\/Historia_Augusta\/Hadrian\/[12]\*\.html$/,
    },
    Vegetius: { cite: [/^Veg\. Mil\. \d+ praef\.$/], edition: /ed\. |does not name/ },
    Tacitus: { cite: [/^Tac\. Agr\. \d+\.\d+(–\d+)?$/, /^Tac\. Ann\. \d+\.\d+\.\d+(–\d+)?$/], edition: /ed\. .*Damon|Fisher.*1906/ },
    Livy: {
      cite: [/^Liv\. \d+\.\d+\.\d+(–\d+)?$/],
      edition: /Weissenborn.*Müller.*Teubner/,
      url: /^https:\/\/(raw\.githubusercontent\.com\/PerseusDL\/canonical-latinLit\/master|github\.com\/PerseusDL\/canonical-latinLit\/blob\/master)\/data\/phi0914\/phi001\/phi0914\.phi001\.perseus-lat2\.xml$/,
    },
    Caesar: { cite: [/^Caes\. BGall\. \d+\.\d+\.\d+(–\d+)?$/], edition: /ed\. |does not name/ },
    Cicero: { cite: [/^Cic\. Cat\. \d+\.\d+(–\d+)?$/], edition: /Clark.*1908/ },
    Augustus: { cite: [/^RG \d+(\.\d+)?$/], edition: /Loeb Classical Library.*Shipley.*1924/ },
    'Pliny the Younger': {
      cite: [/^Plin\. Ep\. 10\.\d+\.\d+(; 10\.\d+\.\d+)?$/, /^Plin\. Ep\. \d+\.\d+\.\d+(–\d+)?$/],
      url: /^https:\/\/(dcc\.dickinson\.edu\/pliny-letters\/|raw\.githubusercontent\.com\/PerseusDL\/canonical-latinLit\/)/,
    },
    Seneca: { cite: [/^Sen\. Ep\. \d+\.\d+$/], edition: /Loeb Classical Library.*Gummere/ },
    'Valerius Maximus': { cite: [/^Val\. Max\. /], edition: /Kempf.*1888/ },
    'Pompeian inscriptions': { cite: [/^CIL IV \d+(; CIL IV \d+)*$/] },
    Catullus: {
      cite: [/^Catull\. \d+(\.\d+–\d+)?$/],
      edition: /Merrill.*1893/,
      url: /^https:\/\/raw\.githubusercontent\.com\/PerseusDL\/canonical-latinLit\/master\/data\/phi0472\/phi001\/phi0472\.phi001\.perseus-lat2\.xml$/,
    },
    Vergil: {
      cite: [/^Verg\. Aen\. \d+\.\d+–\d+$/],
      edition: /Greenough.*1881/,
      url: /^https:\/\/raw\.githubusercontent\.com\/PerseusDL\/canonical-latinLit\/master\/data\/phi0690\/phi003\/phi0690\.phi003\.perseus-lat2\.xml$/,
    },
    Augustine: {
      cite: [/^Aug\. Conf\. \d+\.\d+\.\d+$/],
      edition: /Knöll.*1896/,
      url: /^https:\/\/raw\.githubusercontent\.com\/OpenGreekAndLatin\/csel-dev\//,
    },
    'Ammianus Marcellinus': {
      cite: [/^Amm\. Marc\. \d+\.\d+\.\d+$/],
      edition: /Loeb Classical Library.*Rolfe/,
      url: /^https:\/\/raw\.githubusercontent\.com\/PerseusDL\/canonical-latinLit\/master\/data\/stoa0023\//,
    },
  };

  it('citations: author, work, standard citation, a named edition with its URL among the sources', () => {
    for (const e of entries) {
      const a = AUTHORS[e.author];
      expect(a, `${e.id}: author ${e.author}`).toBeDefined();
      expect(a!.cite.some((r) => r.test(e.citation)), `${e.id}: citation ${e.citation}`).toBe(true);
      if (a!.edition) expect(e.edition.name, e.id).toMatch(a!.edition);
      if (a!.url) expect(e.edition.url, e.id).toMatch(a!.url);
      expect(e.sources.some((s) => s.url === e.edition.url && s.kind === 'ancient')).toBe(true);
      expect(e.verified).toBe('2026-11-04');
    }
    // No stale rules: every author in the table has an entry.
    for (const a of Object.keys(AUTHORS)) expect(entries.some((e) => e.author === a), a).toBe(true);
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
  const HOMOGRAPHS = new Set([
    'cum', 'adeō',
    'Gallus', // Gallus "a Gaul" vs FR gallus "rooster"
    'occidō', // occidō "fall, set" vs occīdō "kill"
  ]);

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
