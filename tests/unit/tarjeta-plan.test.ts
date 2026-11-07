import { describe, expect, it } from 'vitest';
import { freshDb, obligation } from './helpers';
import { loadDataSet, saveRecord } from '../../src/db/repo';
import { applyCardPlanPayment, payEntityMonth } from '../../src/db/cardPayments';
import { debtByEntity, monthToPay } from '../../src/domain/obligations';
import { cashStatus } from '../../src/domain/cash';
import type { Obligation } from '../../src/domain/types';

// Datos FICTICIOS: la tarjeta de Mercado Pago con su total por mes (plan) y las cuotas sueltas del último resumen.
async function setup() {
  const db = await freshDb();
  const T = '2026-11-01T00:00:00.000Z';
  const ob = (p: Partial<Obligation>) => saveRecord<Obligation>('obligations', obligation({ entity: 'Mercado Pago', createdAt: T, updatedAt: T, frequency: 'mensual', ...p }), 'alta', db);
  await ob({ concept: 'Mercado Pago · Tarjeta de crédito (plan de pagos)', type: 'compra_cuotas', fingerprint: 'plan|mercado pago|tarjeta', paidInstallments: 0, totalInstallments: 2, nextDueMonth: '2026-11', installmentAmount: 200_000_00, installmentOverrides: { 1: 200_000_00, 2: 100_000_00 } });
  await ob({ concept: 'MERPAGO*TIENDA', type: 'compra_cuotas', paidInstallments: 1, totalInstallments: 3, nextDueMonth: '2026-11', installmentAmount: 60_000_00 });
  await ob({ concept: 'MERPAGO*LIBROS', type: 'compra_cuotas', paidInstallments: 2, totalInstallments: 3, nextDueMonth: '2026-11', installmentAmount: 40_000_00 });
  await ob({ concept: 'Préstamo Personal', type: 'prestamo', paidInstallments: 1, totalInstallments: 3, nextDueMonth: '2026-11', installmentAmount: 50_000_00 });
  return db;
}

describe('tarjeta con su total del mes (plan) y cuotas sueltas (ficticio)', () => {
  it('no suma dos veces: el total de la tarjeta ya incluye sus cuotas', async () => {
    const db = await setup();
    const data = await loadDataSet(db);
    const debts = debtByEntity(data.obligations, '2026-11', data);
    const mp = monthToPay(debts, '2026-11', data.statements)[0];
    expect(mp.total).toBe(250_000_00);
    expect(mp.lines.find((l) => /plan/.test(l.label))!.detail).toMatch(/Incluye MERPAGO\*TIENDA 2\/3, MERPAGO\*LIBROS 3\/3/);
    // Diciembre: total del plan 100.000 (ya incluye TIENDA 3/3) + préstamo 50.000.
    expect(debts[0].byMonth['2026-12']).toBe(150_000_00);
  });

  it('el pago de la tarjeta deja el mes pagado; "Ya pagué todo" deja el mes en cero', async () => {
    const db = await setup();
    await db.transaction('rw', db.obligations, () => applyCardPlanPayment(db, 'Mercado Pago', '2026-11-06', 201_000_00, '2026-11-06T10:00:00.000Z'));
    let data = await loadDataSet(db);
    let mp = monthToPay(debtByEntity(data.obligations, '2026-11', data), '2026-11', data.statements)[0];
    expect(mp.lines.map((l) => l.label)).toEqual(['Préstamo Personal']);
    await payEntityMonth(db, mp, '2026-11-07', '2026-11-07T10:00:00.000Z');
    data = await loadDataSet(db);
    expect(monthToPay(debtByEntity(data.obligations, '2026-11', data), '2026-11', data.statements)).toEqual([]);
    // El préstamo pagado baja la plata hasta cobrar.
    const cash = cashStatus({ ...data, settings: { ...data.settings, cash: { amount: 1_000_000_00, setAt: '2026-11-05T00:00:00.000Z' } } }, '2026-11-07')!;
    expect(cash.left).toBe(950_000_00);
  });
});
