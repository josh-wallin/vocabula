/**
 * Theme preference (Profile → Theme): System, Light or Dark. Kept on this device only
 * (localStorage; not a synced setting: a phone and a laptop may want different themes).
 * Light / Dark set data-theme on <html>, which the token blocks in styles.css follow; System
 * removes it, so prefers-color-scheme decides. index.html applies the stored choice before
 * first paint with the same key.
 */
export type ThemePref = 'system' | 'light' | 'dark';
export const THEME_KEY = 'vocabula.theme';
/** Browser UI (status bar) color per theme: the brand plum in light, the page background in dark. */
export const THEME_COLORS = { light: '#5e2550', dark: '#16131a' } as const;

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch { return 'system'; }
}

export function applyTheme(p: ThemePref, doc: Document = document): void {
  const root = doc.documentElement;
  if (p === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', p);
  // Each theme-color meta carries a media query; an explicit choice overrides both.
  for (const m of doc.querySelectorAll('meta[name="theme-color"]')) {
    const scheme = (m.getAttribute('media') ?? '').includes('dark') ? 'dark' : 'light';
    m.setAttribute('content', THEME_COLORS[p === 'system' ? scheme : p]);
  }
}

export function setThemePref(p: ThemePref): void {
  try {
    if (p === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, p);
  } catch { /* storage blocked: the choice lasts for this page only */ }
  applyTheme(p);
}
