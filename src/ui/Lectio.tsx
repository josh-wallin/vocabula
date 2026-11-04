/**
 * Lectiō: the light parts (path icon, the Words → Lectiōnēs list, styles) and the reading screens
 * as their own chunk (src/ui/LectioScreens.tsx).
 */
import type { AppData } from '../app/controller.ts';
import { roman } from '../engine/curriculum.ts';
import type { Lectio } from '../engine/lectio.ts';
import { lazy } from './lazy.tsx';
import './lectio.css';

export const IconScroll = (p: { size?: number }) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={2}
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M7 4h11a2 2 0 0 1 2 2v1h-4" /><path d="M16 7v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h10" /><path d="M7 4a2 2 0 0 0-2 2v11" />
    <path d="M9 9h4M9 13h4" />
  </svg>
);

export const LectioView = lazy(() => import('./LectioScreens.tsx').then((m) => m.LectioView));
export const LectioReader = lazy(() => import('./LectioScreens.tsx').then((m) => m.LectioReader));

/** Words → Lectiōnēs: passages whose node is done, to reread. */
export function LectioList({ app, passages, onOpen }: { app: AppData; passages: readonly Lectio[]; onOpen: (id: string) => void }) {
  const done = passages.filter((p) => app.path.nodes.some((n) => n.lectio === p.id && app.state.done.has(n.id)));
  return (
    <section class="lectio-list" data-testid="lectiones" aria-label="Lectiōnēs">
      <h2 lang="la">Lectiōnēs</h2>
      {done.length === 0
        ? <p class="note">Reading passages you finish on the path appear here to read again.</p>
        : (
          <ul class="wordlist">
            {done.map((p) => (
              <li key={p.id}>
                <button type="button" class="lectio-open" data-testid={`lectio-open-${p.id}`} onClick={() => onOpen(p.id)}>
                  <span class="w" lang="la">{p.title}</span>
                  <span class="g">{p.titleEn} · Sectiō {roman(p.section)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
