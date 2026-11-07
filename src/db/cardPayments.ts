import type { FinanzasDB } from './db';
import { buildSchedule, entityGroup, isCardPlan, markPaidThrough, type EntityMonthPay } from '../domain/obligations';
import { debtPaymentExpense } from '../domain/payments';
import { monthOf } from '../domain/dates';
import type { CardPayment, Statement } from '../domain/types';

/**
 * Al pagar el total de un resumen de tarjeta, las cuotas de esa tarjeta que vencían en
 * ese resumen quedan pagadas (no hace falta tocar "Pagar cuota" en cada una).
 * Debe llamarse dentro de una transacción que incluya db.obligations.
 */
export async function applyStatementPayment(db: FinanzasDB, st: Statement, paidAmount: number, nowIso: string, deviceId?: string): Promise<number> {
  if (st.total !== undefined && paidAmount < st.total) return 0; // pago parcial: no se asume qué cuotas cubrió
  let n = 0;
  for (const ob of await db.obligations.toArray()) {
    if (ob.deleted || ob.type === 'prestamo' || ob.entity !== st.entity) continue;
    const inst = buildSchedule(ob, st.month).find((i) => i.month === st.month && (i.status === 'pendiente' || i.status === 'vencida'));
    if (!inst) continue;
    await db.obligations.put({ ...markPaidThrough(ob, inst.n, nowIso, `Pago de cuota ${inst.n} con el resumen de ${st.month}`), deviceId });
    n++;
  }
  return n;
}

/** "Ya lo pagué": registra el pago total de un resumen hoy y marca pagadas sus cuotas. */
export async function markStatementPaid(db: FinanzasDB, st: Statement, dateIso: string, nowIso: string): Promise<void> {
  const { uid } = await import('../domain/text');
  await db.transaction('rw', [db.cardPayments, db.obligations, db.audit], async () => {
    await db.cardPayments.put({ id: uid(), createdAt: nowIso, updatedAt: nowIso, entity: st.entity, statementId: st.id, date: dateIso, month: dateIso.slice(0, 7), amount: st.total ?? 0, source: 'manual' });
    await applyStatementPayment(db, st, st.total ?? 0, nowIso);
    await db.audit.put({ id: uid(), createdAt: nowIso, updatedAt: nowIso, at: nowIso, action: 'crear', entity: 'cardPayments', summary: `Resumen de ${st.entity} marcado como pagado` });
  });
}

/**
 * Un pago de la tarjeta (importado o a mano) sin resumen cargado: si la tarjeta tiene su total del mes
 * (plan de pagos / "Tu total hasta hoy"), esa cuota y las anteriores quedan pagadas, junto con las cuotas
 * de la tarjeta que ese total incluía. Solo si el pago cubre el total del mes. Dentro de una transacción con db.obligations.
 */
export async function applyCardPlanPayment(db: FinanzasDB, entity: string, dateIso: string, amount: number, nowIso: string, deviceId?: string): Promise<number> {
  const g = entityGroup(entity);
  const month = monthOf(dateIso);
  const obs = (await db.obligations.toArray()).filter((o) => !o.deleted && o.status !== 'cancelada' && entityGroup(o.entity) === g);
  const plan = obs.find(isCardPlan);
  if (!plan) return 0;
  // La cuota del plan que se paga: la del mes del pago o, si ya pasó, la primera pendiente hasta ese mes.
  const inst = buildSchedule(plan, month).filter((i) => (i.status === 'pendiente' || i.status === 'vencida') && i.month <= month).at(-1);
  if (!inst || amount < (inst.amount ?? 0) * 0.98) return 0;
  await db.obligations.put({ ...markPaidThrough(plan, inst.n, nowIso, `Pago de la tarjeta del ${dateIso.split('-').reverse().join('/')}`), deviceId });
  let n = 1;
  for (const ob of obs) {
    if (ob === plan || ob.type === 'prestamo') continue;
    const k = buildSchedule(ob, month).filter((i) => (i.status === 'pendiente' || i.status === 'vencida') && i.month <= inst.month).at(-1);
    if (!k) continue;
    await db.obligations.put({ ...markPaidThrough(ob, k.n, nowIso, `Incluida en el pago de la tarjeta del ${dateIso.split('-').reverse().join('/')}`), deviceId });
    n++;
  }
  return n;
}

/**
 * "Ya pagué todo" de una entidad en "Este mes pagás": cada resumen queda pagado (pago de tarjeta), y cada cuota
 * pagada; lo de la tarjeta se anota como pago de tarjeta y cada préstamo como pago de cuota. Todo baja la plata hasta cobrar.
 */
export async function payEntityMonth(db: FinanzasDB, pay: EntityMonthPay, dateIso: string, nowIso: string, deviceId?: string): Promise<void> {
  const { uid } = await import('../domain/text');
  await db.transaction('rw', [db.cardPayments, db.obligations, db.expenses, db.statements, db.audit], async () => {
    for (const l of pay.lines) {
      if (!l.pays || l.amount <= 0) continue;
      if (l.pays.statementId) {
        const st = await db.statements.get(l.pays.statementId);
        if (!st) continue;
        await db.cardPayments.put({ id: uid(), createdAt: nowIso, updatedAt: nowIso, deviceId, entity: st.entity, statementId: st.id, date: dateIso, month: monthOf(dateIso), amount: l.amount, source: 'manual', notes: 'Ya pagué todo (Este mes pagás)' } as CardPayment);
        await applyStatementPayment(db, st, st.total ?? 0, nowIso, deviceId);
        continue;
      }
      for (const it of l.pays.installments ?? []) {
        const ob = await db.obligations.get(it.obligationId);
        if (!ob || ob.deleted) continue;
        await db.obligations.put({ ...markPaidThrough(ob, it.n, nowIso, 'Ya pagué todo (Este mes pagás)'), deviceId });
        // Préstamo: el mismo pago que "Ya la pagué" (Deshacer lo saca).
        if (!l.pays.card) await db.expenses.put(debtPaymentExpense(`Cuota ${it.n} de ${ob.concept}`, l.amount, dateIso, nowIso, deviceId));
      }
      if (l.pays.card) await db.cardPayments.put({ id: uid(), createdAt: nowIso, updatedAt: nowIso, deviceId, entity: pay.group, date: dateIso, month: monthOf(dateIso), amount: l.amount, source: 'manual', notes: `Ya pagué todo: ${l.label}` } as CardPayment);
    }
    await db.audit.put({ id: uid(), createdAt: nowIso, updatedAt: nowIso, at: nowIso, action: 'crear', entity: 'cardPayments', summary: `${pay.group}: todo lo del mes marcado como pagado` });
  });
}
