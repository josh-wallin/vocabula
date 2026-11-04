/**
 * Historia tab: the tab icon and styles, and the screens as their own chunk with the entries'
 * JSON (src/ui/HistoriaScreens.tsx, src/content/historia.ts), precached for offline.
 */
import { lazy } from './lazy.tsx';
import './historia.css';

/** Tab icon: a scroll. */
export const IconScroll = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={2}
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M7 4h11a2 2 0 0 1 2 2v1h-4" /><path d="M16 7v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h10" /><path d="M7 4a2 2 0 0 0-2 2v11" /><path d="M9 9h4M9 13h4" />
  </svg>
);

export const HistoriaList = lazy(() => import('./HistoriaScreens.tsx').then((m) => m.HistoriaList));
export const HistoriaEntryView = lazy(() => import('./HistoriaScreens.tsx').then((m) => m.HistoriaEntryView));
