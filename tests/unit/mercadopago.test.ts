import { describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { detectMercadoPago } from '../../src/importers/mercadoPago';
import { buildMpReview, commitMpReview } from '../../src/importers/mpReview';
import { detectPaymentPlan } from '../../src/importers/paymentPlan';
import { buildPlanReview, commitPlanReview } from '../../src/importers/planReview';
import { repararDuplicados, saveRecord } from '../../src/db/repo';
import { debtPaymentExpense } from '../../src/domain/payments';
import { payNextInstallment } from '../../src/domain/obligations';
import type { Obligation } from '../../src/domain/types';
import { MP_CREDITOS, MP_PLAN, MP_TARJETA, asLines } from '../fixtures/mpScreens';

const FILE = { name: 'mp.mp4', size: 1, mime: 'video/mp4', kind: 'video' as const, hash: 'h' };

describe('pantallas de Mercado Pago (datos ficticios)', () => {
  it('lee los créditos y la tarjeta', () => {
    const c = detectMercadoPago(asLines(MP_CREDITOS), '2026-11-05')!;
    expect(c.credits.map((x) => [x.name, x.requestedOn, x.nextN, x.totalN, x.installment, x.remaining, x.due])).toEqual([
      ['Préstamo Personal', '2026-01-26', 11, 12, 40_000_00, 80_000_00, '2026-12-11'],
      ['Celular Moto G55 Azul', '2026-09-15', 3, 3, 20_000_00, 20_000_00, '2026-12-11'],
      ['Préstamo Personal', '2026-10-10', 2, 3, 100_000_00, 200_000_00, '2026-12-11'],
    ]);
    expect(c.warnings).toEqual([]);
    const t = detectMercadoPago(asLines(MP_TARJETA), '2026-11-05')!;
    expect(t.card).toEqual([
      { month: '2026-11', due: '2026-11-10', closing: '2026-11-05', total: 150_000_00, noCents: true },
      { month: '2026-12', due: '2026-12-10', closing: '2026-12-05', total: 80_000_00, noCents: true },
    ]);
    expect(detectMercadoPago(MP_PLAN.map((text) => ({ text })))).toBeNull();
  });

  it('corrige lo que tenía la app: créditos uno por uno, la tarjeta marcada por error y el pago del mes', async () => {
    const db = await freshDb();
    await commitPlanReview(await buildPlanReview(detectPaymentPlan(MP_PLAN.map((text) => ({ text })))!, { ...FILE, hash: 'plan' }, db), null, db);
    // Error: se marcó pagada la tarjeta de noviembre en vez de los préstamos.
    const tarjeta = (await db.obligations.toArray()).find((o) => /Tarjeta/.test(o.concept))!;
    await saveRecord<Obligation>('obligations', payNextInstallment(tarjeta, '2026-11-04T10:00:00Z'), 'pago', db);
    await saveRecord('expenses', debtPaymentExpense(`Cuota 1 de ${tarjeta.concept}`, 120_000_00, '2026-11-04', '2026-11-04T10:00:00Z'), 'pago', db);

    const r = await buildMpReview(detectMercadoPago(asLines([...MP_CREDITOS, ...MP_TARJETA]), '2026-11-05')!, FILE, '2026-11', db);
    expect(r.loansPlan?.month).toEqual({ amount: 160_000_00, paid: false });
    expect(r.card[0].before).toEqual({ amount: 120_000_00, paid: true });
    expect(r.unpaidInApp).toBe(160_000_00);
    await commitMpReview({ ...r, payMonth: true }, db);

    const obs = (await db.obligations.toArray()).filter((o) => !o.deleted);
    const credits = obs.filter((o) => o.fingerprint?.startsWith('mp|credito'));
    expect(credits.map((o) => [o.concept, o.paidInstallments, o.totalInstallments, o.nextDueMonth, o.type]).sort()).toEqual([
      ['Celular Moto G55 Azul', 2, 3, '2026-12', 'prestamo'],
      ['Préstamo Personal del 10/10/2026', 1, 3, '2026-12', 'prestamo'],
      ['Préstamo Personal del 26/01/2026', 10, 12, '2026-12', 'prestamo'],
    ]);
    expect(obs.find((o) => /Préstamos \(plan/.test(o.concept))!.cancelledFrom).toBe('2026-11');
    const t2 = obs.find((o) => o.id === tarjeta.id)!;
    expect([t2.paidInstallments, t2.nextDueMonth, t2.installmentOverrides?.[1], t2.installmentOverrides?.[2], t2.totalInstallments]).toEqual([0, '2026-11', 150_000_00, 80_000_00, 2]);
    const pagos = (await db.expenses.toArray()).filter((e) => !e.deleted).map((e) => [e.concept, e.totalAmount]);
    expect(pagos).toEqual([['Cuotas de los créditos de Mercado Pago (11/2026)', 160_000_00]]);

    // Subir el mismo video otra vez no duplica nada.
    const r2 = await buildMpReview(detectMercadoPago(asLines(MP_CREDITOS), '2026-11-05')!, FILE, '2026-11', db);
    expect(r2.credits.every((c) => c.existing && c.existing.paidInstallments === c.nextN - 1)).toBe(true);
    expect(r2.loansPlan).toBeUndefined();
    await commitMpReview(r2, db);
    await repararDuplicados(db);
    expect((await db.obligations.toArray()).filter((o) => !o.deleted && o.fingerprint?.startsWith('mp|credito'))).toHaveLength(3);
  });
});
