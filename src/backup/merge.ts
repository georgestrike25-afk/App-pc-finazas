import type { BaseRecord } from '../domain/types';

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
export function mergeTable<T extends BaseRecord>(local: T[], remote: T[]): { toPut: T[]; stats: MergeStats } {
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
    } else if (remoteWins(l, r)) {
      toPut.push(r);
      stats.updated++;
    } else {
      stats.keptLocal++;
    }
  }
  return { toPut, stats };
}
