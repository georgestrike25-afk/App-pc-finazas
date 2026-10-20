import { describe, expect, it, beforeEach } from 'vitest';
import { freshDb, obligation } from './helpers';
import { detectPaymentPlan } from '../../src/importers/paymentPlan';
import { buildPlanReview, commitPlanReview } from '../../src/importers/planReview';
import { parseStatementText } from '../../src/importers/statementParser';
import { detectLoanSchedule } from '../../src/importers/loanSchedule';
import { loadDataSet, saveRecord } from '../../src/db/repo';
import { debtByEntity, entityGroup } from '../../src/domain/obligations';
import { computeMonth } from '../../src/domain/monthly';
import type { FinanzasDB } from '../../src/db/db';
import type { Obligation } from '../../src/domain/types';

/** Texto de un plan de pagos FICTICIO con el formato de Mercado Pago. */
const PLAN = (first = 'NOVIEMBRE 2026') =>
  [
    'Mercado pago',
    'PLAN DE PAGOS ESTIMADO Moneda: pesos',
    'argentinos',
    ...(first === 'NOVIEMBRE 2026' ? ['NOVIEMBRE 2026 Tarjeta: $100.000,00', 'Préstamos: $50.000,00 Total del mes:', '$150.000,00'] : []),
    'DICIEMBRE 2026 Tarjeta: $40.000,00',
    'Préstamos: $50.000,00 Total del mes:',
    '$90.000,00',
    'ENERO 2027 Tarjeta: $0,00 Préstamos:',
    '$30.000,00 Total del mes: $30.000,00',
    `TOTAL DEL PLAN: ${first === 'NOVIEMBRE 2026' ? '$270.000,00' : '$120.000,00'}`,
    'Es una proyección y no incluye nuevos consumos ni créditos.',
  ].map((text) => ({ text }));

describe('planes de pago (Mercado Pago, datos ficticios)', () => {
  let db: FinanzasDB;
  beforeEach(async () => {
    db = await freshDb();
  });

  it('lee los meses, los conceptos y verifica el total', () => {
    const p = detectPaymentPlan(PLAN())!;
    expect(p.entity).toBe('Mercado Pago');
    expect(p.categories).toEqual(['Tarjeta', 'Préstamos']);
    expect(p.months).toEqual([
      { month: '2026-11', parts: { Tarjeta: 10000000, Préstamos: 5000000 }, total: 15000000 },
      { month: '2026-12', parts: { Tarjeta: 4000000, Préstamos: 5000000 }, total: 9000000 },
      { month: '2027-01', parts: { Tarjeta: 0, Préstamos: 3000000 }, total: 3000000 },
    ]);
    expect(p.declaredTotal).toBe(27000000);
    expect(p.computedTotal).toBe(27000000);
    expect(p.warnings.join(' ')).toMatch(/proyecci/);
    // No se confunde con otros formatos
    expect(detectLoanSchedule(PLAN())).toBeNull();
    expect(detectPaymentPlan([{ text: '05/09/26 COTO 1.234,56' }])).toBeNull();
  });

  it('crea una deuda por concepto con su importe por mes', async () => {
    await commitPlanReview(await buildPlanReview(detectPaymentPlan(PLAN())!, { name: 'mp.pdf', size: 1, mime: 'application/pdf', kind: 'pdf', hash: 'h1' }, db), null, db);
    const data = await loadDataSet(db);
    expect(data.obligations).toHaveLength(2);
    const card = data.obligations.find((o) => o.type === 'compra_cuotas')!;
    const loan = data.obligations.find((o) => o.type === 'prestamo')!;
    expect(card).toMatchObject({ totalInstallments: 2, nextDueMonth: '2026-11', entity: 'Mercado Pago' });
    expect(loan).toMatchObject({ totalInstallments: 3 });
    expect(computeMonth(data, '2026-11', '2026-10').sections.find((s) => s.key === 'obligaciones')!.total).toBe(15000000);
    expect(computeMonth(data, '2027-01', '2026-10').sections.find((s) => s.key === 'obligaciones')!.total).toBe(3000000);
  });

  it('un plan nuevo actualiza las mismas deudas (lo anterior queda pagado)', async () => {
    await commitPlanReview(await buildPlanReview(detectPaymentPlan(PLAN())!, { name: 'a.pdf', size: 1, mime: 'application/pdf', kind: 'pdf', hash: 'a' }, db), null, db);
    const r2 = await buildPlanReview(detectPaymentPlan(PLAN('DICIEMBRE 2026'))!, { name: 'b.pdf', size: 1, mime: 'application/pdf', kind: 'pdf', hash: 'b' }, db);
    expect(r2.categories.every((c) => c.existing)).toBe(true);
    await commitPlanReview(r2, null, db);
    const data = await loadDataSet(db);
    expect(data.obligations).toHaveLength(2);
    const loan = data.obligations.find((o) => o.type === 'prestamo')!;
    expect(loan).toMatchObject({ paidInstallments: 1, totalInstallments: 3, nextDueMonth: '2026-12' });
    const d = debtByEntity(data.obligations, '2026-12');
    expect(d[0]).toMatchObject({ group: 'Mercado Pago', remaining: 12000000, lastMonth: '2027-01' });
  });

  it('agrupa la deuda por entidad', async () => {
    await saveRecord<Obligation>('obligations', obligation({ entity: 'Visa Banco Patagonia', totalInstallments: 3, paidInstallments: 1, installmentAmount: 1000, nextDueMonth: '2026-11' }), 't', db);
    await saveRecord<Obligation>('obligations', obligation({ entity: 'Banco Patagonia', type: 'prestamo', totalInstallments: 2, installmentAmount: 5000, nextDueMonth: '2026-11' }), 't', db);
    await saveRecord<Obligation>('obligations', obligation({ entity: 'Naranja X', totalInstallments: 1, installmentAmount: 700, nextDueMonth: '2027-03' }), 't', db);
    const d = debtByEntity((await loadDataSet(db)).obligations, '2026-10');
    expect(d.map((x) => [x.group, x.remaining, x.lastMonth, x.items.length])).toEqual([
      ['Banco Patagonia', 12000, '2026-12', 2],
      ['Naranja X', 700, '2027-03', 1],
    ]);
    expect(entityGroup('Mercado Crédito')).toBe('Mercado Pago');
    expect(entityGroup('Ualá')).toBe('Ualá');
    expect(parseStatementText(PLAN()).items).toHaveLength(0);
  });
});
