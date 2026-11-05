import { getDb, type FinanzasDB } from './db';
import { defaultGoal, defaultSettings, GOAL_ID, SETTINGS_ID } from './defaults';
import { uid } from '../domain/text';
import { couponMerges } from '../domain/sancor';
import { entityGroup, expenseCardEntity, samePlan } from '../domain/obligations';
import type { DataSet } from '../domain/monthly';
import type { AuditEntry, BaseRecord, Obligation, SavingsGoal, Settings, SyncTable } from '../domain/types';

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
  await repararDuplicados(db);
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

const EDITADO_MS = 2000;
const fueEditado = (r: BaseRecord) => Date.parse(r.updatedAt) - Date.parse(r.createdAt) > EDITADO_MS;
const porAntiguedad = (a: BaseRecord, b: BaseRecord) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * De varias copias del mismo registro, cuál se conserva: la editada más reciente (tiene lo último que
 * se hizo) y, si ninguna se tocó, la más antigua. La regla es la misma en todos los dispositivos,
 * así que dos aparatos que se sincronizan eligen la misma.
 */
function elegirCopia<T extends BaseRecord>(copias: T[]): T {
  const editadas = copias.filter(fueEditado);
  if (editadas.length) return [...editadas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || porAntiguedad(a, b))[0];
  return [...copias].sort(porAntiguedad)[0];
}

/**
 * Cuando el mismo resumen, préstamo o plan se sube en dos dispositivos antes de sincronizarlos,
 * cada uno lo guarda con registros propios y al juntarlos queda todo duplicado (préstamos, cuotas,
 * gastos y pagos de ese documento). Acá se deja una sola copia:
 * - documentos con el mismo contenido (mismo hash): se conserva uno y se marcan como eliminados los
 *   registros importados de los otros (gastos manuales y cargos de Sancor con reintegros no se tocan);
 * - préstamos y cuotas con la misma huella: se conserva uno.
 * Nada se borra de verdad: quedan marcados como eliminados (y esa marca viaja al otro dispositivo).
 * Devuelve cuántos registros se quitaron.
 */
