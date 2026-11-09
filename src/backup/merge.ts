import type { BaseRecord, Settings } from '../domain/types';

export interface MergeStats {
  added: number;
  updated: number;
  unchanged: number;
  keptLocal: number;
}

/** true si el registro remoto debe reemplazar al local (último en escribir gana). */
export function remoteWins(local: BaseRecord | undefined, remote: BaseRecord): boolean {
  if (!local) return true;
  const lt = Date.parse(local.updatedAt);
  const rt = Date.parse(remote.updatedAt);
  if (rt !== lt) return rt > lt;
  return (remote.deviceId ?? '') > (local.deviceId ?? '');
}

/**
 * Fusión registro a registro por identificador. Las eliminaciones viajan como
 * lápidas (deleted: true) para que un borrado en un dispositivo se propague al otro.
 */
/**
 * Configuración: es un solo registro, así que quedarse con el más nuevo entero perdía los cambios del otro equipo
 * (la plata en el celular y el PIN en la PC, por ejemplo). Si los dos anotan cuándo cambió cada ajuste, se toma
 * cada uno del que lo cambió último; si no, gana el registro más nuevo como siempre.
 */
export function mergeSettings(local: Settings, remote: Settings): Settings {
  const winner = remoteWins(local, remote) ? remote : local;
  const loser = winner === remote ? local : remote;
  if (!local.fieldStamps && !remote.fieldStamps) return winner;
  const out = { ...winner } as unknown as Record<string, unknown>;
  const stamps: Record<string, string> = { ...(loser.fieldStamps ?? {}), ...(winner.fieldStamps ?? {}) };
  const w = winner as unknown as Record<string, unknown>;
  const l = loser as unknown as Record<string, unknown>;
  for (const k of new Set([...Object.keys(w), ...Object.keys(l)])) {
    if (['id', 'createdAt', 'updatedAt', 'deviceId', 'deleted', 'fieldStamps'].includes(k)) continue;
    const sw = winner.fieldStamps?.[k] ?? '';
    const sl = loser.fieldStamps?.[k] ?? '';
    if (sl > sw) {
      if (k in l) out[k] = l[k];
      else delete out[k];
      stamps[k] = sl;
    }
  }
  out.fieldStamps = stamps;
  out.updatedAt = local.updatedAt > remote.updatedAt ? local.updatedAt : remote.updatedAt;
  return out as unknown as Settings;
}

export function mergeTable<T extends BaseRecord>(local: T[], remote: T[], mergeRecord?: (l: T, r: T) => T): { toPut: T[]; stats: MergeStats } {
  const byId = new Map(local.map((r) => [r.id, r]));
  const toPut: T[] = [];
  const stats: MergeStats = { added: 0, updated: 0, unchanged: 0, keptLocal: 0 };
  for (const r of remote) {
    const l = byId.get(r.id);
    if (!l) {
      toPut.push(r);
      stats.added++;
    } else if (l.updatedAt === r.updatedAt && (l.deviceId ?? '') === (r.deviceId ?? '')) {
      stats.unchanged++;
    } else if (mergeRecord) {
      const m = mergeRecord(l, r);
      if (JSON.stringify(m) === JSON.stringify(l)) stats.keptLocal++;
      else {
        toPut.push(m);
        stats.updated++;
      }
    } else if (remoteWins(l, r)) {
      toPut.push(r);
      stats.updated++;
    } else {
      stats.keptLocal++;
    }
  }
  return { toPut, stats };
}
