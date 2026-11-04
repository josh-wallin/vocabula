import { describe, expect, it } from 'vitest';
import { join, stripMacrons } from '../src/morph/phonology.ts';

describe('vowel shortening at the stem/ending junction', () => {
  it('shortens before final -t, -m, -r', () => {
    expect(join('laudā', 't')).toBe('laudat');
    expect(join('laudā', 'm')).toBe('laudam');
    expect(join('laudā', 'r')).toBe('laudar');
  });
  it('shortens before nt / nd', () => {
    expect(join('laudā', 'nt')).toBe('laudant');
    expect(join('laudā', 'ndum')).toBe('laudandum');
  });
  it('shortens before another vowel', () => {
    expect(join('monē', 'ō')).toBe('moneō');
  });
  it('keeps length before -s, -mus, -tis, -re, -te', () => {
    expect(join('laudā', 's')).toBe('laudās');
    expect(join('laudā', 'mus')).toBe('laudāmus');
    expect(join('laudā', 'tis')).toBe('laudātis');
    expect(join('laudā', 're')).toBe('laudāre');
    expect(join('monē', 'te')).toBe('monēte');
  });
  it('normalizes decomposed input to NFC', () => {
    expect(join('laudā', 's')).toBe('laudās');
  });
  it('strips macrons', () => {
    expect(stripMacrons('cōnsiliōrum')).toBe('consiliorum');
  });
});
