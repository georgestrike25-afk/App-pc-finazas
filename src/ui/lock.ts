import { getDb } from '../db/db';
import { hashPin } from '../backup/crypto';

export interface LockConfig {
  salt: string;
  hash: string;
  timeoutMin: number;
}

export async function getLock(): Promise<LockConfig | null> {
  const row = await getDb().meta.get('lock');
  return (row?.value as LockConfig) ?? null;
}

export async function setLock(pin: string, timeoutMin: number) {
  if (!/^\d{4,12}$/.test(pin)) throw new Error('El PIN debe tener entre 4 y 12 dígitos.');
  const h = await hashPin(pin);
  await getDb().meta.put({ key: 'lock', value: { ...h, timeoutMin } satisfies LockConfig });
}

export async function clearLock() {
  await getDb().meta.delete('lock');
}

export async function verifyPin(pin: string): Promise<boolean> {
  const cfg = await getLock();
  if (!cfg) return true;
  const h = await hashPin(pin, cfg.salt);
  return h.hash === cfg.hash;
}
