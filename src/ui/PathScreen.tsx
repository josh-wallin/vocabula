/** The path: sections with zigzag nodes. The app leads; there is no chapter picker. */
import { useEffect, useRef } from 'preact/hooks';
import type { AppData } from '../app/controller.ts';
import { frontier } from '../app/controller.ts';
import { roman } from '../engine/curriculum.ts';
import { nodeStatus, type NodeKind, type PathNode } from '../engine/path.ts';
import { IconBook, IconCheck, IconForms, IconLaurel, IconPlus, IconReview, IconSpeaker, IconTable } from './icons.tsx';
import { IconScroll } from './Lectio.tsx';

const OFFSETS = [0, 62, 78, 26, -40, -74, -20];

const KIND_ICON: Record<NodeKind, (p: { size?: number }) => preact.JSX.Element> = {
  verba: IconBook, pattern: IconTable, repetitio: IconReview, formae: IconForms, dcc: IconPlus, fr: IconBook, lectio: IconScroll, auditio: IconSpeaker, probatio: IconLaurel,
};
const KIND_DESC: Record<NodeKind, string> = {
  verba: 'new words', pattern: 'new grammar pattern', repetitio: 'review', formae: 'form drills',
  dcc: 'new words from the DCC core list', fr: 'Familia Rōmāna preview words, meaning only',
  lectio: 'a short reading in Latin you know', auditio: 'listening to a real Latin reading', probatio: 'checkpoint',
};

export function PathScreen({ app, onStart, onChapter }: {
  app: AppData; onStart: (n: PathNode) => void; onChapter: (section: number) => void;
}) {
  const f = frontier(app);
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { currentRef.current?.scrollIntoView({ block: 'center' }); }, []);
  let k = 0;
  return (
    <div class="path">
      {app.path.sections.map((sec) => {
        const reached = sec.spec.n <= f.section;
        return (
          <section class="section-block" key={sec.spec.n} aria-label={`Sectiō ${roman(sec.spec.n)}`}>
            {sec.spec.n > 1 && (
              <div class="divider" aria-hidden="true">
                <span class="rule" /><span class="t">SECTIŌ {roman(sec.spec.n)}</span><span class="rule" />
              </div>
            )}
            <div class={`banner${reached ? '' : ' locked'}`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <span class="kicker" lang="la">SECTIŌ {roman(sec.spec.n)}</span>
                <span class="name">{sec.spec.title}</span>
                <span class="sub">Wheelock ch. {sec.spec.chapter}</span>
              </div>
              <button type="button" class="book" aria-label={`Read the section ${sec.spec.n} chapter`} onClick={() => onChapter(sec.spec.n)}
                data-testid={`chapter-${sec.spec.n}`}>
                <IconBook />
              </button>
            </div>
            <div class="nodes">
              {sec.nodes.map((n) => {
                const i = app.path.index.get(n.id)!;
                const status = nodeStatus(app.path, app.state.done, i, f.index);
                const off = OFFSETS[k++ % OFFSETS.length]!;
                const Icon = status === 'done' ? IconCheck : KIND_ICON[n.kind];
                const desc = KIND_DESC[n.kind];
                return (
                  <div class={`node ${status}`} key={n.id} style={{ transform: `translateX(${off}px)` }}>
                    {status === 'current' && <span class="incipe" lang="la" aria-hidden="true">INCIPE</span>}
                    {status === 'open' && <span class="newtag" aria-hidden="true">NEW</span>}
                    {status === 'locked' ? (
                      <span class="disc" role="img" aria-label={`${n.title}, ${desc}, locked`} data-node={n.id} data-status={status}>
                        <Icon size={26} />
                      </span>
                    ) : (
                      <button type="button" class="disc" ref={status === 'current' ? currentRef : undefined}
                        aria-label={`${n.title}, ${desc}. ${status === 'done' ? 'Completed. Practice again' : status === 'open' ? 'New, not done yet. Start lesson' : 'Start lesson'}`}
                        data-node={n.id} data-status={status} onClick={() => onStart(n)}>
                        <Icon size={status === 'current' ? 30 : 28} />
                      </button>
                    )}
                    <span class="label" lang="la">{n.kind === 'dcc' ? `${n.title} · DCC` : n.title}</span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {f.index >= app.path.nodes.length && (
        <p class="path-end">Sectiōnēs I–IV complete. More sections arrive with the next content pack; Repetītiō in Practice keeps your words fresh.</p>
      )}
    </div>
  );
}
