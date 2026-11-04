/**
 * Wire protocol shared by the client sync code and the Worker (worker/).
 * Pure types and constants only.
 */
import type { VEvent } from '../engine/events.ts';

export const API = {
  me: '/api/me',
  pack: '/api/pack',
  packStatus: '/api/pack/status',
  events: '/api/events',
} as const;

export const MAX_PACK_BYTES = 2 * 1024 * 1024;
export const MAX_EVENTS_PER_POST = 500;
export const MAX_EVENTS_BODY_BYTES = 4 * 1024 * 1024;
export const DEFAULT_PULL_LIMIT = 1000;
export const MAX_PULL_LIMIT = 1000;

export interface MeResponse { email: string }
export interface PackStatus { present: boolean; hash?: string; id?: string; lemmas?: number; updatedAt?: string }
export interface PutPackResponse { hash: string; id: string; lemmas: number; updatedAt: string }
export interface PostEventsRequest { events: VEvent[] }
export interface PostEventsResponse { accepted: number; cursor: number }
export type ServerEvent = VEvent & { seq: number };
export interface GetEventsResponse { events: ServerEvent[]; cursor: number; more: boolean }
export interface ApiError { error: string }
