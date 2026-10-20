import { describe, expect, it } from 'vitest';
import {
  applyStatementInstallment,
  buildSchedule,
  cancelObligation,
  computedBalance,
  findMatchingObligation,
  futureInstallmentCount,
  installmentsForMonth,
  payNextInstallment,
  reviseObligation,
} from '../../src/domain/obligations';
import { obligation } from './helpers';

const TODAY = '2026-10';

describe('motor de cuotas', () => {
  it('10 cuotas con 4 pagadas generan exactamente 6 cuotas futuras', () => {
    const ob = obligation({ totalInstallments: 10, paidInstallments: 4, installmentAmount: 1000000, nextDueMonth: '2026-10' });
    const sched = buildSchedule(ob, TODAY);
    expect(sched.filter((i) => i.status === 'pagada')).toHaveLength(4);
    const pending = sched.filter((i) => i.status === 'pendiente');
    expect(pending).toHaveLength(6);
    expect(pending.map((i) => i.n)).toEqual([5, 6, 7, 8, 9, 10]);
    expect(pending.map((i) => i.month)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect(futureInstallmentCount(ob, TODAY)).toBe(6);
    expect(computedBalance(ob, TODAY)).toEqual({ amount: 6000000, estimated: false, complete: true });
    // Ya no figura en abril 2027
    expect(installmentsForMonth([ob], '2027-04', TODAY)).toHaveLength(0);
  });

  it('marca estimadas las cuotas con importe variable y respeta importes específicos', () => {
    const ob = obligation({ totalInstallments: 3, installmentAmount: 1000, variableAmount: true, nextDueMonth: '2026-10', installmentOverrides: { 1: 1100 } });
    const s = buildSchedule(ob, TODAY);
    expect(s[0]).toMatchObject({ amount: 1100, estimated: false });
    expect(s[1]).toMatchObject({ amount: 1000, estimated: true });
  });

  it('sin total de cuotas solo proyecta la próxima y la marca estimada', () => {
    const ob = obligation({ installmentAmount: 5000, nextDueMonth: '2026-11', status: 'por_confirmar' });
    const s = buildSchedule(ob, TODAY);
    expect(s).toHaveLength(1);
    expect(s[0].estimated).toBe(true);
  });

  it('cancelación: elimina solo las cuotas desde el mes indicado', () => {
    const ob = obligation({ totalInstallments: 6, installmentAmount: 1000, nextDueMonth: '2026-09' });
    const c = cancelObligation(ob, '2026-12', '2026-10-15T00:00:00Z', TODAY);
    const s = buildSchedule(c, TODAY);
    expect(s.filter((i) => i.month < '2026-12').every((i) => i.status !== 'cancelada')).toBe(true);
    expect(s.filter((i) => i.month >= '2026-12').every((i) => i.status === 'cancelada')).toBe(true);
    expect(c.revisions).toHaveLength(1);
  });

  it('modificación: no altera silenciosamente los meses anteriores', () => {
    const ob = obligation({ totalInstallments: 6, installmentAmount: 1000, nextDueMonth: '2026-09' });
    const r = reviseObligation(ob, { installmentAmount: 1500 }, '2026-11', 'Ajuste', '2026-10-15T00:00:00Z', TODAY);
    const s = buildSchedule(r, TODAY);
    expect(s.find((i) => i.month === '2026-09')!.amount).toBe(1000);
    expect(s.find((i) => i.month === '2026-10')!.amount).toBe(1000);
    expect(s.find((i) => i.month === '2026-11')!.amount).toBe(1500);
    expect(r.revisions[0].snapshot.installmentAmount).toBe(1000);
  });

  it('cuota vencida y pago de cuota', () => {
    const ob = obligation({ totalInstallments: 2, installmentAmount: 1000, nextDueMonth: '2026-09' });
    expect(buildSchedule(ob, TODAY)[0].status).toBe('vencida');
    const p = payNextInstallment(ob, '2026-10-01T00:00:00Z');
    expect(p.paidInstallments).toBe(1);
    expect(p.nextDueMonth).toBe('2026-10');
    const p2 = payNextInstallment(p, '2026-10-02T00:00:00Z');
    expect(p2.status).toBe('pagada');
  });

  it('reconoce la misma compra en un resumen posterior sin duplicar cuotas', () => {
    // Importada desde el resumen de octubre: cuota 4/10 vence en 2026-10
    const ob = obligation({ entity: 'Visa Banco Patagonia', concept: 'MERCADOLIBRE*TIENDA', totalInstallments: 10, paidInstallments: 3, installmentAmount: 1200000, nextDueMonth: '2026-10' });
    const c = { entity: 'Visa Banco Patagonia', concept: 'MERCADOLIBRE*TIENDA', n: 5, total: 10, amount: 1200000, dueMonth: '2026-11' };
    expect(findMatchingObligation([ob], c)?.id).toBe(ob.id);
    expect(findMatchingObligation([ob], { ...c, total: 12 })).toBeUndefined();
    const upd = applyStatementInstallment(ob, c, '2026-11-05T00:00:00Z', false);
    expect(buildSchedule(upd, '2026-11').filter((i) => i.status !== 'pagada')).toHaveLength(7);
    const upd2 = applyStatementInstallment(ob, c, '2026-11-05T00:00:00Z', true);
    expect(upd2.paidInstallments).toBe(4);
    expect(buildSchedule(upd2, '2026-11').filter((i) => i.status === 'pendiente')).toHaveLength(6);
  });
});
