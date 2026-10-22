import { buildBackup, collectData, parseBackup, restoreBackup, serializeBackup } from '../backup/backup';
import { getDb, type FinanzasDB } from '../db/db';

/**
 * Sincronización con el servidor autohospedado (sync-server/server.mjs o el
 * servidor incorporado en la versión de escritorio).
 * Los datos viajan y se guardan CIFRADOS con la frase de sincronización: el
 * servidor nunca ve información financiera legible.
 */
export interface SyncConfig {
  serverUrl: string;
  space: string;
  token: string;
  passphrase: string;
}

export interface SyncOutcome {
  pulled: boolean;
  pushed: boolean;
  pushedVersion: number;
  incorporated: number;
}

interface SyncState {
  /** Última versión del servidor que este dispositivo conoce. */
  version: number;
  /** Huella de los datos locales al terminar la última sincronización. */
  stamp: string;
  space: string;
  serverUrl: string;
}

type FetchLike = typeof fetch;

export function normalizeServerUrl(u: string): string {
  let base = u.trim().replace(/\/+$/, '');
  if (base && !/^https?:\/\//i.test(base)) base = `http://${base}`;
  return base;
}

function endpoint(cfg: SyncConfig) {
  const base = normalizeServerUrl(cfg.serverUrl);
  if (!/^https?:\/\/[^/]+/i.test(base)) throw new Error('La dirección del servidor no es válida.');
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(cfg.space)) throw new Error('El nombre del espacio solo admite letras, números, "-" y "_" (3 a 64).');
  return `${base}/api/spaces/${cfg.space}`;
}

export async function checkServer(cfg: Pick<SyncConfig, 'serverUrl' | 'token'>, f: FetchLike = fetch): Promise<boolean> {
  const r = await f(`${normalizeServerUrl(cfg.serverUrl)}/api/health`, { headers: { Authorization: `Bearer ${cfg.token}` } });
  return r.ok;
}

/**
 * Busca la PC en la misma red Wi-Fi cuando cambió su dirección (el router le da otra al reconectarse).
 * Prueba las 254 direcciones de la red de la dirección guardada, en el mismo puerto; solo responde
 * nuestro servidor con este token. Devuelve la nueva dirección o null.
 */
export async function findServer(cfg: Pick<SyncConfig, 'serverUrl' | 'token'>, f: FetchLike = fetch, timeoutMs = 1500): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(normalizeServerUrl(cfg.serverUrl));
  } catch {
    return null;
  }
  const m = u.hostname.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})$/);
  if (!m || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)) return null;
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  const hosts = Array.from({ length: 254 }, (_, i) => i + 1).filter((h) => String(h) !== m[2]);
  let found: string | null = null;
  let next = 0;
  const worker = async () => {
    while (!found && next < hosts.length) {
      const base = `${u.protocol}//${m[1]}.${hosts[next++]}:${port}`;
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await f(`${base}/api/health`, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: ctl.signal });
        if (r.ok && !found) found = base;
      } catch {
        /* no está ahí */
      } finally {
        clearTimeout(t);
      }
    }
  };
  await Promise.all(Array.from({ length: 32 }, worker));
  return found;
}

/** Huella barata del estado local: cantidad de registros y última modificación. */
export async function localStamp(db: FinanzasDB = getDb()): Promise<string> {
  return stampOf(await collectData(db));
}

function stampOf(data: Record<string, Array<Record<string, unknown>>>): string {
  let n = 0;
  let max = '';
  for (const rows of Object.values(data)) {
    n += rows.length;
    for (const r of rows) if (typeof r.updatedAt === 'string' && r.updatedAt > max) max = r.updatedAt;
  }
  return `${n}:${max}`;
}

async function loadState(db: FinanzasDB, cfg: SyncConfig): Promise<SyncState | null> {
  const s = (await db.meta.get('syncState'))?.value as SyncState | undefined;
  if (!s || s.space !== cfg.space || s.serverUrl !== normalizeServerUrl(cfg.serverUrl)) return null;
  return s;
}

/**
 * Descarga (si hubo cambios), fusiona y sube el estado combinado (si hay algo nuevo).
 * Usa control de versiones: si otro dispositivo subió cambios en el medio, repite.
 */
export async function syncNow(cfg: SyncConfig, db: FinanzasDB = getDb(), f: FetchLike = fetch): Promise<SyncOutcome> {
  if (!cfg.passphrase || cfg.passphrase.length < 8) throw new Error('La frase de sincronización debe tener al menos 8 caracteres.');
  const url = endpoint(cfg);
  const headers = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };
  let state = await loadState(db, cfg);
  for (let attempt = 0; attempt < 4; attempt++) {
    const get = await f(state ? `${url}?known=${state.version}` : url, { headers });
    let version = 0;
    let incorporated = 0;
    let pulled = false;
    let remoteStamp: string | null = null;
    if (get.status === 204 && state) {
      version = state.version;
    } else if (get.status === 200) {
      const body = (await get.json()) as { version: number; blob: string };
      version = body.version;
      const remote = await parseBackup(body.blob, cfg.passphrase);
      remoteStamp = stampOf(remote.data);
      const res = await restoreBackup(remote, 'fusionar', db, 'sincronizar');
      incorporated = Object.values(res.stats).reduce((a, s) => a + s.added + s.updated, 0);
      pulled = true;
    } else if (get.status === 401 || get.status === 403) {
      throw new Error('El servidor rechazó el token de acceso.');
    } else if (get.status !== 404) {
      throw new Error(`Error del servidor de sincronización (${get.status}).`);
    }
    const stamp = await localStamp(db);
    // Nada que subir: el servidor ya tiene exactamente lo mismo que este dispositivo.
    const upToDate = pulled ? stamp === remoteStamp : get.status === 204 && !!state && stamp === state.stamp;
    if (upToDate) {
      state = { version, stamp, space: cfg.space, serverUrl: normalizeServerUrl(cfg.serverUrl) };
      await db.meta.put({ key: 'syncState', value: state });
      return { pulled, pushed: false, pushedVersion: version, incorporated };
    }
    const blob = await serializeBackup(await buildBackup({}, db), cfg.passphrase);
    const put = await f(url, { method: 'PUT', headers: { ...headers, 'If-Match': String(version) }, body: JSON.stringify({ blob }) });
    if (put.status === 409) {
      state = null; // otro dispositivo subió cambios: descargar completo y fusionar de nuevo
      continue;
    }
    if (!put.ok) throw new Error(`No se pudo subir la sincronización (${put.status}).`);
    const done = (await put.json()) as { version: number };
    state = { version: done.version, stamp, space: cfg.space, serverUrl: normalizeServerUrl(cfg.serverUrl) };
    await db.meta.put({ key: 'syncState', value: state });
    return { pulled, pushed: true, pushedVersion: done.version, incorporated };
  }
  throw new Error('Conflicto persistente de sincronización. Intente nuevamente.');
}

/** Código de emparejamiento: dirección, espacio y token (la frase se ingresa aparte). */
export function makePairingCode(p: { serverUrl: string; space: string; token: string }): string {
  const json = JSON.stringify({ u: p.serverUrl, s: p.space, t: p.token });
  return `FP1-${btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export function parsePairingCode(code: string): { serverUrl: string; space: string; token: string } {
  const m = code.trim().match(/^FP1-([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error('Código de emparejamiento inválido.');
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const o = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    if (typeof o.u !== 'string' || typeof o.s !== 'string' || typeof o.t !== 'string') throw new Error();
    return { serverUrl: o.u, space: o.s, token: o.t };
  } catch {
    throw new Error('Código de emparejamiento inválido.');
  }
}
