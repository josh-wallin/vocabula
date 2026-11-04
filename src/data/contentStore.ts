/**
 * The one place the app gets its content from.
 *
 * Public, bundled: the DCC core list (CC BY-SA, src/content/dccList.ts, its own chunk); the
 * grammar chapters are src/content/chapters.ts, loaded with the chapter reader.
 * Private: the Wheelock-derived content pack, kept in IndexedDB. It arrives
 * either from the sync server (GET /api/pack, behind Cloudflare Access) or from
 * a file the user imports; Profile can upload the device's pack to the server.
 * Progress lives in the event log, so replacing the pack never touches it.
 */
import type { Lemma } from '../morph/types.ts';
import { packHash, packText, parsePack, type ContentPack } from './pack.ts';
import type { FrEntry } from './fr.ts';
import { getPack, getPackRecord, savePack } from './db.ts';
import { apiFetch, type ApiFailure, type FetchFn } from '../sync/http.ts';
import { API, type PackStatus, type PutPackResponse } from '../sync/protocol.ts';

export interface Content {
  pack: ContentPack;
  wheelock: Lemma[];
  dcc: Lemma[];
  /** Familia Rōmāna preview words from the pack (empty for packs without them). */
  fr: FrEntry[];
}

/** Load content if a pack has been imported on this device; null means "show the import screen". */
export async function loadContent(): Promise<Content | null> {
  const pack = await getPack();
  if (!pack) return null;
  // The DCC list is a separate chunk (src/content/dccList.ts), precached like the rest.
  const { dccLemmas } = await import('../content/dccList.ts');
  return { pack, wheelock: pack.lemmas, dcc: dccLemmas(), fr: pack.fr ?? [] };
}

/** Validate and store a pack from file text or pasted text. Throws a readable error. */
export async function importPack(text: string): Promise<ContentPack> {
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^﻿/, '')); } catch { throw new Error('That isn’t valid JSON. Pick the vocabula-pack.json file, or paste its full contents.'); }
  const pack = parsePack(raw);
  await savePack(pack, await packHash(pack), 'file');
  return pack;
}

/** Hash of the stored pack (computed and cached for packs stored before hashes existed). */
export async function localPackHash(): Promise<string | null> {
  const rec = await getPackRecord();
  if (!rec) return null;
  if (rec.hash) return rec.hash;
  const h = await packHash(rec.pack);
  await savePack(rec.pack, h, rec.source);
  return h;
}

export type PackFetch =
  | { kind: 'updated'; pack: ContentPack }
  | { kind: 'unchanged' }
  /** The server's pack is older than the one on this device (e.g. imported but not yet uploaded). */
  | { kind: 'kept-local' }
  | { kind: 'invalid'; message: string }
  | ApiFailure;

/**
 * GET /api/pack with If-None-Match of the stored pack's hash. A different,
 * not-older pack is validated and stored (progress is untouched). Never throws.
 */
export async function fetchPackFromServer(fetchFn?: FetchFn): Promise<PackFetch> {
  try {
    const rec = await getPackRecord();
    const local = rec ? await localPackHash() : null;
    const r = await apiFetch<unknown>(API.pack, { headers: local ? { 'if-none-match': `"${local}"` } : {} }, fetchFn);
    if (r.kind === 'not-modified') return { kind: 'unchanged' };
    if (r.kind !== 'ok') return r;
    let pack: ContentPack;
    try { pack = parsePack(r.data); } catch (e) { return { kind: 'invalid', message: (e as Error).message }; }
    const hash = r.etag ?? (await packHash(pack));
    if (hash === local) return { kind: 'unchanged' };
    if (rec && rec.pack.builtAt > pack.builtAt) return { kind: 'kept-local' };
    await savePack(pack, hash, 'server');
    return { kind: 'updated', pack };
  } catch (e) {
    return { kind: 'error', status: 0, message: (e as Error).message };
  }
}

/** PUT this device's pack to the server. Never throws. */
export async function uploadPackToServer(fetchFn?: FetchFn): Promise<{ kind: 'ok'; data: PutPackResponse } | ApiFailure | { kind: 'no-pack' }> {
  const pack = await getPack();
  if (!pack) return { kind: 'no-pack' };
  const r = await apiFetch<PutPackResponse>(API.pack, {
    method: 'PUT', body: packText(pack), headers: { 'content-type': 'application/json' },
  }, fetchFn);
  if (r.kind === 'ok') {
    await savePack(pack, r.data.hash, (await getPackRecord())?.source ?? 'file');
    return { kind: 'ok', data: r.data };
  }
  return r.kind === 'not-modified' ? { kind: 'error', status: 304, message: 'Unexpected 304' } : r;
}

export async function serverPackStatus(fetchFn?: FetchFn): Promise<{ kind: 'ok'; data: PackStatus } | ApiFailure> {
  const r = await apiFetch<PackStatus>(API.packStatus, {}, fetchFn);
  if (r.kind === 'ok') return { kind: 'ok', data: r.data };
  return r.kind === 'not-modified' ? { kind: 'error', status: 304, message: 'Unexpected 304' } : r;
}
