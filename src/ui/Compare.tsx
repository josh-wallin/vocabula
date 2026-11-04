/** Voice test (#/compare): the route constant, and the page as its own chunk (src/ui/ComparePage.tsx). */
import { lazy } from './lazy.tsx';

export const COMPARE_HASH = '#/compare';
export const ComparePage = lazy(() => import('./ComparePage.tsx').then((m) => m.ComparePage));
