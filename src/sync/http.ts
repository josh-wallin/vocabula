/**
 * fetch wrapper for /api/* that never throws and classifies failures.
 *
 * The whole host sits behind Cloudflare Access. When the Access session has
 * expired, Access answers an API call with a redirect to the team login page;
 * with `redirect: 'manual'` the browser surfaces that as an `opaqueredirect`
 * response (status 0). That, a 3xx, a 401/403, or a 2xx that isn't JSON (a
 * login page) all mean "sign in again".
 */
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type ApiResult<T> =
  | { kind: 'ok'; status: number; data: T; etag: string | null }
  | { kind: 'not-modified' }
  | { kind: 'missing'; message: string }
  | { kind: 'auth' }
  | { kind: 'offline' }
  | { kind: 'error'; status: number; message: string };

export type ApiFailure = Exclude<ApiResult<never>, { kind: 'ok' } | { kind: 'not-modified' }>;

/** Where "Sign in again" sends the browser: a network navigation Access can intercept, then back to the app. */
export const SIGN_IN_URL = '/api/me?return=/';

export function signInAgain(): void {
  location.href = SIGN_IN_URL;
}

const defaultFetch: FetchFn = (input, init) => fetch(input, init);

export const isJsonType = (ct: string | null): boolean => !!ct && /^application\/([\w.+-]*\+)?json\b/i.test(ct.trim());

/** Strip quotes / weak prefix from an ETag header. */
export const etagValue = (h: string | null): string | null => (h ? h.trim().replace(/^W\//, '').replace(/^"|"$/g, '') : null);

export async function apiFetch<T>(path: string, init: RequestInit = {}, fetchFn: FetchFn = defaultFetch): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetchFn(path, {
      credentials: 'same-origin', redirect: 'manual', cache: 'no-store', ...init,
      headers: { accept: 'application/json', ...(init.headers as Record<string, string> | undefined) },
    });
  } catch {
    // With redirect:'manual' a CORS/login failure can't surface here, so this is the network.
    return { kind: 'offline' };
  }
  if (res.type === 'opaqueredirect' || res.status === 0) return { kind: 'auth' };
  if (res.status === 304) return { kind: 'not-modified' };
  if (res.status >= 300 && res.status < 400) return { kind: 'auth' };
  if (res.status === 401 || res.status === 403) return { kind: 'auth' };
  const json = isJsonType(res.headers.get('content-type'));
  if (res.ok) {
    if (!json) return { kind: 'auth' };
    try {
      return { kind: 'ok', status: res.status, data: (await res.json()) as T, etag: etagValue(res.headers.get('etag')) };
    } catch {
      return { kind: 'error', status: res.status, message: 'The server sent unreadable JSON.' };
    }
  }
  let message = `Server error ${res.status}`;
  if (json) { try { message = ((await res.json()) as { error?: string }).error ?? message; } catch { /* keep default */ } }
  if (res.status === 404 && json) return { kind: 'missing', message };
  return { kind: 'error', status: res.status, message };
}

export function failureText(r: ApiFailure): string {
  switch (r.kind) {
    case 'auth': return 'Your sign-in has expired.';
    case 'offline': return 'You’re offline (or the server can’t be reached).';
    case 'missing': return r.message;
    case 'error': return r.message;
  }
}
