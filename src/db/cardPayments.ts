import type { FinanzasDB } from './db';
import { buildSchedule, markPaidThrough } from '../domain/obligations';
import type { Statement } from '../domain/types';

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
