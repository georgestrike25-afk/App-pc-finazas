import { describe, expect, it } from 'vitest';
import { freshDb, obligation } from './helpers';
import { saveRecord } from '../../src/db/repo';
import { debtPaymentExpense } from '../../src/domain/payments';
import { payNextInstallment, undoLastPayment, setPaidCount } from '../../src/domain/obligations';
import type { Obligation } from '../../src/domain/types';

describe('deshacer el pago de una cuota', () => {
  it('borra el pago que había bajado la plata hasta cobrar', async () => {
    const db = await freshDb();
    const now = '2026-11-05T12:00:00.000Z';
    let ob = obligation({ concept: 'Mercado Pago · Préstamos (plan de pagos)', entity: 'Mercado Pago', paidInstallments: 2, totalInstallments: 6, nextDueMonth: '2026-11', installmentAmount: 1_000_00 });
    await saveRecord<Obligation>('obligations', ob, 'alta', db);
    // "Ya la pagué" en Este mes: cuota 3 + su pago
    ob = await saveRecord<Obligation>('obligations', payNextInstallment(ob, now), 'pago', db);
    await saveRecord('expenses', debtPaymentExpense(`Cuota 3 de ${ob.concept}`, 1_000_00, '2026-11-05', now), 'pago', db);
    // otro pago, de otra deuda, no se toca
    await saveRecord('expenses', debtPaymentExpense('Cuota 3 de Otra deuda', 500_00, '2026-11-05', now), 'pago', db);
    expect(ob.paidInstallments).toBe(3);

    await saveRecord<Obligation>('obligations', undoLastPayment(ob, now)!, 'deshacer', db);
    const vivos = (await db.expenses.toArray()).filter((e) => !e.deleted).map((e) => e.concept);
    expect(vivos).toEqual(['Cuota 3 de Otra deuda']);
  });

  it('corregir a menos cuotas borra solo los pagos de las cuotas que dejan de estar pagadas', async () => {
    const db = await freshDb();
    const now = '2026-11-05T12:00:00.000Z';
    const ob = obligation({ concept: 'Préstamo X', paidInstallments: 5, totalInstallments: 6, nextDueMonth: '2026-12', installmentAmount: 1_000_00 });
    await saveRecord<Obligation>('obligations', ob, 'alta', db);
    for (const n of [4, 5]) await saveRecord('expenses', debtPaymentExpense(`Cuota ${n} de Préstamo X`, 1_000_00, '2026-11-01', now), 'pago', db);
    await saveRecord<Obligation>('obligations', setPaidCount(ob, 4, now, 'corrección'), 'corregir', db);
    const vivos = (await db.expenses.toArray()).filter((e) => !e.deleted).map((e) => e.concept);
    expect(vivos).toEqual(['Cuota 4 de Préstamo X']);
  });
});
