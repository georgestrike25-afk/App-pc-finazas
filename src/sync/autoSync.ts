import { getDb } from '../db/db';
import { mergeSancorCoupons, notify, subscribe } from '../db/repo';
import { findServer, syncNow, type SyncConfig } from './syncClient';

export interface StoredSyncConfig extends SyncConfig {
  /** Sincronizar automáticamente (requiere recordar la frase en este dispositivo). */
  auto: boolean;
}

export interface SyncStatus {
  state: 'inactivo' | 'sincronizando' | 'ok' | 'error';
  message: string;
  at?: string;
}

let status: SyncStatus = { state: 'inactivo', message: '' };
const subs = new Set<(s: SyncStatus) => void>();
let running = false;
let started = false;
let debounce: ReturnType<typeof setTimeout> | null = null;
let lastAttempt = 0;
let lastSearch = 0;

function setStatus(s: SyncStatus) {
  status = s;
  subs.forEach((f) => f(s));
}

export function getSyncStatus() {
  return status;
}

export function onSyncStatus(f: (s: SyncStatus) => void): () => void {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

export async function loadSyncConfig(): Promise<StoredSyncConfig | null> {
  const v = (await getDb().meta.get('syncConfig'))?.value as StoredSyncConfig | undefined;
  return v ?? null;
}

/** Guarda la configuración. La frase solo se conserva si la sincronización automática está activada. */
export async function saveSyncConfig(cfg: StoredSyncConfig) {
  await getDb().meta.put({ key: 'syncConfig', value: { ...cfg, passphrase: cfg.auto ? cfg.passphrase : '' } });
}

function complete(c: StoredSyncConfig | null): c is StoredSyncConfig {
  return !!c && !!c.serverUrl && !!c.space && !!c.token && c.passphrase.length >= 8;
}

/** Ejecuta una sincronización (manual o automática). Nunca corre dos a la vez. */
export async function runSync(cfgOverride?: StoredSyncConfig): Promise<SyncStatus> {
  const cfg = cfgOverride ?? (await loadSyncConfig());
  if (!complete(cfg)) return status;
  if (running) return status;
  running = true;
  lastAttempt = Date.now();
  setStatus({ ...status, state: 'sincronizando', message: 'Sincronizando…' });
  try {
    let r;
    try {
      r = await syncNow(cfg);
    } catch (e) {
      // La PC no responde en la dirección guardada: puede haber cambiado su dirección en el Wi-Fi.
      if (!(e instanceof TypeError) || (!cfgOverride && Date.now() - lastSearch < 5 * 60_000)) throw e;
      lastSearch = Date.now();
      setStatus({ ...status, state: 'sincronizando', message: 'Buscando la PC en tu Wi-Fi…' });
      const url = await findServer(cfg);
      if (!url) throw e;
      cfg.serverUrl = url;
      await saveSyncConfig(cfg);
      r = await syncNow(cfg);
    }
    // Datos de un dispositivo con una versión anterior: se unen los cupones de Sancor del mismo resumen.
    if (r.incorporated && (await mergeSancorCoupons())) notify();
    const at = new Date().toISOString();
    await getDb().meta.put({ key: 'lastSync', value: at });
    setStatus({
      state: 'ok',
      at,
      message: r.incorporated ? `${r.incorporated} cambio(s) recibidos` : r.pushed ? 'Cambios enviados' : 'Sin cambios',
    });
  } catch (e) {
    const msg =
      e instanceof TypeError
        ? 'No se encontró la PC en tu Wi-Fi. Fijate que esté prendida con la app abierta y en el mismo Wi-Fi que el celular; si es así, revisá el firewall de Windows (instrucciones en Copias, en la PC).'
        : (e as Error).message;
    setStatus({ state: 'error', message: msg, at: status.at });
  } finally {
    running = false;
  }
  return status;
}

/** Sincronización automática: al abrir, al volver a la app, al recuperar conexión, cada 5 minutos y tras cambios. */
export function startAutoSync() {
  if (started) return;
  started = true;
  const maybe = async (minGapMs: number) => {
    const cfg = await loadSyncConfig();
    if (!cfg?.auto || !complete(cfg) || Date.now() - lastAttempt < minGapMs) return;
    await runSync(cfg);
  };
  getDb()
    .meta.get('lastSync')
    .then((r) => r && setStatus({ state: 'inactivo', message: '', at: r.value as string }));
  setTimeout(() => maybe(0), 2000);
  setInterval(() => maybe(60_000), 5 * 60_000);
  document.addEventListener('visibilitychange', () => !document.hidden && maybe(30_000));
  window.addEventListener('online', () => maybe(0));
  subscribe(() => {
    if (running) return; // los cambios recibidos por la propia sincronización no disparan otra
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => maybe(0), 15_000);
  });
}
