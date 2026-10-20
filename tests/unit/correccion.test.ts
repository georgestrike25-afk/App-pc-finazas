import { describe, expect, it } from 'vitest';
import { buildSchedule, installmentsDueBy, payNextInstallment, setPaidCount, undoLastPayment, obligationProgress } from '../../src/domain/obligations';
import { freshDb, obligation } from './helpers';
import { saveRecord, loadDataSet } from '../../src/db/repo';
import { applyStatementPayment } from '../../src/db/cardPayments';
import type { Obligation, Statement } from '../../src/domain/types';

const T = '2026-10-20T12:00:00Z';

function loan(): Obligation {
  // Préstamo ficticio de 12 cuotas mensuales que vencen el día 5; 7 pagadas según el cronograma.
  const dueDates: Record<number, string> = {};
  for (let n = 1; n <= 12; n++) dueDates[n] = `2026-${String(n + 2).padStart(2, '0')}-05`.replace('2026-13', '2027-01').replace('2026-14', '2027-02');
  return obligation({ type: 'prestamo', totalInstallments: 12, paidInstallments: 7, installmentAmount: 1000, nextDueMonth: '2026-10', dueDates });
}

describe('corrección de cuotas pagadas por error', () => {
  it('cuenta las cuotas vencidas hasta hoy', () => {
    const ob = loan();
    expect(installmentsDueBy(ob, '2026-10-20')).toBe(8); // la 8 venció el 05/10
    expect(installmentsDueBy(ob, '2026-10-04')).toBe(7);
  });

  it('marcar 6 cuotas de más y corregir a las vencidas', () => {
    let ob = loan();
    for (let i = 0; i < 6; i++) ob = payNextInstallment(ob, T);
    expect(ob.paidInstallments).toBe(12); // nunca más que el total
    const fixed = setPaidCount(ob, installmentsDueBy(ob, '2026-10-20'), T, 'Corrección: pagadas: 8');
    expect(fixed.paidInstallments).toBe(8);
    expect(fixed.status).toBe('pendiente');
    // El calendario no se corre: la cuota 9 sigue venciendo en noviembre
    const s = buildSchedule(fixed, '2026-10');
    expect(s.find((i) => i.n === 9)?.month).toBe('2026-11');
    expect(s.find((i) => i.n === 12)?.month).toBe('2027-02');
    expect(obligationProgress(fixed, '2026-10')).toMatchObject({ currentN: 9, remainingCount: 4 });
  });

  it('deshacer el último pago, varias veces', () => {
    let ob = loan();
    ob = payNextInstallment(ob, T);
    ob = payNextInstallment(ob, T);
    expect(ob.paidInstallments).toBe(9);
    ob = undoLastPayment(ob, T)!;
    expect(ob.paidInstallments).toBe(8);
    ob = undoLastPayment(ob, T)!;
    expect(ob.paidInstallments).toBe(7);
    expect(ob.nextDueMonth).toBe('2026-10');
  });

  it('pagar el resumen de la tarjeta marca pagadas las cuotas de ese resumen', async () => {
    const db = await freshDb();
    const card = await saveRecord<Obligation>('obligations', obligation({ entity: 'Visa Banco Patagonia', totalInstallments: 9, paidInstallments: 6, installmentAmount: 1000, nextDueMonth: '2026-10' }), 't', db);
    const lo = await saveRecord<Obligation>('obligations', { ...loan(), entity: 'Banco Patagonia' }, 't', db);
    const st = await saveRecord<Statement>('statements', { entity: 'Visa Banco Patagonia', month: '2026-10', total: 5000, currency: 'ARS' } as Statement, 't', db);
    // Pago parcial: no se asume nada
    await db.transaction('rw', db.obligations, () => applyStatementPayment(db, st, 4000, T));
    expect((await db.obligations.get(card.id))!.paidInstallments).toBe(6);
    await db.transaction('rw', db.obligations, () => applyStatementPayment(db, st, 5000, T));
    const data = await loadDataSet(db);
    expect(data.obligations.find((o) => o.id === card.id)!.paidInstallments).toBe(7);
    // Los préstamos (otro producto) no se tocan
    expect(data.obligations.find((o) => o.id === lo.id)!.paidInstallments).toBe(7);
  });
});
