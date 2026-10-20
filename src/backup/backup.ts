import { getDb, type FinanzasDB } from '../db/db';
import { addAudit, ensureInitialized, getDeviceId, notify, nowIso } from '../db/repo';
import { SYNC_TABLES, type BaseRecord, type SyncTable } from '../domain/types';
import { decryptString, encryptString, fromB64, toB64, type EncryptedEnvelope } from './crypto';
import { mergeTable, type MergeStats } from './merge';
import { safeJsonParse, validateBackupData, type BackupData } from './validate';

export const BACKUP_FORMAT = 'finanzas-personales-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

export interface PlainBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  deviceId: string;
  encrypted: false;
  data: BackupData;
  blobs?: Array<{ id: string; mime: string; base64: string }>;
}

export interface EncryptedBackup extends EncryptedEnvelope {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  encrypted: true;
}

export async function collectData(db: FinanzasDB = getDb()): Promise<BackupData> {
  const data: BackupData = {};
  for (const t of SYNC_TABLES) data[t] = (await db.table(t).toArray()) as Record<string, unknown>[];
  return data;
}

export async function buildBackup(opts: { includeBlobs?: boolean } = {}, db: FinanzasDB = getDb()): Promise<PlainBackup> {
  const backup: PlainBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: nowIso(),
    deviceId: await getDeviceId(db),
    encrypted: false,
    data: await collectData(db),
  };
  if (opts.includeBlobs) {
    backup.blobs = [];
    for (const row of await db.blobs.toArray()) {
      backup.blobs.push({ id: row.id, mime: row.blob.type, base64: toB64(new Uint8Array(await row.blob.arrayBuffer())) });
    }
  }
  return backup;
}

export async function serializeBackup(backup: PlainBackup, password?: string): Promise<string> {
  const json = JSON.stringify(backup);
  if (!password) return json;
  const env = await encryptString(json, password);
  const enc: EncryptedBackup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: backup.exportedAt, encrypted: true, ...env };
  return JSON.stringify(enc);
}

export function isEncryptedBackup(text: string): boolean {
  try {
    const o = safeJsonParse(text) as { encrypted?: boolean };
    return o?.encrypted === true;
  } catch {
    return false;
  }
}

/** Interpreta y valida una copia (cifrada o no). */
export async function parseBackup(text: string, password?: string): Promise<PlainBackup> {
  if (text.length > MAX_BACKUP_BYTES) throw new Error('La copia es demasiado grande.');
  let obj: unknown;
  try {
    obj = safeJsonParse(text);
  } catch {
    throw new Error('El archivo no es una copia de seguridad válida (JSON dañado).');
  }
  const o = obj as Record<string, unknown>;
  if (o?.format !== BACKUP_FORMAT) throw new Error('El archivo no es una copia de seguridad de esta aplicación.');
  if (typeof o.version !== 'number' || o.version > BACKUP_VERSION) throw new Error('La copia fue creada con una versión más nueva de la aplicación.');
  if (o.encrypted === true) {
    if (!password) throw new Error('La copia está cifrada: ingrese la contraseña.');
    const plain = await decryptString(o as unknown as EncryptedEnvelope, password);
    return parseBackup(plain);
  }
  const data = validateBackupData(o.data);
  const blobs = Array.isArray(o.blobs)
    ? (o.blobs as unknown[]).filter((b): b is { id: string; mime: string; base64: string } => {
        const x = b as Record<string, unknown>;
        return typeof x?.id === 'string' && typeof x?.mime === 'string' && typeof x?.base64 === 'string';
      })
    : undefined;
  return { format: BACKUP_FORMAT, version: o.version as number, exportedAt: String(o.exportedAt ?? ''), deviceId: String(o.deviceId ?? ''), encrypted: false, data, blobs };
}

export interface RestoreResult {
  mode: 'reemplazar' | 'fusionar';
  stats: Record<string, MergeStats>;
}

/**
 * Restaura una copia.
 * - reemplazar: borra los datos locales y los sustituye por los de la copia.
 * - fusionar: combina registro a registro (el más reciente gana); es el mecanismo de sincronización.
 */
export async function restoreBackup(backup: PlainBackup, mode: 'reemplazar' | 'fusionar', db: FinanzasDB = getDb(), auditAction: 'restaurar' | 'sincronizar' = 'restaurar'): Promise<RestoreResult> {
  const stats: Record<string, MergeStats> = {};
  await db.transaction('rw', db.tables, async () => {
    if (mode === 'reemplazar') {
      for (const t of db.tables) if (t.name !== 'meta') await t.clear();
    }
    for (const t of SYNC_TABLES) {
      const remote = (backup.data[t] ?? []) as unknown as BaseRecord[];
      const local = mode === 'reemplazar' ? [] : ((await db.table(t).toArray()) as BaseRecord[]);
      const { toPut, stats: s } = mergeTable(local, remote);
      if (toPut.length) await db.table(t as SyncTable).bulkPut(toPut);
      stats[t] = s;
    }
    if (backup.blobs) {
      for (const b of backup.blobs) {
        const doc = await db.documents.get(b.id);
        if (doc && !doc.deleted) await db.blobs.put({ id: b.id, blob: new Blob([fromB64(b.base64) as BlobPart], { type: b.mime }) });
      }
    }
    const added = Object.values(stats).reduce((a, s) => a + s.added + s.updated, 0);
    // Las sincronizaciones no se anotan en el historial sincronizado: cada anotación sería un cambio
    // nuevo que el otro dispositivo volvería a recibir y reenviar indefinidamente.
    if (auditAction !== 'sincronizar')
      await addAudit(db, auditAction, 'copia', undefined, `${mode === 'reemplazar' ? 'Restauración completa' : 'Fusión'}: ${added} registro(s) incorporados`);
  });
  await ensureInitialized(db);
  notify();
  return { mode, stats };
}
