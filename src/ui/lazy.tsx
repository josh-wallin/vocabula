/**
 * Code-split components without preact/compat: `lazy(() => import('./X.tsx').then((m) => m.X))`
 * renders nothing until the chunk is in, then the component. The service worker precaches every
 * chunk, so offline this resolves from the cache like the main bundle; `preload()` starts the load
 * early (e.g. when a lesson that needs the component begins).
 */
import { h, type ComponentType, type JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export interface Lazy<P> {
  (props: P): JSX.Element | null;
  preload: () => Promise<void>;
}

export function lazy<P extends object>(load: () => Promise<ComponentType<P>>): Lazy<P> {
  let C: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;
  const preload = (): Promise<void> => {
    pending ??= load().then((c) => { C = c; }, (e: unknown) => { pending = null; throw e; });
    return pending;
  };
  function LazyComponent(props: P): JSX.Element | null {
    const [, setReady] = useState(0);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (C) return;
      let live = true;
      preload().then(() => { if (live) setReady(1); }, () => { if (live) setFailed(true); });
      return () => { live = false; };
    }, []);
    if (C) return h(C, props);
    return failed ? <p class="err" role="alert">This part of the app didn’t load. Reload to try again.</p> : null;
  }
  return Object.assign(LazyComponent, { preload });
}
