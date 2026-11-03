import { getDb, type FinanzasDB } from './db';
import { defaultGoal, defaultSettings, GOAL_ID, SETTINGS_ID } from './defaults';
import { uid } from '../domain/text';
import { couponMerges } from '../domain/sancor';
import type { DataSet } from '../domain/monthly';
import type { AuditEntry, BaseRecord, SavingsGoal, Settings, SyncTable } from '../domain/types';

type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function notify() {
  for (const l of listeners) l();
}

export function nowIso() {
  return new Date().toISOString();
}

export async function getDeviceId(db: FinanzasDB = getDb()): Promise<string> {
  const row = await db.meta.get('deviceId');
  if (row) return row.value as string;
  const id = uid();
  await db.meta.put({ key: 'deviceId', value: id });
  return id;
}

/** Crea la configuración y el objetivo vacíos la primera vez. No crea datos financieros. */
export async function ensureInitialized(db: FinanzasDB = getDb()): Promise<void> {
  const now = nowIso();
  await db.transaction('rw', db.settings, db.goals, db.meta, async () => {
    if (!(await db.settings.get(SETTINGS_ID))) await db.settings.put(defaultSettings(now));
    if (!(await db.goals.get(GOAL_ID))) await db.goals.put(defaultGoal(now));
  });
  await getDeviceId(db);
  await mergeSancorCoupons(db);
}

/** Une los cupones de Sancor de un mismo resumen que se guardaron como cargos separados. */
export async function mergeSancorCoupons(db: FinanzasDB = getDb()): Promise<number> {
  const merges = couponMerges(await db.sancor.toArray());
  if (!merges.length) return 0;
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  await db.transaction('rw', db.sancor, db.fingerprints, async () => {
    for (const m of merges) {
      await db.sancor.put({ ...m.merged, updatedAt: now, deviceId });
      for (const r of m.remove) {
        await db.sancor.put({ ...r, deleted: true, updatedAt: now, deviceId });
        const fps = await db.fingerprints.filter((f) => f.targetType === 'sancor' && f.targetId === r.id).toArray();
        for (const f of fps) await db.fingerprints.put({ ...f, targetId: m.keep.id, updatedAt: now, deviceId });
      }
    }
  });
  return merges.length;
}

function table(db: FinanzasDB, name: SyncTable) {
  return db.table(name);
}

/** Guarda un registro sincronizable y deja constancia en el historial. */
export async function saveRecord<T extends BaseRecord>(
  name: SyncTable,
  rec: Omit<T, 'createdAt' | 'updatedAt' | 'id'> & Partial<BaseRecord>,
  summary: string,
  db: FinanzasDB = getDb(),
): Promise<T> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const existing = rec.id ? await table(db, name).get(rec.id) : undefined;
  const full = {
    ...rec,
    id: rec.id ?? uid(),
    createdAt: existing?.createdAt ?? rec.createdAt ?? now,
    updatedAt: now,
    deviceId,
  } as unknown as T;
  await db.transaction('rw', [table(db, name), db.audit], async () => {
    await table(db, name).put(full);
    if (name !== 'audit') await addAudit(db, existing ? 'modificar' : 'crear', name, full.id, summary, deviceId);
  });
  notify();
  return full;
}

export async function softDelete(name: SyncTable, id: string, summary: string, db: FinanzasDB = getDb()) {
  const deviceId = await getDeviceId(db);
  const rec = await table(db, name).get(id);
  if (!rec) return;
  await db.transaction('rw', [table(db, name), db.audit, db.blobs], async () => {
    await table(db, name).put({ ...rec, deleted: true, updatedAt: nowIso(), deviceId });
    if (name === 'documents') await db.blobs.delete(id);
    await addAudit(db, 'eliminar', name, id, summary, deviceId);
  });
  notify();
}

export async function addAudit(
  db: FinanzasDB,
  action: AuditEntry['action'],
  entity: string,
  entityId: string | undefined,
  summary: string,
  deviceId?: string,
) {
  const now = nowIso();
  await db.audit.put({ id: uid(), createdAt: now, updatedAt: now, at: now, action, entity, entityId, summary, deviceId });
}

export async function getSettings(db: FinanzasDB = getDb()): Promise<Settings> {
  return (await db.settings.get(SETTINGS_ID)) ?? defaultSettings(nowIso());
}

export async function getGoal(db: FinanzasDB = getDb()): Promise<SavingsGoal> {
  return (await db.goals.get(GOAL_ID)) ?? defaultGoal(nowIso());
}

const live = <T extends BaseRecord>(xs: T[]) => xs.filter((x) => !x.deleted);

export async function loadDataSet(db: FinanzasDB = getDb()): Promise<DataSet> {
  const [incomes, expenses, obligations, statements, cardPayments, sancor, settings] = await Promise.all([
    db.incomes.toArray(),
    db.expenses.toArray(),
    db.obligations.toArray(),
    db.statements.toArray(),
    db.cardPayments.toArray(),
    db.sancor.toArray(),
    getSettings(db),
  ]);
  return {
    incomes: live(incomes),
    expenses: live(expenses),
    obligations: live(obligations),
    statements: live(statements),
    cardPayments: live(cardPayments),
    sancor: live(sancor),
    settings,
  };
}

/** Borra TODOS los datos locales (requiere confirmación en la interfaz). */
export async function wipeAll(db: FinanzasDB = getDb()) {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) if (t.name !== 'meta') await t.clear();
  });
  await ensureInitialized(db);
  notify();
}
