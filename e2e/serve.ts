/**
 * Shared e2e server plumbing: ports, an occupied-port guard, and cleanup that
 * stops every server a script started, however the script ends.
 *
 * Ports: E2E_PORT (default 4179) for `vite preview`; the sync test uses
 * E2E_SYNC_PORT, else E2E_PORT + 1 (default 4181); the voice test uses
 * E2E_COMPARE_PORT, else E2E_PORT + 2 (default 4183).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as netServer } from 'node:net';
import type { Server } from 'node:http';

function envPort(name: string): number | undefined {
  const v = process.env[name];
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) throw new Error(`${name}=${v} is not a port number`);
  return n;
}
const base = envPort('E2E_PORT');
export const PREVIEW_PORT = base ?? 4179;
export const SYNC_PORT = envPort('E2E_SYNC_PORT') ?? (base !== undefined ? base + 1 : 4181);
export const COMPARE_PORT = envPort('E2E_COMPARE_PORT') ?? (base !== undefined ? base + 2 : 4183);

/** Can we bind `port` on this host? (Both loopback families; a missing IPv6 stack doesn't count.) */
async function canBind(port: number, host: string): Promise<boolean> {
  return new Promise((done) => {
    const s = netServer();
    s.once('error', (e: NodeJS.ErrnoException) => done(e.code === 'EADDRNOTAVAIL' || e.code === 'EAFNOSUPPORT'));
    s.listen({ port, host, exclusive: true }, () => s.close(() => done(true)));
  });
}
export async function portFree(port: number): Promise<boolean> {
  for (const host of ['127.0.0.1', '::1', '0.0.0.0', '::']) if (!(await canBind(port, host))) return false;
  // Something answering HTTP there (e.g. through a proxy) is also "occupied".
  return !(await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false));
}

/** Refuse to test someone else's server (e.g. a preview left running from another checkout). */
export async function assertPortFree(port: number, envName: string): Promise<void> {
  if (!(await portFree(port))) throw new Error(`port ${port} is already in use: stop whatever is serving there or set ${envName}`);
}

const children = new Map<ChildProcess, number>();
const servers = new Set<Server>();

function killChild(c: ChildProcess): void {
  // Even if npx itself has exited, the vite it started may live on in the group.
  // Negative pid: the whole process group (npx and the vite it starts).
  try { process.kill(-c.pid!, 'SIGTERM'); } catch { try { c.kill('SIGTERM'); } catch { /* already gone */ } }
}

let hooked = false;
function hookExit(): void {
  if (hooked) return;
  hooked = true;
  // Last resort on any exit path (thrown error → process.exit(1), Ctrl-C, kill): synchronous kills only.
  process.on('exit', () => { for (const c of children.keys()) killChild(c); });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => { for (const c of children.keys()) killChild(c); process.exit(sig === 'SIGINT' ? 130 : 143); });
  }
}

/** `vite preview` of dist/ on `port`, in its own process group so it can be killed with its children. */
export function startPreview(root: string, port: number): ChildProcess {
  hookExit();
  const c = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
  children.set(c, port);
  return c;
}

/** Listen with an in-process HTTP server; closed by stopServers (and by process exit). */
export async function listen(server: Server, port: number): Promise<void> {
  hookExit();
  await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(port, () => { server.off('error', fail); ok(); }); });
  servers.add(server);
}

export async function waitForHttp(url: string, tries = 100): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server at ${url} did not start`);
}

/** Stop every server this script started and wait until their ports are released. */
export async function stopServers(): Promise<void> {
  const waits: Promise<unknown>[] = [];
  for (const s of servers) {
    waits.push(new Promise((r) => s.close(r)));
    s.closeAllConnections();
  }
  servers.clear();
  for (const [c, port] of children) {
    waits.push((async () => {
      if (c.exitCode === null && c.signalCode === null) {
        await new Promise((r) => {
          const t = setTimeout(() => { try { process.kill(-c.pid!, 'SIGKILL'); } catch { /* gone */ } r(undefined); }, 5000);
          c.once('exit', () => { clearTimeout(t); r(undefined); });
          killChild(c);
        });
      }
      // npx exits before the vite it started; wait for the port itself.
      for (let i = 0; i < 50 && !(await canBind(port, '127.0.0.1')); i++) await new Promise((r) => setTimeout(r, 100));
    })());
  }
  children.clear();
  await Promise.all(waits);
}
