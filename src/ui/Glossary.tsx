/** Glossary bottom sheet, tappable terms, grammar card rendering. */
import { useEffect, useRef } from 'preact/hooks';
import { termIfUnlocked, type GlossaryTerm } from '../content/glossary.ts';
import { cardFor, segments, type TableSpec } from '../content/grammarCards.ts';
import { lemmaFromHeadword } from '../morph/lemma.ts';
import { generate } from '../morph/generate.ts';
import { CASES, PERSONS } from '../morph/cells.ts';
import type { CellId, PartOfSpeech } from '../morph/types.ts';

export function TermSheet({ term, onClose }: { term: GlossaryTerm; onClose: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [term]);
  return (
    <div class="sheet-wrap">
      <button type="button" class="sheet-scrim" aria-label="Close definition" onClick={onClose} />
      <div class="sheet" role="dialog" aria-modal="true" aria-label={term.name}>
        <span class="grip" aria-hidden="true" />
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
          <span class="t">{term.name}</span>
          <span class="tl" lang="la">{term.latin}</span>
        </div>
        <p>{term.def}</p>
        <div class="ex">
          <span class="la" lang="la">{term.ex}</span>
          <span class="en">{term.exEn}</span>
        </div>
        <button type="button" ref={btn} class="btn" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

/** Render [[term|text]] / *latin* markup; terms become buttons only if unlocked at `section`. */
export function Rich({ text, section, onTerm }: { text: string; section: number; onTerm: (t: GlossaryTerm) => void }) {
  return (
    <>
      {segments(text).map((s, i) => {
        if (s.term) {
          const t = termIfUnlocked(s.term, section);
          return t
            ? <button key={i} type="button" class="term" data-term={t.id} onClick={() => onTerm(t)}>{s.text}</button>
            : <span key={i}>{s.text}</span>;
        }
        return s.la ? <i key={i} lang="la">{s.text}</i> : <span key={i}>{s.text}</span>;
      })}
    </>
  );
}

const CASE_ABBR: Record<string, [string, string]> = {
  nom: ['Nom.', 'nominative'], gen: ['Gen.', 'genitive'], dat: ['Dat.', 'dative'],
  acc: ['Acc.', 'accusative'], abl: ['Abl.', 'ablative'], voc: ['Voc.', 'vocative'],
};

/** Split a form into base + ending for highlighting, given the base. */
function Ending({ form, base }: { form: string; base: string }) {
  if (base && form.startsWith(base) && form.length > base.length) return <>{base}<b>{form.slice(base.length)}</b></>;
  return <b>{form}</b>;
}

function lemmaOf(headword: string, pos: PartOfSpeech) {
  const { lemma } = lemmaFromHeadword(headword, pos, '', []);
  if (!lemma) throw new Error(`grammar card: cannot build ${headword}`);
  return lemma;
}

export function ParadigmTable({ spec, section, onTerm }: { spec: TableSpec; section: number; onTerm: (t: GlossaryTerm) => void }) {
  if (spec.kind === 'noun') {
    const l = lemmaOf(spec.headword, 'noun');
    const f = generate(l);
    const base = (l.parts[1] ?? '').replace(/(ae|ī)$/, '');
    return (
      <table class="ptable">
        <caption lang="la"><i>{spec.headword}</i> <span lang="en">{spec.gloss}</span></caption>
        <thead><tr><th scope="col">Case</th><th scope="col">Singular</th><th scope="col">Plural</th></tr></thead>
        <tbody lang="la">
          {CASES.map((c) => {
            const [abbr, id] = CASE_ABBR[c]!;
            const t = termIfUnlocked(id, section);
            return (
              <tr key={c}>
                <th scope="row" lang="en">{t ? <button type="button" class="term" onClick={() => onTerm(t)}>{abbr}</button> : abbr}</th>
                <td><Ending form={f[`${c}.sg` as CellId] ?? ''} base={base} /></td>
                <td><Ending form={f[`${c}.pl` as CellId] ?? ''} base={base} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }
  if (spec.kind === 'verbs') {
    const ls = spec.headwords.map((h) => lemmaOf(h, 'verb'));
    const fs = ls.map(generate);
    const stems = ls.map((l) => (l.parts[1] ?? '').slice(0, -3));
    const rows: [string, CellId][] = PERSONS.map((p, i) => [['I', 'you (sg.)', 'he, she, it', 'we', 'you (pl.)', 'they'][i]!, `pres.act.ind.${p}` as CellId]);
    rows.push(['infinitive', 'pres.act.inf'], ['command (sg.)', 'pres.act.imp.2sg'], ['command (pl.)', 'pres.act.imp.2pl']);
    return (
      <table class="ptable">
        <thead><tr><th scope="col" /><th scope="col" lang="la"><i>{ls[0]!.parts[0]}</i>, {spec.glosses[0]}</th><th scope="col" lang="la"><i>{ls[1]!.parts[0]}</i>, {spec.glosses[1]}</th></tr></thead>
        <tbody lang="la">
          {rows.map(([lbl, cell]) => (
            <tr key={cell}>
              <th scope="row" lang="en">{lbl}</th>
              {fs.map((f, i) => <td key={i}><Ending form={f[cell] ?? ''} base={stems[i]!} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  const l = lemmaOf('sum, esse, fuī, futūrum', 'verb');
  const f = generate(l);
  return (
    <table class="ptable">
      <caption lang="la"><i>sum, esse</i> <span lang="en">to be</span></caption>
      <thead><tr><th scope="col" /><th scope="col">Singular</th><th scope="col">Plural</th></tr></thead>
      <tbody lang="la">
        {(['1', '2', '3'] as const).map((p) => (
          <tr key={p}>
            <th scope="row" lang="en">{p === '1' ? '1st' : p === '2' ? '2nd' : '3rd'} person</th>
            <td>{f[`pres.act.ind.${p}sg` as CellId]}</td>
            <td>{f[`pres.act.ind.${p}pl` as CellId]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function GrammarCardView({ section, onTerm }: { section: number; onTerm: (t: GlossaryTerm) => void }) {
  const card = cardFor(section);
  if (!card) return null;
  return (
    <div class="gcard">
      <span class="eyebrow">New pattern</span>
      <h1><Rich text={card.title} section={section} onTerm={onTerm} /></h1>
      {card.blocks.map((b, i) =>
        'p' in b
          ? <p key={i}><Rich text={b.p} section={section} onTerm={onTerm} /></p>
          : <ParadigmTable key={i} spec={b.table} section={section} onTerm={onTerm} />)}
    </div>
  );
}
