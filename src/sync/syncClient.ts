import { buildBackup, parseBackup, restoreBackup, serializeBackup } from '../backup/backup';
import { getDb, type FinanzasDB } from '../db/db';

/**
 * Sincronización con un servidor autohospedado (sync-server/server.mjs).
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
  pushedVersion: number;
  incorporated: number;
}

type FetchLike = typeof fetch;

function endpoint(cfg: SyncConfig) {
  const base = cfg.serverUrl.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) throw new Error('La dirección del servidor debe comenzar con http:// o https://');
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(cfg.space)) throw new Error('El nombre del espacio solo admite letras, números, "-" y "_" (3 a 64).');
  return `${base}/api/spaces/${cfg.space}`;
}

export async function checkServer(cfg: Pick<SyncConfig, 'serverUrl' | 'token'>, f: FetchLike = fetch): Promise<boolean> {
  const r = await f(`${cfg.serverUrl.replace(/\/+$/, '')}/api/health`, { headers: { Authorization: `Bearer ${cfg.token}` } });
  return r.ok;
}

/** Descarga, fusiona y vuelve a subir el estado combinado. Reintenta ante conflictos. */
export async function syncNow(cfg: SyncConfig, db: FinanzasDB = getDb(), f: FetchLike = fetch): Promise<SyncOutcome> {
  if (!cfg.passphrase || cfg.passphrase.length < 8) throw new Error('La frase de sincronización debe tener al menos 8 caracteres.');
  const url = endpoint(cfg);
  const headers = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };
  for (let attempt = 0; attempt < 3; attempt++) {
    const get = await f(url, { headers });
    let version = 0;
    let incorporated = 0;
    let pulled = false;
    if (get.status === 200) {
      const body = (await get.json()) as { version: number; blob: string };
      version = body.version;
      const remote = await parseBackup(body.blob, cfg.passphrase);
      const res = await restoreBackup(remote, 'fusionar', db, 'sincronizar');
      incorporated = Object.values(res.stats).reduce((a, s) => a + s.added + s.updated, 0);
      pulled = true;
    } else if (get.status === 401 || get.status === 403) {
      throw new Error('El servidor rechazó el token de acceso.');
    } else if (get.status !== 404) {
      throw new Error(`Error del servidor de sincronización (${get.status}).`);
    }
    const blob = await serializeBackup(await buildBackup({}, db), cfg.passphrase);
    const put = await f(url, { method: 'PUT', headers: { ...headers, 'If-Match': String(version) }, body: JSON.stringify({ blob }) });
    if (put.status === 409) continue; // otro dispositivo subió cambios: repetir descarga y fusión
    if (!put.ok) throw new Error(`No se pudo subir la sincronización (${put.status}).`);
    const done = (await put.json()) as { version: number };
    return { pulled, pushedVersion: done.version, incorporated };
  }
  throw new Error('Conflicto persistente de sincronización. Intente nuevamente.');
}
