/**
 * Theme tokens (src/ui/styles.css): every color is a custom property on :root; the dark values
 * appear twice (system dark unless data-theme="light", and data-theme="dark"), identically;
 * no stylesheet hard-codes a color; text/background pairs meet WCAG AA in both themes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_COLORS } from '../src/ui/theme.ts';

const UI = resolve(import.meta.dirname, '../src/ui');
const css = readFileSync(resolve(UI, 'styles.css'), 'utf8');

/** The declarations of the first rule body after `marker`. */
function block(marker: string): Map<string, string> {
  const at = css.indexOf(marker);
  if (at < 0) throw new Error(`no ${marker}`);
  const open = css.indexOf('{', at + marker.length - 1);
  const body = css.slice(open + 1, css.indexOf('}', open));
  const m = new Map<string, string>();
  for (const d of body.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const i = d.indexOf(':');
    if (i > 0) m.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
  }
  return m;
}
const light = block(':root {');
const darkMedia = block(":root:not([data-theme='light']) {");
const darkAttr = block(":root[data-theme='dark'] {");
const colorKeys = [...light.keys()].filter((k) => k.startsWith('--') && !k.startsWith('--font'));

function rgb(v: string): [number, number, number, number] {
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as [number, number, number, number];
  }
  const m = v.match(/^rgba?\(([^)]+)\)$/);
  if (m) { const p = m[1]!.split(',').map((x) => Number(x.trim())); return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]; }
  throw new Error(`not a color: ${v}`);
}
const lum = ([r, g, b]: number[]) => {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
};
function contrast(fg: string, bg: string): number {
  const a = lum(rgb(fg)), b = lum(rgb(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** [text token, background token, minimum ratio]: 4.5 for text, 3 for large text, icons and borders. */
const PAIRS: [string, string, number][] = [
  ...['--bg', '--card', '--plum-tint'].flatMap((bg): [string, string, number][] => [['--ink', bg, 4.5], ['--muted', bg, 4.5], ['--plum', bg, 4.5]]),
  ['--bronze-text', '--bg', 4.5], ['--bronze-text', '--card', 4.5],
  ['--ok', '--card', 4.5], ['--ok', '--bg', 4.5], ['--ok-ink', '--ok-bg', 4.5], ['--ink', '--ok-bg', 4.5],
  ['--bad-ink', '--bad-bg', 4.5], ['--bad-ink', '--card', 4.5], ['--bad-ink', '--bg', 4.5], ['--ink', '--bad-bg', 4.5],
  ['--on-fill', '--plum-fill', 4.5], ['--on-fill', '--ok-fill', 4.5], ['--on-fill', '--bad-fill', 4.5],
  ['--on-fill', '--banner-locked', 4.5], ['--on-fill', '--bronze-fill', 3],
  ['--muted', '--locked', 3], ['--muted', '--line', 3], ['--plum', '--card', 3], ['--ok', '--ok-bg', 3], ['--bad', '--bad-bg', 3],
  ['--focus', '--bg', 3], ['--focus', '--card', 3],
];

describe('theme tokens', () => {
  it('the two dark blocks are identical and cover every light color token', () => {
    expect([...darkAttr.entries()]).toEqual([...darkMedia.entries()]);
    for (const k of colorKeys) expect(darkMedia.has(k), k).toBe(true);
    expect(light.get('color-scheme')).toBe('light');
    expect(darkMedia.get('color-scheme')).toBe('dark');
  });
  it('the dark block sits inside prefers-color-scheme: dark', () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\) \{/);
  });
  it('no stylesheet or component hard-codes a color outside the token blocks', () => {
    const bodyOnly = css.slice(css.indexOf('* { box-sizing'));
    const sheets = [bodyOnly, ...readdirSync(UI).filter((f) => f.endsWith('.css') && f !== 'styles.css' && f !== 'fonts.css').map((f) => readFileSync(resolve(UI, f), 'utf8'))];
    for (const s of sheets) expect(s.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi) ?? []).toEqual([]);
    for (const f of readdirSync(UI).filter((f) => f.endsWith('.tsx'))) {
      const src = readFileSync(resolve(UI, f), 'utf8');
      expect(src.match(/['"]#[0-9a-f]{3,8}['"]|rgba?\(/gi) ?? [], f).toEqual([]);
    }
  });
  for (const [name, theme] of [['light', light], ['dark', darkMedia]] as const) {
    it(`${name}: text and UI pairs meet WCAG AA`, () => {
      const bad: string[] = [];
      for (const [fg, bg, min] of PAIRS) {
        const r = contrast(theme.get(fg)!, theme.get(bg)!);
        if (r < min) bad.push(`${fg} on ${bg}: ${r.toFixed(2)} < ${min}`);
      }
      expect(bad).toEqual([]);
    });
  }
  it('the PWA theme-color metas: brand plum in light, the page background in dark', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');
    expect(html).toContain(`<meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLORS.light}" />`);
    expect(html).toContain(`<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_COLORS.dark}" />`);
    expect(THEME_COLORS.light).toBe(light.get('--plum-fill'));
    expect(THEME_COLORS.dark).toBe(darkMedia.get('--bg'));
  });
});