export async function repararDuplicados(db: FinanzasDB = getDb()): Promise<number> {
  const [docs, expenses, obligations, statements, cardPayments, sancor, fingerprints] = await Promise.all([
    db.documents.toArray(),
    db.expenses.toArray(),
    db.obligations.toArray(),
    db.statements.toArray(),
    db.cardPayments.toArray(),
    db.sancor.toArray(),
    db.fingerprints.toArray(),
  ]);
  const vivos = <T extends BaseRecord>(l: T[]) => l.filter((r) => !r.deleted);
  const quitar = { documents: new Set<string>(), expenses: new Set<string>(), obligations: new Set<string>(), statements: new Set<string>(), cardPayments: new Set<string>(), sancor: new Set<string>(), fingerprints: new Set<string>() };

  // 1. El mismo documento subido dos veces (en dos dispositivos).
  const porHash = new Map<string, typeof docs>();
  for (const d of vivos(docs)) if (d.hash) porHash.set(d.hash, [...(porHash.get(d.hash) ?? []), d]);
  const hijos = (docId: string) => ({
    expenses: vivos(expenses).filter((e) => e.documentId === docId && e.source === 'importado'),
    obligations: vivos(obligations).filter((o) => o.documentId === docId),
    statements: vivos(statements).filter((s) => s.documentId === docId),
    // Los pagos de resumen no guardan su documento: se reconocen por la huella de su línea.
    cardPayments: vivos(cardPayments).filter((p) => vivos(fingerprints).some((f) => f.documentId === docId && f.targetType === 'pago' && f.targetId === p.id)),
    sancor: vivos(sancor).filter((c) => c.documentId === docId && c.received.length === 0),
    fingerprints: vivos(fingerprints).filter((f) => f.documentId === docId),
  });
  for (const grupo of porHash.values()) {
    if (grupo.length < 2) continue;
    // Cada documento se representa con lo último que se tocó en sus registros: gana el más trabajado.
    const repres = grupo.map((d) => {
      const h = hijos(d.id);
      const todos: BaseRecord[] = [...h.expenses, ...h.obligations, ...h.statements, ...h.cardPayments, ...h.sancor];
      const editado = todos.some(fueEditado);
      const ultima = todos.reduce((m, r) => (r.updatedAt > m ? r.updatedAt : m), d.createdAt);
      return { id: d.id, createdAt: d.createdAt, updatedAt: editado ? ultima : d.createdAt };
    });
    const conserva = elegirCopia(repres).id;
    for (const d of grupo) {
      if (d.id === conserva) continue;
      const h = hijos(d.id);
      quitar.documents.add(d.id);
      for (const k of Object.keys(h) as Array<keyof typeof h>) for (const r of h[k]) quitar[k].add(r.id);
    }
  }

  // 2. La misma compra en cuotas o el mismo préstamo cargado dos veces (misma huella, o el resumen de
  //    un mes y el del siguiente que no se reconocieron entre sí): queda el más avanzado.
  const obs = vivos(obligations).filter((o) => !quitar.obligations.has(o.id));
  const raiz = new Map(obs.map((o) => [o.id, o.id]));
  const buscar = (id: string): string => (raiz.get(id) === id ? id : buscar(raiz.get(id)!));
  for (let i = 0; i < obs.length; i++)
    for (let j = i + 1; j < obs.length; j++) {
      const a = obs[i];
      const b = obs[j];
      if ((a.fingerprint && a.fingerprint === b.fingerprint && a.documentId !== b.documentId) || samePlan(a, b)) raiz.set(buscar(b.id), buscar(a.id));
    }
  const grupos = new Map<string, Obligation[]>();
  for (const o of obs) grupos.set(buscar(o.id), [...(grupos.get(buscar(o.id)) ?? []), o]);
  const reemplazo = new Map<string, string>();
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    const max = Math.max(...grupo.map((o) => o.paidInstallments));
    const conserva = elegirCopia(grupo.filter((o) => o.paidInstallments === max)).id;
    for (const o of grupo)
      if (o.id !== conserva) {
        quitar.obligations.add(o.id);
        reemplazo.set(o.id, conserva);
      }
  }
  // Las huellas de las líneas que apuntaban a la copia quitada pasan a la que queda.
  const huellasMovidas = vivos(fingerprints).filter((f) => f.targetType === 'cuota' && f.targetId && reemplazo.has(f.targetId) && !quitar.fingerprints.has(f.id));

  // 3. El mismo resumen de tarjeta (misma entidad, mes y total) cargado dos veces.
  const porResumen = new Map<string, typeof statements>();
  for (const st of vivos(statements)) {
    if (quitar.statements.has(st.id)) continue;
    const k = `${entityGroup(st.entity)}|${st.month}|${st.total}`;
    porResumen.set(k, [...(porResumen.get(k) ?? []), st]);
  }
  for (const grupo of porResumen.values()) {
    if (grupo.length < 2) continue;
    const conserva = elegirCopia(grupo).id;
    for (const st of grupo) if (st.id !== conserva) quitar.statements.add(st.id);
  }

  // 4. Consumos provisorios (vistos en la app de la tarjeta) que ya vinieron en un resumen: sobran.
  const confirmados = vivos(expenses).filter((e) => !e.provisional && !quitar.expenses.has(e.id) && e.paymentMethod === 'tarjeta');
  const usados = new Set<string>();
  for (const p of vivos(expenses).filter((e) => e.provisional && !quitar.expenses.has(e.id))) {
    const grupo = expenseCardEntity(p);
    const igual = confirmados.find(
      (e) =>
        !usados.has(e.id) &&
        Math.abs(e.totalAmount) === Math.abs(p.totalAmount) &&
        Math.abs(Date.parse(e.date) - Date.parse(p.date)) <= 3 * 86400000 &&
        (!grupo || !expenseCardEntity(e) || entityGroup(expenseCardEntity(e)!) === entityGroup(grupo)),
    );
    if (!igual) continue;
    usados.add(igual.id);
    quitar.expenses.add(p.id);
    for (const f of vivos(fingerprints)) if (f.targetId === p.id) quitar.fingerprints.add(f.id);
  }

  // 5. Gastos anotados dos veces desde el mismo aviso (misma app, mismo momento exacto y mismo importe).
  const porAviso = new Map<string, typeof expenses>();
  for (const e of vivos(expenses)) {
    if (e.importedFrom !== 'notificacion' || quitar.expenses.has(e.id)) continue;
    const k = (e.linkedLineFingerprints ?? []).find((f) => f.startsWith('notif|'));
    if (k) porAviso.set(k, [...(porAviso.get(k) ?? []), e]);
  }
  for (const grupo of porAviso.values()) {
    if (grupo.length < 2) continue;
    const conserva = elegirCopia(grupo).id;
    for (const e of grupo) if (e.id !== conserva) quitar.expenses.add(e.id);
  }

  const total = quitar.expenses.size + quitar.obligations.size + quitar.statements.size + quitar.cardPayments.size + quitar.sancor.size;
  if (!total && !quitar.documents.size) return 0;
  const deviceId = await getDeviceId(db);
  const ahora = nowIso();
  await db.transaction('rw', [db.documents, db.expenses, db.obligations, db.statements, db.cardPayments, db.sancor, db.fingerprints, db.audit], async () => {
    const marcar = async <T extends BaseRecord>(tabla: { put(r: T): Promise<unknown> }, lista: T[], ids: Set<string>) => {
      for (const r of lista) if (ids.has(r.id)) await tabla.put({ ...r, deleted: true, updatedAt: ahora, deviceId });
    };
    await marcar(db.documents, docs, quitar.documents);
    await marcar(db.expenses, expenses, quitar.expenses);
    await marcar(db.obligations, obligations, quitar.obligations);
    await marcar(db.statements, statements, quitar.statements);
    await marcar(db.cardPayments, cardPayments, quitar.cardPayments);
    await marcar(db.sancor, sancor, quitar.sancor);
    await marcar(db.fingerprints, fingerprints, quitar.fingerprints);
    for (const f of huellasMovidas) await db.fingerprints.put({ ...f, targetId: reemplazo.get(f.targetId!)!, updatedAt: ahora, deviceId });
    await addAudit(db, 'eliminar', 'duplicados', undefined, `Se quitaron ${total} registro(s) duplicados (documentos, préstamos, cuotas, consumos o avisos cargados dos veces)`, deviceId);
  });
  return total;
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
  if (name === 'obligations' && existing) await dropUndonePayments(existing as unknown as Obligation, full as unknown as Obligation, db);
  notify();
  return full;
}

/**
 * Si se corrigió una deuda a menos cuotas pagadas (Deshacer, Corregir, Editar), los pagos "Cuota N de …" que había
 * generado "Ya la pagué" (o el débito del banco) para las cuotas que ya no cuentan como pagadas se eliminan:
 * si no, la plata hasta cobrar seguiría descontando un pago que no se hizo.
 */
export async function dropUndonePayments(before: Obligation, after: Obligation, db: FinanzasDB = getDb()) {
  if (after.paidInstallments >= before.paidInstallments) return;
  const concepts = new Set([before.concept, after.concept]);
  const stale = (await db.expenses.toArray()).filter((e) => {
    if (e.deleted || !e.cashOnly || e.settlement) return false;
    const m = e.concept.match(/^Cuota (\d+) de (.+)$/);
    return !!m && concepts.has(m[2]) && Number(m[1]) > after.paidInstallments && Number(m[1]) <= before.paidInstallments;
  });
  for (const e of stale) await softDelete('expenses', e.id, `Se deshizo el pago "${e.concept}" (vuelve a la plata hasta cobrar)`, db);
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
