/** SyncStore over the app's IndexedDB (src/data/db.ts). */
import { getMeta, markSent, outboxEvents, putRemoteEvents, setMeta } from '../data/db.ts';
import type { SyncStore } from './sync.ts';

const CURSOR_KEY = 'syncCursor';

export const idbSyncStore: SyncStore = {
  outbox: outboxEvents,
  markSent,
  addRemote: putRemoteEvents,
  async getCursor() {
    const v = Number(await getMeta(CURSOR_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  },
  setCursor: (c) => setMeta(CURSOR_KEY, String(c)),
};
